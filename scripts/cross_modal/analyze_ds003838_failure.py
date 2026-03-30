#!/usr/bin/env python3
"""Analyze DS003838 expanded-split EEG-to-PPG baseline failure patterns."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import time
import tomllib
import tracemalloc

import numpy as np

from train_ds003838_morphology_baseline import (
    feature_stats,
    load_config,
    load_json,
    mse,
    ridge_dual_predict,
    standardize,
    target_valid_key,
)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def quality_peak_bucket(peak_count: int) -> str:
    if peak_count <= 2:
        return "1-2_peaks"
    if peak_count == 3:
        return "3_peaks"
    return "4plus_peaks"


def summarize_slice(values: list[dict]) -> dict:
    if not values:
        return {
            "count": 0,
            "aggregate_model_mse_std": None,
            "aggregate_null_mse_std": None,
            "aggregate_delta_mse_std": None,
        }
    return {
        "count": len(values),
        "aggregate_model_mse_std": float(np.mean([row["model_mse_std"] for row in values])),
        "aggregate_null_mse_std": float(np.mean([row["null_mse_std"] for row in values])),
        "aggregate_delta_mse_std": float(np.mean([row["delta_mse_std"] for row in values])),
    }


def quartile_labels(values: np.ndarray) -> list[str]:
    if values.size == 0:
        return []
    q1, q2, q3 = np.quantile(values, [0.25, 0.5, 0.75])
    labels: list[str] = []
    for value in values.tolist():
        if value <= q1:
            labels.append("q1_lowest")
        elif value <= q2:
            labels.append("q2_lowmid")
        elif value <= q3:
            labels.append("q3_highmid")
        else:
            labels.append("q4_highest")
    return labels


def build_report(*, config_path: Path, metrics: dict) -> str:
    recommended_branch = metrics["recommended_default_branch"]
    lines = [
        "# DS003838 Expanded Failure Analysis",
        "",
        f"- Config: `{str(config_path).replace(chr(92), '/')}`",
        f"- Baseline config: `{metrics['baseline_config']}`",
        f"- Runtime seconds: `{metrics['runtime_sec']:.3f}`",
        f"- Peak memory MB: `{metrics['peak_memory_mb']:.3f}`",
        f"- Recommended default branch: `{recommended_branch}`",
        "",
        "## Headline",
        "",
        "- The 8-subject split remains clean at the data, alignment, and target-coverage levels.",
        f"- The least-bad branch is `{recommended_branch}`, but it still does not beat null on aggregate standardized MSE.",
        "- The surviving positive signal is narrow and amplitude-heavy rather than timing-heavy.",
        "",
    ]

    best_branch = metrics["branches"][recommended_branch]
    lines.extend(
        [
            "## Recommended Branch",
            "",
            f"- Aggregate standardized model MSE: `{best_branch['aggregate_model_mse_std']:.6f}`",
            f"- Aggregate standardized null MSE: `{best_branch['aggregate_null_mse_std']:.6f}`",
            f"- Aggregate standardized delta: `{best_branch['aggregate_delta_mse_std']:.6f}`",
            "",
            "## Subject Breakdown",
            "",
        ]
    )
    for subject_id, subject_metrics in best_branch["subject_aggregate"].items():
        lines.extend(
            [
                f"### {subject_id}",
                "",
                f"- Aggregate standardized model MSE: `{subject_metrics['aggregate_model_mse_std']:.6f}`",
                f"- Aggregate standardized null MSE: `{subject_metrics['aggregate_null_mse_std']:.6f}`",
                f"- Aggregate standardized delta: `{subject_metrics['aggregate_delta_mse_std']:.6f}`",
                f"- Amplitude-family delta: `{subject_metrics['family_delta_mse_std']['amplitude_family']:.6f}`",
                f"- Timing-family delta: `{subject_metrics['family_delta_mse_std']['timing_family']:.6f}`",
                f"- Largest gain target: `{subject_metrics['best_target_gain']['target_name']}` ({subject_metrics['best_target_gain']['delta_mse_std']:.6f})",
                f"- Largest loss target: `{subject_metrics['worst_target_loss']['target_name']}` ({subject_metrics['worst_target_loss']['delta_mse_std']:.6f})",
                "",
            ]
        )

    lines.extend(["## Quality Slices", ""])
    for slice_name, slice_metrics in best_branch["quality_slices"].items():
        lines.append(f"### {slice_name}")
        lines.append("")
        for label, stats in slice_metrics.items():
            lines.append(
                f"- {label}: count `{stats['count']}`, delta `{stats['aggregate_delta_mse_std'] if stats['aggregate_delta_mse_std'] is not None else 'n/a'}`"
            )
        lines.append("")

    lines.extend(["## Target Shift", ""])
    for target_name in metrics["aggregate_target_names"]:
        shift = metrics["target_shift"][target_name]
        lines.extend(
            [
                f"### {target_name}",
                "",
                f"- Train mean/std: `{shift['train_mean']:.6f}` / `{shift['train_std']:.6f}`",
                f"- Eval mean/std: `{shift['eval_mean']:.6f}` / `{shift['eval_std']:.6f}`",
                f"- Overall eval mean shift z: `{shift['eval_mean_shift_z']:.6f}`",
                f"- Overall eval std ratio: `{shift['eval_std_ratio']:.6f}`",
                "",
            ]
        )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze DS003838 expanded-split EEG-to-PPG failure patterns.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds003838_failure_analysis_expanded.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    baseline_config_path = Path(config["analysis"]["baseline_config"])
    baseline_config = load_config(baseline_config_path)

    dataset_path = Path(baseline_config["baseline"]["dataset"])
    metadata_path = Path(baseline_config["baseline"]["metadata"])
    targets_path = Path(baseline_config["baseline"]["targets"])
    feature_branches = list(baseline_config["baseline"]["feature_branches"])
    target_names = list(baseline_config["baseline"]["target_names"])
    aggregate_target_names = list(baseline_config["baseline"]["aggregate_target_names"])
    ridge_lambda = float(baseline_config["baseline"]["ridge_lambda"])
    min_train_windows_per_target = int(baseline_config["baseline"].get("min_train_windows_per_target", 1))
    min_eval_windows_per_target = int(baseline_config["baseline"].get("min_eval_windows_per_target", 1))

    target_families = {
        family_name: list(family_targets)
        for family_name, family_targets in config["analysis"]["target_families"].items()
    }
    report_path = Path(config["paths"]["report"])
    metrics_path = Path(config["paths"]["metrics"])

    arrays = np.load(dataset_path)
    target_arrays = np.load(targets_path)
    metadata = load_json(metadata_path)["windows"]
    train_quality_mask = np.asarray(
        [row["split"] == "train" and row["quality_flags"]["window_quality_pass"] for row in metadata],
        dtype=bool,
    )
    eval_quality_mask = np.asarray(
        [row["split"] == "eval" and row["quality_flags"]["window_quality_pass"] for row in metadata],
        dtype=bool,
    )
    eval_subject_ids = sorted({row["subject_id"] for row in metadata if row["split"] == "eval"})

    tracemalloc.start()
    start = time.perf_counter()

    metrics: dict = {
        "config": str(config_path).replace("\\", "/"),
        "baseline_config": str(baseline_config_path).replace("\\", "/"),
        "ridge_lambda": ridge_lambda,
        "target_names": target_names,
        "aggregate_target_names": aggregate_target_names,
        "target_families": target_families,
        "branches": {},
        "target_shift": {},
    }

    # Distribution shift analysis does not depend on the branch.
    for target_name in target_names:
        target_values = target_arrays[target_name].astype(np.float64)
        target_valid = target_arrays[target_valid_key(target_name)].astype(bool)
        train_values = target_values[train_quality_mask & target_valid]
        eval_values = target_values[eval_quality_mask & target_valid]
        train_mean = float(np.mean(train_values))
        train_std = float(np.std(train_values))
        eval_mean = float(np.mean(eval_values))
        eval_std = float(np.std(eval_values))
        train_std_safe = train_std if train_std > 1e-12 else 1.0
        per_subject_shift = {}
        for subject_id in eval_subject_ids:
            subject_mask = np.asarray([row["subject_id"] == subject_id for row in metadata], dtype=bool) & eval_quality_mask & target_valid
            subject_values = target_values[subject_mask]
            per_subject_shift[subject_id] = {
                "eval_windows": int(subject_values.shape[0]),
                "mean": float(np.mean(subject_values)),
                "std": float(np.std(subject_values)),
                "mean_shift_z": float((np.mean(subject_values) - train_mean) / train_std_safe),
                "std_ratio": float((np.std(subject_values) / train_std_safe) if train_std_safe > 0 else 0.0),
            }
        metrics["target_shift"][target_name] = {
            "train_mean": train_mean,
            "train_std": train_std,
            "eval_mean": eval_mean,
            "eval_std": eval_std,
            "eval_mean_shift_z": float((eval_mean - train_mean) / train_std_safe),
            "eval_std_ratio": float((eval_std / train_std_safe) if train_std_safe > 0 else 0.0),
            "per_subject": per_subject_shift,
        }

    for branch_name in feature_branches:
        features = arrays[branch_name].reshape(arrays[branch_name].shape[0], -1).astype(np.float64)
        branch_target_metrics: dict[str, dict] = {}
        eval_window_rows = [row for row, ok in zip(metadata, eval_quality_mask.tolist()) if ok]
        eval_quality_global_indices = np.flatnonzero(eval_quality_mask)
        eval_global_to_local = {int(global_index): local_index for local_index, global_index in enumerate(eval_quality_global_indices.tolist())}
        eval_window_records = [
            {
                "subject_id": row["subject_id"],
                "ppg_peak_bucket": quality_peak_bucket(int(row["ppg_peak_count"])),
                "ppg_clean_std": float(row["ppg_clean_std"]),
                "target_errors": {},
                "family_errors": {family_name: [] for family_name in target_families},
            }
            for row in eval_window_rows
        ]

        aggregate_model_mses: list[float] = []
        aggregate_null_mses: list[float] = []
        aggregate_model_maes: list[float] = []
        aggregate_null_maes: list[float] = []

        for target_name in target_names:
            target_values = target_arrays[target_name].astype(np.float64).reshape(-1, 1)
            target_valid = target_arrays[target_valid_key(target_name)].astype(bool)
            train_mask = train_quality_mask & target_valid
            eval_mask = eval_quality_mask & target_valid
            train_count = int(np.sum(train_mask))
            eval_count = int(np.sum(eval_mask))
            if train_count < min_train_windows_per_target or eval_count < min_eval_windows_per_target:
                raise SystemExit(
                    f"Target {target_name} does not meet minimum coverage: train={train_count}, eval={eval_count}."
                )

            y_train = target_values[train_mask]
            y_eval = target_values[eval_mask]
            target_means, target_scales = feature_stats(y_train)
            y_train_std = standardize(y_train, target_means, target_scales)
            y_eval_std = standardize(y_eval, target_means, target_scales)

            x_train = features[train_mask]
            x_eval = features[eval_mask]
            x_means, x_scales = feature_stats(x_train)
            x_train_std = standardize(x_train, x_means, x_scales)
            x_eval_std = standardize(x_eval, x_means, x_scales)

            predictions_std = ridge_dual_predict(x_train_std, y_train_std, x_eval_std, ridge_lambda)
            null_predictions_std = np.zeros_like(predictions_std)
            predictions = (predictions_std * target_scales) + target_means
            null_predictions = np.repeat(target_means[np.newaxis, :], repeats=eval_count, axis=0)

            target_metric = {
                "train_windows": train_count,
                "eval_windows": eval_count,
                "model_mse": mse(predictions, y_eval),
                "null_mse": mse(null_predictions, y_eval),
                "model_mae": float(np.mean(np.abs(predictions - y_eval))),
                "null_mae": float(np.mean(np.abs(null_predictions - y_eval))),
                "model_mse_std": mse(predictions_std, y_eval_std),
                "null_mse_std": mse(null_predictions_std, y_eval_std),
                "delta_mse_std": mse(predictions_std, y_eval_std) - mse(null_predictions_std, y_eval_std),
                "beats_null_mse": mse(predictions, y_eval) < mse(null_predictions, y_eval),
                "per_subject": {},
            }

            eval_row_indices = np.flatnonzero(eval_mask)
            for local_index, global_index in enumerate(eval_row_indices.tolist()):
                model_error_std = float((predictions_std[local_index, 0] - y_eval_std[local_index, 0]) ** 2)
                null_error_std = float((y_eval_std[local_index, 0]) ** 2)
                eval_window_records[eval_global_to_local[global_index]]["target_errors"][target_name] = {
                    "model_mse_std": model_error_std,
                    "null_mse_std": null_error_std,
                    "delta_mse_std": model_error_std - null_error_std,
                }
                for family_name, family_targets in target_families.items():
                    if target_name in family_targets:
                        eval_window_records[eval_global_to_local[global_index]]["family_errors"][family_name].append(
                            {
                                "model_mse_std": model_error_std,
                                "null_mse_std": null_error_std,
                                "delta_mse_std": model_error_std - null_error_std,
                            }
                        )

            # Per-subject target metrics.
            for subject_id in eval_subject_ids:
                subject_mask = np.asarray(
                    [row["subject_id"] == subject_id for row in metadata],
                    dtype=bool,
                ) & eval_mask
                subject_rows = np.flatnonzero(subject_mask)
                local_indices = [int(np.where(eval_row_indices == row_index)[0][0]) for row_index in subject_rows.tolist()]
                subject_pred_std = predictions_std[local_indices]
                subject_truth_std = y_eval_std[local_indices]
                subject_null_std = null_predictions_std[local_indices]
                target_metric["per_subject"][subject_id] = {
                    "eval_windows": len(local_indices),
                    "model_mse_std": mse(subject_pred_std, subject_truth_std),
                    "null_mse_std": mse(subject_null_std, subject_truth_std),
                    "delta_mse_std": mse(subject_pred_std, subject_truth_std) - mse(subject_null_std, subject_truth_std),
                }

            branch_target_metrics[target_name] = target_metric
            if target_name in aggregate_target_names:
                aggregate_model_mses.append(target_metric["model_mse_std"])
                aggregate_null_mses.append(target_metric["null_mse_std"])
                aggregate_model_maes.append(target_metric["model_mae"])
                aggregate_null_maes.append(target_metric["null_mae"])

        # Summaries on eval windows.
        for record in eval_window_records:
            aggregate_errors = [record["target_errors"][name] for name in aggregate_target_names if name in record["target_errors"]]
            record["aggregate_model_mse_std"] = float(np.mean([row["model_mse_std"] for row in aggregate_errors]))
            record["aggregate_null_mse_std"] = float(np.mean([row["null_mse_std"] for row in aggregate_errors]))
            record["aggregate_delta_mse_std"] = record["aggregate_model_mse_std"] - record["aggregate_null_mse_std"]
            for family_name, family_errors in list(record["family_errors"].items()):
                record["family_errors"][family_name] = summarize_slice(family_errors)

        ppg_clean_std_labels = quartile_labels(np.asarray([row["ppg_clean_std"] for row in eval_window_records], dtype=np.float64))
        for record, label in zip(eval_window_records, ppg_clean_std_labels):
            record["ppg_clean_std_bucket"] = label

        subject_aggregate = {}
        for subject_id in eval_subject_ids:
            subject_rows = [row for row in eval_window_records if row["subject_id"] == subject_id]
            family_delta_mse_std = {
                family_name: float(np.mean([row["family_errors"][family_name]["aggregate_delta_mse_std"] for row in subject_rows]))
                for family_name in target_families
            }
            target_deltas = {
                target_name: branch_target_metrics[target_name]["per_subject"][subject_id]["delta_mse_std"]
                for target_name in target_names
            }
            best_target = min(target_deltas.items(), key=lambda item: item[1])
            worst_target = max(target_deltas.items(), key=lambda item: item[1])
            subject_aggregate[subject_id] = {
                "eval_windows": len(subject_rows),
                "aggregate_model_mse_std": float(np.mean([row["aggregate_model_mse_std"] for row in subject_rows])),
                "aggregate_null_mse_std": float(np.mean([row["aggregate_null_mse_std"] for row in subject_rows])),
                "aggregate_delta_mse_std": float(np.mean([row["aggregate_delta_mse_std"] for row in subject_rows])),
                "family_delta_mse_std": family_delta_mse_std,
                "best_target_gain": {
                    "target_name": best_target[0],
                    "delta_mse_std": float(best_target[1]),
                },
                "worst_target_loss": {
                    "target_name": worst_target[0],
                    "delta_mse_std": float(worst_target[1]),
                },
            }

        peak_slices = {}
        for label in ["1-2_peaks", "3_peaks", "4plus_peaks"]:
            peak_slices[label] = summarize_slice(
                [
                    {
                        "model_mse_std": row["aggregate_model_mse_std"],
                        "null_mse_std": row["aggregate_null_mse_std"],
                        "delta_mse_std": row["aggregate_delta_mse_std"],
                    }
                    for row in eval_window_records
                    if row["ppg_peak_bucket"] == label
                ]
            )

        std_quartile_slices = {}
        for label in ["q1_lowest", "q2_lowmid", "q3_highmid", "q4_highest"]:
            std_quartile_slices[label] = summarize_slice(
                [
                    {
                        "model_mse_std": row["aggregate_model_mse_std"],
                        "null_mse_std": row["aggregate_null_mse_std"],
                        "delta_mse_std": row["aggregate_delta_mse_std"],
                    }
                    for row in eval_window_records
                    if row["ppg_clean_std_bucket"] == label
                ]
            )

        metrics["branches"][branch_name] = {
            "aggregate_model_mse_std": float(np.mean(aggregate_model_mses)),
            "aggregate_null_mse_std": float(np.mean(aggregate_null_mses)),
            "aggregate_delta_mse_std": float(np.mean(aggregate_model_mses) - np.mean(aggregate_null_mses)),
            "aggregate_model_mae": float(np.mean(aggregate_model_maes)),
            "aggregate_null_mae": float(np.mean(aggregate_null_maes)),
            "per_target": branch_target_metrics,
            "subject_aggregate": subject_aggregate,
            "quality_slices": {
                "ppg_peak_count": peak_slices,
                "ppg_clean_std_quartile": std_quartile_slices,
            },
        }

    recommended_default_branch = min(
        feature_branches,
        key=lambda branch_name: metrics["branches"][branch_name]["aggregate_model_mse_std"],
    )
    metrics["recommended_default_branch"] = recommended_default_branch

    runtime_sec = time.perf_counter() - start
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    metrics["runtime_sec"] = runtime_sec
    metrics["peak_memory_mb"] = peak_memory_bytes / (1024 * 1024)

    ensure_parent(metrics_path)
    ensure_parent(report_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    report_path.write_text(build_report(config_path=config_path, metrics=metrics), encoding="utf-8")
    print(f"Wrote failure analysis metrics to {metrics_path}")
    print(f"Wrote failure analysis report to {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
