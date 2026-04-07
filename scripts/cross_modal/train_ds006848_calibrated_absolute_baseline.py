#!/usr/bin/env python3
"""Train DS006848 calibration-aware absolute-unit baselines on the cohort-swap split."""

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
    pearson,
    ridge_dual_predict,
    standardize,
    target_valid_key,
)
from train_ds006848_shift_aware_baseline import (
    build_subject_stats,
    ensure_parent,
    subject_index_groups,
    zscore_by_subject,
)


def relative_error(model_value: float, null_value: float, *, floor: float) -> float:
    return model_value / max(null_value, floor)


def absolute_from_subject_zscores(
    z_values: np.ndarray,
    metadata: list[dict],
    indices: list[int],
    stats: dict[str, dict[str, float]],
) -> np.ndarray:
    absolute = np.zeros((len(indices), 1), dtype=np.float64)
    for local_index, global_index in enumerate(indices):
        subject_id = metadata[global_index]["subject_id"]
        subject_stats = stats[subject_id]
        absolute[local_index, 0] = (z_values[local_index, 0] * subject_stats["std"]) + subject_stats["mean"]
    return absolute


def subject_mean_predictions(
    metadata: list[dict],
    indices: list[int],
    stats: dict[str, dict[str, float]],
) -> np.ndarray:
    predictions = np.zeros((len(indices), 1), dtype=np.float64)
    for local_index, global_index in enumerate(indices):
        subject_id = metadata[global_index]["subject_id"]
        predictions[local_index, 0] = stats[subject_id]["mean"]
    return predictions


def aggregate_relative_section(
    per_target: dict[str, dict],
    aggregate_target_names: list[str],
) -> dict[str, float | bool]:
    model_relative_mses = [per_target[name]["relative_mse"] for name in aggregate_target_names]
    model_relative_maes = [per_target[name]["relative_mae"] for name in aggregate_target_names]
    aggregate_model_relative_mse = float(np.mean(model_relative_mses))
    return {
        "aggregate_model_relative_mse": aggregate_model_relative_mse,
        "aggregate_null_relative_mse": 1.0,
        "aggregate_model_relative_mae": float(np.mean(model_relative_maes)),
        "aggregate_null_relative_mae": 1.0,
        "aggregate_delta_relative_mse": aggregate_model_relative_mse - 1.0,
        "beats_null_relative_mse": aggregate_model_relative_mse < 1.0,
    }


def reference_zero_shot_summary(
    metrics: dict,
    aggregate_target_names: list[str],
    *,
    floor: float,
) -> dict[str, float | str]:
    branch_scores: dict[str, float] = {}
    for branch_name, branch_metrics in metrics["branches"].items():
        per_target = branch_metrics["per_target"]
        relative_mses = [
            relative_error(
                float(per_target[target_name]["model_mse"]),
                float(per_target[target_name]["null_mse"]),
                floor=floor,
            )
            for target_name in aggregate_target_names
        ]
        branch_scores[branch_name] = float(np.mean(relative_mses))
    best_branch = min(branch_scores, key=branch_scores.get)
    return {
        "config": metrics["config"],
        "best_branch": best_branch,
        "best_branch_aggregate_relative_mse": branch_scores[best_branch],
    }


def build_report(*, config_path: Path, metrics: dict) -> str:
    lines = [
        "# DS006848 Calibrated Absolute Baseline Report",
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
        f"- Zero-shot best branch by aggregate relative MSE: `{metrics['reference_zero_shot']['best_branch']}`",
        f"- Zero-shot best aggregate relative MSE: `{metrics['reference_zero_shot']['best_branch_aggregate_relative_mse']:.6f}`",
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
                f"- Aggregate model relative MSE: `{best_branch_metrics['aggregate_model_relative_mse']:.6f}`",
                f"- Aggregate null relative MSE: `{best_branch_metrics['aggregate_null_relative_mse']:.6f}`",
                f"- Aggregate delta relative MSE: `{best_branch_metrics['aggregate_delta_relative_mse']:.6f}`",
                f"- Beats null aggregate relative MSE: `{best_branch_metrics['beats_null_relative_mse']}`",
                "",
            ]
        )
        for branch_name, branch_metrics in mode_metrics["branches"].items():
            lines.extend(
                [
                    f"### {branch_name}",
                    "",
                    f"- Aggregate model relative MSE: `{branch_metrics['aggregate_model_relative_mse']:.6f}`",
                    f"- Aggregate null relative MSE: `{branch_metrics['aggregate_null_relative_mse']:.6f}`",
                    f"- Aggregate delta relative MSE: `{branch_metrics['aggregate_delta_relative_mse']:.6f}`",
                    f"- Beats null aggregate relative MSE: `{branch_metrics['beats_null_relative_mse']}`",
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
                        f"- Relative MSE: `{target_metrics['relative_mse']:.6f}`",
                        f"- Model MAE: `{target_metrics['model_mae']:.6f}`",
                        f"- Null MAE: `{target_metrics['null_mae']:.6f}`",
                        f"- Relative MAE: `{target_metrics['relative_mae']:.6f}`",
                        f"- Model corr: `{target_metrics['model_corr']:.6f}`",
                        f"- Null corr: `{target_metrics['null_corr']:.6f}`",
                        f"- Beats null MSE: `{target_metrics['beats_null_mse']}`",
                        "",
                    ]
                )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Train DS006848 calibrated absolute baselines.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_calibrated_absolute_baseline_cohort_swap.toml",
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
    null_mse_floor = float(config["calibration"]["null_mse_floor"])

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
        "reference_zero_shot": reference_zero_shot_summary(
            zero_shot_reference,
            aggregate_target_names,
            floor=null_mse_floor,
        ),
        "modes": {
            "oracle_absolute": {"branches": {}},
            "calibrated_absolute": {"branches": {}},
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

            train_indices = np.flatnonzero(train_mask).tolist()
            eval_indices = np.flatnonzero(eval_mask).tolist()
            x_train_target = standardize(features[np.asarray(train_indices, dtype=np.int64)], x_means, x_scales)
            y_train = zscore_by_subject(target_values, metadata, train_indices, train_stats)

            oracle_eval_stats = build_subject_stats(target_values, eval_groups, std_floor=subject_std_floor)
            oracle_predictions_z = ridge_dual_predict(
                x_train_target,
                y_train,
                standardize(features[np.asarray(eval_indices, dtype=np.int64)], x_means, x_scales),
                ridge_lambda,
            )
            oracle_targets_abs = target_values[np.asarray(eval_indices, dtype=np.int64)].reshape(-1, 1)
            oracle_predictions_abs = absolute_from_subject_zscores(
                oracle_predictions_z,
                metadata,
                eval_indices,
                oracle_eval_stats,
            )
            oracle_null_abs = subject_mean_predictions(metadata, eval_indices, oracle_eval_stats)
            oracle_per_subject: dict[str, dict[str, float | int]] = {}
            oracle_local_lookup = {global_index: local_index for local_index, global_index in enumerate(eval_indices)}
            for subject_id, subject_eval_indices in eval_groups.items():
                local_indices = [oracle_local_lookup[index] for index in subject_eval_indices]
                model_mse = mse(oracle_predictions_abs[local_indices], oracle_targets_abs[local_indices])
                null_mse = mse(oracle_null_abs[local_indices], oracle_targets_abs[local_indices])
                oracle_per_subject[subject_id] = {
                    "eval_windows": len(local_indices),
                    "model_mse": model_mse,
                    "null_mse": null_mse,
                    "relative_mse": relative_error(model_mse, null_mse, floor=null_mse_floor),
                    "delta_mse": model_mse - null_mse,
                }

            oracle_model_mse = mse(oracle_predictions_abs, oracle_targets_abs)
            oracle_null_mse = mse(oracle_null_abs, oracle_targets_abs)
            oracle_model_mae = mae(oracle_predictions_abs, oracle_targets_abs)
            oracle_null_mae = mae(oracle_null_abs, oracle_targets_abs)
            metrics["modes"]["oracle_absolute"]["branches"][branch_name]["per_target"][target_name] = {
                "train_windows": len(train_indices),
                "eval_windows": len(eval_indices),
                "model_mse": oracle_model_mse,
                "null_mse": oracle_null_mse,
                "relative_mse": relative_error(oracle_model_mse, oracle_null_mse, floor=null_mse_floor),
                "model_mae": oracle_model_mae,
                "null_mae": oracle_null_mae,
                "relative_mae": relative_error(oracle_model_mae, oracle_null_mae, floor=null_mse_floor),
                "model_corr": pearson(oracle_predictions_abs, oracle_targets_abs),
                "null_corr": pearson(oracle_null_abs, oracle_targets_abs),
                "delta_mse": oracle_model_mse - oracle_null_mse,
                "beats_null_mse": oracle_model_mse < oracle_null_mse,
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
                calibration_stats[subject_id] = build_subject_stats(
                    target_values,
                    {subject_id: calibration_indices},
                    std_floor=subject_std_floor,
                )[subject_id]
                calibrated_test_indices.extend(test_indices)

            calibrated_predictions_z = ridge_dual_predict(
                x_train_target,
                y_train,
                standardize(features[np.asarray(calibrated_test_indices, dtype=np.int64)], x_means, x_scales),
                ridge_lambda,
            )
            calibrated_targets_abs = target_values[np.asarray(calibrated_test_indices, dtype=np.int64)].reshape(-1, 1)
            calibrated_predictions_abs = absolute_from_subject_zscores(
                calibrated_predictions_z,
                metadata,
                calibrated_test_indices,
                calibration_stats,
            )
            calibrated_null_abs = subject_mean_predictions(metadata, calibrated_test_indices, calibration_stats)
            calibrated_per_subject: dict[str, dict[str, float | int]] = {}
            calibrated_local_lookup = {
                global_index: local_index for local_index, global_index in enumerate(calibrated_test_indices)
            }
            for subject_id, subject_eval_indices in eval_groups.items():
                subject_test_indices = subject_eval_indices[calibration_windows_per_subject:]
                local_indices = [calibrated_local_lookup[index] for index in subject_test_indices]
                model_mse = mse(calibrated_predictions_abs[local_indices], calibrated_targets_abs[local_indices])
                null_mse = mse(calibrated_null_abs[local_indices], calibrated_targets_abs[local_indices])
                calibrated_per_subject[subject_id] = {
                    "calibration_windows": calibration_windows_per_subject,
                    "eval_windows": len(local_indices),
                    "model_mse": model_mse,
                    "null_mse": null_mse,
                    "relative_mse": relative_error(model_mse, null_mse, floor=null_mse_floor),
                    "delta_mse": model_mse - null_mse,
                }

            calibrated_model_mse = mse(calibrated_predictions_abs, calibrated_targets_abs)
            calibrated_null_mse = mse(calibrated_null_abs, calibrated_targets_abs)
            calibrated_model_mae = mae(calibrated_predictions_abs, calibrated_targets_abs)
            calibrated_null_mae = mae(calibrated_null_abs, calibrated_targets_abs)
            metrics["modes"]["calibrated_absolute"]["branches"][branch_name]["per_target"][target_name] = {
                "train_windows": len(train_indices),
                "eval_windows": len(calibrated_test_indices),
                "calibration_windows_per_subject": calibration_windows_per_subject,
                "model_mse": calibrated_model_mse,
                "null_mse": calibrated_null_mse,
                "relative_mse": relative_error(calibrated_model_mse, calibrated_null_mse, floor=null_mse_floor),
                "model_mae": calibrated_model_mae,
                "null_mae": calibrated_null_mae,
                "relative_mae": relative_error(calibrated_model_mae, calibrated_null_mae, floor=null_mse_floor),
                "model_corr": pearson(calibrated_predictions_abs, calibrated_targets_abs),
                "null_corr": pearson(calibrated_null_abs, calibrated_targets_abs),
                "delta_mse": calibrated_model_mse - calibrated_null_mse,
                "beats_null_mse": calibrated_model_mse < calibrated_null_mse,
                "per_subject": calibrated_per_subject,
            }

        for mode_name, mode_metrics in metrics["modes"].items():
            branch_metrics = mode_metrics["branches"][branch_name]
            branch_metrics.update(
                aggregate_relative_section(
                    branch_metrics["per_target"],
                    aggregate_target_names=aggregate_target_names,
                )
            )

    for mode_name, mode_metrics in metrics["modes"].items():
        mode_metrics["best_branch"] = min(
            feature_branches,
            key=lambda candidate: mode_metrics["branches"][candidate]["aggregate_model_relative_mse"],
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
    print(f"Wrote calibrated absolute baseline report to {report_path}")
    print(f"Wrote calibrated absolute baseline metrics to {metrics_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
