#!/usr/bin/env python3
"""Train shift-aware DS006848 EEG-to-PPG baselines on the cohort-swap split."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import time
import tracemalloc

import numpy as np

from train_ds006848_morphology_baseline import (
    feature_stats,
    load_config,
    load_json,
    mae,
    mse,
    ridge_dual_predict,
    standardize,
    target_valid_key,
)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def subject_index_groups(mask: np.ndarray, metadata: list[dict], *, sort_by_event: bool) -> dict[str, list[int]]:
    groups: dict[str, list[int]] = {}
    indices = np.flatnonzero(mask).tolist()
    for index in indices:
        subject_id = metadata[index]["subject_id"]
        groups.setdefault(subject_id, []).append(index)
    if sort_by_event:
        for subject_id, subject_indices in groups.items():
            subject_indices.sort(key=lambda idx: (metadata[idx]["event_index"], idx))
    return groups


def build_subject_stats(
    values: np.ndarray,
    groups: dict[str, list[int]],
    *,
    std_floor: float,
) -> dict[str, dict[str, float]]:
    stats: dict[str, dict[str, float]] = {}
    for subject_id, indices in groups.items():
        subject_values = values[np.asarray(indices, dtype=np.int64)]
        mean = float(np.mean(subject_values))
        std = float(np.std(subject_values))
        if std < std_floor:
            std = std_floor
        stats[subject_id] = {
            "mean": mean,
            "std": std,
            "count": float(len(indices)),
        }
    return stats


def zscore_by_subject(
    values: np.ndarray,
    metadata: list[dict],
    indices: list[int],
    stats: dict[str, dict[str, float]],
) -> np.ndarray:
    standardized = np.zeros((len(indices), 1), dtype=np.float64)
    for local_index, global_index in enumerate(indices):
        subject_id = metadata[global_index]["subject_id"]
        subject_stats = stats[subject_id]
        standardized[local_index, 0] = (values[global_index] - subject_stats["mean"]) / subject_stats["std"]
    return standardized


def aggregate_section(
    per_target: dict[str, dict],
    aggregate_target_names: list[str],
) -> dict[str, float | bool]:
    model_mses = [per_target[name]["model_mse"] for name in aggregate_target_names]
    null_mses = [per_target[name]["null_mse"] for name in aggregate_target_names]
    model_maes = [per_target[name]["model_mae"] for name in aggregate_target_names]
    null_maes = [per_target[name]["null_mae"] for name in aggregate_target_names]
    aggregate_model_mse = float(np.mean(model_mses))
    aggregate_null_mse = float(np.mean(null_mses))
    return {
        "aggregate_model_mse": aggregate_model_mse,
        "aggregate_null_mse": aggregate_null_mse,
        "aggregate_model_mae": float(np.mean(model_maes)),
        "aggregate_null_mae": float(np.mean(null_maes)),
        "aggregate_delta_mse": aggregate_model_mse - aggregate_null_mse,
        "beats_null_mse": aggregate_model_mse < aggregate_null_mse,
    }


def build_report(*, config_path: Path, metrics: dict) -> str:
    lines = [
        "# DS006848 Shift-Aware Baseline Report",
        "",
        f"- Config: `{str(config_path).replace(chr(92), '/')}`",
        f"- Ridge lambda: `{metrics['ridge_lambda']:.1f}`",
        f"- Calibration windows per eval subject: `{metrics['calibration_windows_per_subject']}`",
        f"- Runtime seconds: `{metrics['runtime_sec']:.3f}`",
        f"- Peak memory MB: `{metrics['peak_memory_mb']:.3f}`",
        "",
        "## Reference",
        "",
        f"- Zero-shot reference config: `{metrics['reference_zero_shot']['config']}`",
        f"- Zero-shot best branch: `{metrics['reference_zero_shot']['best_branch']}`",
        f"- Zero-shot aggregate delta on best branch: `{metrics['reference_zero_shot']['best_branch_aggregate_delta_mse_std']:.6f}`",
        "",
    ]
    for mode_name, mode_metrics in metrics["modes"].items():
        best_branch = mode_metrics["best_branch"]
        best_branch_metrics = mode_metrics["branches"][best_branch]
        lines.extend(
            [
                f"## {mode_name}",
                "",
                f"- Best branch: `{best_branch}`",
                f"- Aggregate model MSE: `{best_branch_metrics['aggregate_model_mse']:.6f}`",
                f"- Aggregate null MSE: `{best_branch_metrics['aggregate_null_mse']:.6f}`",
                f"- Aggregate delta: `{best_branch_metrics['aggregate_delta_mse']:.6f}`",
                f"- Beats null aggregate MSE: `{best_branch_metrics['beats_null_mse']}`",
                "",
            ]
        )
        for branch_name, branch_metrics in mode_metrics["branches"].items():
            lines.extend(
                [
                    f"### {branch_name}",
                    "",
                    f"- Aggregate model MSE: `{branch_metrics['aggregate_model_mse']:.6f}`",
                    f"- Aggregate null MSE: `{branch_metrics['aggregate_null_mse']:.6f}`",
                    f"- Aggregate delta: `{branch_metrics['aggregate_delta_mse']:.6f}`",
                    f"- Beats null aggregate MSE: `{branch_metrics['beats_null_mse']}`",
                    "",
                ]
            )
            for target_name in metrics["target_names"]:
                target_metrics = branch_metrics["per_target"][target_name]
                lines.extend(
                    [
                        f"#### {target_name}",
                        "",
                        f"- Train windows: `{target_metrics['train_windows']}`",
                        f"- Eval windows: `{target_metrics['eval_windows']}`",
                        f"- Model MSE: `{target_metrics['model_mse']:.6f}`",
                        f"- Null MSE: `{target_metrics['null_mse']:.6f}`",
                        f"- Delta MSE: `{target_metrics['delta_mse']:.6f}`",
                        f"- Beats null MSE: `{target_metrics['beats_null_mse']}`",
                        "",
                    ]
                )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Train shift-aware DS006848 EEG-to-PPG baselines.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_shift_aware_baseline_cohort_swap.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    dataset_path = Path(config["baseline"]["dataset"])
    metadata_path = Path(config["baseline"]["metadata"])
    targets_path = Path(config["baseline"]["targets"])
    report_path = Path(config["paths"]["report"])
    metrics_path = Path(config["paths"]["metrics"])
    reference_zero_shot_metrics_path = Path(config["baseline"]["reference_zero_shot_metrics"])

    ridge_lambda = float(config["baseline"]["ridge_lambda"])
    feature_branches = list(config["baseline"]["feature_branches"])
    target_names = list(config["baseline"]["target_names"])
    aggregate_target_names = list(config["baseline"]["aggregate_target_names"])
    min_train_windows_per_target = int(config["baseline"]["min_train_windows_per_target"])
    min_eval_windows_per_target = int(config["baseline"]["min_eval_windows_per_target"])
    calibration_windows_per_subject = int(config["calibration"]["eval_windows_per_subject"])
    subject_std_floor = float(config["calibration"]["subject_std_floor"])

    arrays = np.load(dataset_path)
    target_arrays = np.load(targets_path)
    metadata = load_json(metadata_path)["windows"]
    zero_shot_reference = load_json(reference_zero_shot_metrics_path)

    train_quality_mask = np.asarray(
        [row["split"] == "train" and row["quality_flags"]["window_quality_pass"] for row in metadata],
        dtype=bool,
    )
    eval_quality_mask = np.asarray(
        [row["split"] == "eval" and row["quality_flags"]["window_quality_pass"] for row in metadata],
        dtype=bool,
    )

    tracemalloc.start()
    start = time.perf_counter()

    metrics = {
        "config": str(config_path).replace("\\", "/"),
        "ridge_lambda": ridge_lambda,
        "calibration_windows_per_subject": calibration_windows_per_subject,
        "target_names": target_names,
        "aggregate_target_names": aggregate_target_names,
        "reference_zero_shot": {
            "config": zero_shot_reference["config"],
            "best_branch": zero_shot_reference["best_branch"],
            "best_branch_aggregate_delta_mse_std": zero_shot_reference["branches"][zero_shot_reference["best_branch"]][
                "aggregate_model_mse_std"
            ]
            - zero_shot_reference["branches"][zero_shot_reference["best_branch"]]["aggregate_null_mse_std"],
        },
        "modes": {
            "oracle_subject_zscore": {"branches": {}},
            "calibrated_subject_zscore": {"branches": {}},
        },
    }

    for branch_name in feature_branches:
        features = arrays[branch_name].reshape(arrays[branch_name].shape[0], -1).astype(np.float64)
        x_train = features[train_quality_mask]
        x_means, x_scales = feature_stats(x_train)

        for mode_name in metrics["modes"]:
            metrics["modes"][mode_name]["branches"][branch_name] = {"per_target": {}}

        for target_name in target_names:
            target_values = target_arrays[target_name].astype(np.float64)
            target_valid = target_arrays[target_valid_key(target_name)].astype(bool)
            train_mask = train_quality_mask & target_valid
            eval_mask = eval_quality_mask & target_valid

            if int(np.sum(train_mask)) < min_train_windows_per_target or int(np.sum(eval_mask)) < min_eval_windows_per_target:
                raise SystemExit(
                    f"Target {target_name} does not meet minimum coverage: train={int(np.sum(train_mask))}, eval={int(np.sum(eval_mask))}."
                )

            train_groups = subject_index_groups(train_mask, metadata, sort_by_event=False)
            eval_groups = subject_index_groups(eval_mask, metadata, sort_by_event=True)
            train_stats = build_subject_stats(target_values, train_groups, std_floor=subject_std_floor)
            oracle_eval_stats = build_subject_stats(target_values, eval_groups, std_floor=subject_std_floor)

            train_indices = np.flatnonzero(train_mask).tolist()
            eval_indices = np.flatnonzero(eval_mask).tolist()
            x_train_target = standardize(features[np.asarray(train_indices, dtype=np.int64)], x_means, x_scales)
            y_train = zscore_by_subject(target_values, metadata, train_indices, train_stats)
            eval_subject_ids = sorted(eval_groups.keys())

            oracle_predictions = ridge_dual_predict(
                x_train_target,
                y_train,
                standardize(features[np.asarray(eval_indices, dtype=np.int64)], x_means, x_scales),
                ridge_lambda,
            )
            oracle_targets = zscore_by_subject(target_values, metadata, eval_indices, oracle_eval_stats)
            oracle_null = np.zeros_like(oracle_predictions)
            oracle_per_subject: dict[str, dict[str, float | int]] = {}
            eval_local_lookup = {global_index: local_index for local_index, global_index in enumerate(eval_indices)}
            for subject_id in eval_subject_ids:
                subject_eval_indices = eval_groups[subject_id]
                local_indices = [eval_local_lookup[index] for index in subject_eval_indices]
                oracle_per_subject[subject_id] = {
                    "eval_windows": len(local_indices),
                    "model_mse": mse(oracle_predictions[local_indices], oracle_targets[local_indices]),
                    "null_mse": mse(oracle_null[local_indices], oracle_targets[local_indices]),
                    "delta_mse": mse(oracle_predictions[local_indices], oracle_targets[local_indices])
                    - mse(oracle_null[local_indices], oracle_targets[local_indices]),
                }

            metrics["modes"]["oracle_subject_zscore"]["branches"][branch_name]["per_target"][target_name] = {
                "train_windows": len(train_indices),
                "eval_windows": len(eval_indices),
                "model_mse": mse(oracle_predictions, oracle_targets),
                "null_mse": mse(oracle_null, oracle_targets),
                "model_mae": mae(oracle_predictions, oracle_targets),
                "null_mae": mae(oracle_null, oracle_targets),
                "delta_mse": mse(oracle_predictions, oracle_targets) - mse(oracle_null, oracle_targets),
                "beats_null_mse": mse(oracle_predictions, oracle_targets) < mse(oracle_null, oracle_targets),
                "per_subject": oracle_per_subject,
            }

            calibration_stats: dict[str, dict[str, float]] = {}
            calibrated_test_indices: list[int] = []
            for subject_id, subject_eval_indices in eval_groups.items():
                if len(subject_eval_indices) <= calibration_windows_per_subject:
                    raise SystemExit(
                        f"Subject {subject_id} does not have enough windows for calibration on target {target_name}: {len(subject_eval_indices)}."
                    )
                calibration_indices = subject_eval_indices[:calibration_windows_per_subject]
                test_indices = subject_eval_indices[calibration_windows_per_subject:]
                subject_stats = build_subject_stats(
                    target_values,
                    {subject_id: calibration_indices},
                    std_floor=subject_std_floor,
                )[subject_id]
                calibration_stats[subject_id] = subject_stats
                calibrated_test_indices.extend(test_indices)

            calibrated_predictions = ridge_dual_predict(
                x_train_target,
                y_train,
                standardize(features[np.asarray(calibrated_test_indices, dtype=np.int64)], x_means, x_scales),
                ridge_lambda,
            )
            calibrated_targets = zscore_by_subject(
                target_values,
                metadata,
                calibrated_test_indices,
                calibration_stats,
            )
            calibrated_null = np.zeros_like(calibrated_predictions)
            calibrated_per_subject: dict[str, dict[str, float | int]] = {}
            calibrated_local_lookup = {
                global_index: local_index for local_index, global_index in enumerate(calibrated_test_indices)
            }
            for subject_id, subject_eval_indices in eval_groups.items():
                subject_test_indices = subject_eval_indices[calibration_windows_per_subject:]
                local_indices = [calibrated_local_lookup[index] for index in subject_test_indices]
                calibrated_per_subject[subject_id] = {
                    "calibration_windows": calibration_windows_per_subject,
                    "eval_windows": len(local_indices),
                    "model_mse": mse(calibrated_predictions[local_indices], calibrated_targets[local_indices]),
                    "null_mse": mse(calibrated_null[local_indices], calibrated_targets[local_indices]),
                    "delta_mse": mse(calibrated_predictions[local_indices], calibrated_targets[local_indices])
                    - mse(calibrated_null[local_indices], calibrated_targets[local_indices]),
                }

            metrics["modes"]["calibrated_subject_zscore"]["branches"][branch_name]["per_target"][target_name] = {
                "train_windows": len(train_indices),
                "eval_windows": len(calibrated_test_indices),
                "calibration_windows_per_subject": calibration_windows_per_subject,
                "model_mse": mse(calibrated_predictions, calibrated_targets),
                "null_mse": mse(calibrated_null, calibrated_targets),
                "model_mae": mae(calibrated_predictions, calibrated_targets),
                "null_mae": mae(calibrated_null, calibrated_targets),
                "delta_mse": mse(calibrated_predictions, calibrated_targets)
                - mse(calibrated_null, calibrated_targets),
                "beats_null_mse": mse(calibrated_predictions, calibrated_targets)
                < mse(calibrated_null, calibrated_targets),
                "per_subject": calibrated_per_subject,
            }

        for mode_name, mode_metrics in metrics["modes"].items():
            branch_metrics = mode_metrics["branches"][branch_name]
            branch_metrics.update(
                aggregate_section(
                    branch_metrics["per_target"],
                    aggregate_target_names=aggregate_target_names,
                )
            )

    for mode_name, mode_metrics in metrics["modes"].items():
        mode_metrics["best_branch"] = min(
            feature_branches,
            key=lambda candidate: mode_metrics["branches"][candidate]["aggregate_model_mse"],
        )

    runtime_sec = time.perf_counter() - start
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    metrics["runtime_sec"] = runtime_sec
    metrics["peak_memory_mb"] = peak_memory_bytes / (1024 * 1024)

    for path in [report_path, metrics_path]:
        ensure_parent(path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    report_path.write_text(build_report(config_path=config_path, metrics=metrics), encoding="utf-8")
    print(f"Wrote shift-aware baseline report to {report_path}")
    print(f"Wrote shift-aware baseline metrics to {metrics_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
