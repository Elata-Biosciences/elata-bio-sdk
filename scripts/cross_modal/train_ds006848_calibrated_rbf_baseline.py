#!/usr/bin/env python3
"""Train DS006848 calibrated RBF-kernel amplitude baselines."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import time
import tracemalloc

import numpy as np

from train_ds006848_calibrated_absolute_baseline import (
    absolute_from_subject_zscores,
    aggregate_relative_section,
    relative_error,
    subject_mean_predictions,
)
from train_ds006848_morphology_baseline import (
    feature_stats,
    load_config,
    load_json,
    mae,
    mse,
    pearson,
    standardize,
    target_valid_key,
)
from train_ds006848_shift_aware_baseline import (
    build_subject_stats,
    ensure_parent,
    subject_index_groups,
    zscore_by_subject,
)


def squared_distance_matrix(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    left_norms = np.sum(left * left, axis=1, keepdims=True)
    right_norms = np.sum(right * right, axis=1, keepdims=True).T
    distances = left_norms + right_norms - (2.0 * (left @ right.T))
    return np.maximum(distances, 0.0)


def median_heuristic_gamma(train_features: np.ndarray, gamma_scale: float, *, floor: float) -> tuple[float, float]:
    distances = squared_distance_matrix(train_features, train_features)
    upper = distances[np.triu_indices_from(distances, k=1)]
    positive = upper[upper > floor]
    if positive.size == 0:
        median_sq_distance = 1.0
    else:
        median_sq_distance = float(np.median(positive))
    gamma = gamma_scale / max(median_sq_distance, floor)
    return gamma, median_sq_distance


def rbf_kernel(left_features: np.ndarray, right_features: np.ndarray, gamma: float) -> np.ndarray:
    distances = squared_distance_matrix(left_features, right_features)
    return np.exp(-gamma * distances, dtype=np.float64)


def rbf_kernel_ridge_predict(
    train_features: np.ndarray,
    train_targets: np.ndarray,
    eval_features: np.ndarray,
    *,
    ridge_lambda: float,
    gamma: float,
) -> np.ndarray:
    kernel_train = rbf_kernel(train_features, train_features, gamma)
    identity = np.eye(kernel_train.shape[0], dtype=np.float64)
    alpha = np.linalg.solve(kernel_train + ridge_lambda * identity, train_targets)
    kernel_eval = rbf_kernel(eval_features, train_features, gamma)
    return kernel_eval @ alpha


def linear_reference_summary(metrics: dict) -> dict[str, float | str]:
    calibrated = metrics["modes"]["calibrated_absolute"]
    best_branch = calibrated["best_branch"]
    best_metrics = calibrated["branches"][best_branch]
    return {
        "config": metrics["config"],
        "best_branch": best_branch,
        "best_branch_aggregate_relative_mse": float(best_metrics["aggregate_model_relative_mse"]),
        "best_branch_aggregate_delta_relative_mse": float(best_metrics["aggregate_delta_relative_mse"]),
    }


def build_report(*, config_path: Path, metrics: dict) -> str:
    lines = [
        "# DS006848 Calibrated RBF Baseline Report",
        "",
        f"- Config: `{str(config_path).replace(chr(92), '/')}`",
        f"- Kernel: `{metrics['kernel']}`",
        f"- Ridge lambda: `{metrics['ridge_lambda']:.1f}`",
        f"- Gamma scale: `{metrics['gamma_scale']:.6f}`",
        f"- Calibration windows per eval subject: `{metrics['calibration_windows_per_subject']}`",
        f"- Runtime seconds: `{metrics['runtime_sec']:.3f}`",
        f"- Peak memory MB: `{metrics['peak_memory_mb']:.3f}`",
        "",
        "## Reference Linear Baseline",
        "",
        f"- Linear reference config: `{metrics['reference_linear']['config']}`",
        f"- Linear best branch: `{metrics['reference_linear']['best_branch']}`",
        f"- Linear best aggregate relative MSE: `{metrics['reference_linear']['best_branch_aggregate_relative_mse']:.6f}`",
        f"- Linear best aggregate delta relative MSE: `{metrics['reference_linear']['best_branch_aggregate_delta_relative_mse']:.6f}`",
        "",
    ]
    mode_metrics = metrics["modes"]["calibrated_absolute"]
    best_branch = mode_metrics["best_branch"]
    best_branch_metrics = mode_metrics["branches"][best_branch]
    lines.extend(
        [
            "## Calibrated Absolute",
            "",
            f"- Best branch: `{best_branch}`",
            f"- Aggregate model relative MSE: `{best_branch_metrics['aggregate_model_relative_mse']:.6f}`",
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
                    f"- Gamma: `{target_metrics['gamma']:.8f}`",
                    f"- Median squared distance: `{target_metrics['median_squared_distance']:.8f}`",
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
    parser = argparse.ArgumentParser(description="Train DS006848 calibrated RBF baselines.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_calibrated_rbf_amplitude_cohort_swap.toml",
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
    reference_linear_metrics_path = Path(config["baseline"]["reference_linear_metrics"])

    ridge_lambda = float(config["model"]["ridge_lambda"])
    gamma_scale = float(config["model"]["gamma_scale"])
    distance_floor = float(config["model"].get("distance_floor", 1.0e-12))
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
    linear_reference = load_json(reference_linear_metrics_path)

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
        "kernel": "rbf_median",
        "ridge_lambda": ridge_lambda,
        "gamma_scale": gamma_scale,
        "calibration_windows_per_subject": calibration_windows_per_subject,
        "target_names": target_names,
        "aggregate_target_names": aggregate_target_names,
        "reference_linear": linear_reference_summary(linear_reference),
        "modes": {
            "calibrated_absolute": {"branches": {}},
        },
    }

    for branch_name in feature_branches:
        metrics["modes"]["calibrated_absolute"]["branches"][branch_name] = {"per_target": {}}
        features = arrays[branch_name].reshape(arrays[branch_name].shape[0], -1).astype(np.float64)
        x_train_all = features[train_quality_mask]
        x_means, x_scales = feature_stats(x_train_all)

        for target_name in target_names:
            target_values = target_arrays[target_name].astype(np.float64)
            target_valid = target_arrays[target_valid_key(target_name)].astype(bool)
            train_mask = train_quality_mask & target_valid
            eval_mask = eval_quality_mask & target_valid

            train_count = int(np.sum(train_mask))
            eval_count = int(np.sum(eval_mask))
            if train_count < min_train_windows_per_target or eval_count < min_eval_windows_per_target:
                raise SystemExit(
                    f"Target {target_name} does not meet minimum coverage: train={train_count}, eval={eval_count}."
                )

            train_groups = subject_index_groups(train_mask, metadata, sort_by_event=False)
            eval_groups = subject_index_groups(eval_mask, metadata, sort_by_event=True)
            train_stats = build_subject_stats(target_values, train_groups, std_floor=subject_std_floor)

            train_indices = np.flatnonzero(train_mask).tolist()
            eval_indices = np.flatnonzero(eval_mask).tolist()
            x_train_target = standardize(features[np.asarray(train_indices, dtype=np.int64)], x_means, x_scales)
            y_train = zscore_by_subject(target_values, metadata, train_indices, train_stats)

            gamma, median_squared_distance = median_heuristic_gamma(
                x_train_target,
                gamma_scale,
                floor=distance_floor,
            )

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

            x_eval_target = standardize(features[np.asarray(calibrated_test_indices, dtype=np.int64)], x_means, x_scales)
            predictions_z = rbf_kernel_ridge_predict(
                x_train_target,
                y_train,
                x_eval_target,
                ridge_lambda=ridge_lambda,
                gamma=gamma,
            )
            targets_abs = target_values[np.asarray(calibrated_test_indices, dtype=np.int64)].reshape(-1, 1)
            predictions_abs = absolute_from_subject_zscores(
                predictions_z,
                metadata,
                calibrated_test_indices,
                calibration_stats,
            )
            null_abs = subject_mean_predictions(metadata, calibrated_test_indices, calibration_stats)

            per_subject: dict[str, dict[str, float | int]] = {}
            local_lookup = {global_index: local_index for local_index, global_index in enumerate(calibrated_test_indices)}
            for subject_id, subject_eval_indices in eval_groups.items():
                subject_test_indices = subject_eval_indices[calibration_windows_per_subject:]
                local_indices = [local_lookup[index] for index in subject_test_indices]
                model_mse = mse(predictions_abs[local_indices], targets_abs[local_indices])
                null_mse = mse(null_abs[local_indices], targets_abs[local_indices])
                per_subject[subject_id] = {
                    "calibration_windows": calibration_windows_per_subject,
                    "eval_windows": len(local_indices),
                    "model_mse": model_mse,
                    "null_mse": null_mse,
                    "relative_mse": relative_error(model_mse, null_mse, floor=null_mse_floor),
                    "delta_mse": model_mse - null_mse,
                }

            model_mse = mse(predictions_abs, targets_abs)
            null_mse = mse(null_abs, targets_abs)
            model_mae = mae(predictions_abs, targets_abs)
            null_mae = mae(null_abs, targets_abs)
            metrics["modes"]["calibrated_absolute"]["branches"][branch_name]["per_target"][target_name] = {
                "train_windows": len(train_indices),
                "eval_windows": len(calibrated_test_indices),
                "calibration_windows_per_subject": calibration_windows_per_subject,
                "gamma": gamma,
                "median_squared_distance": median_squared_distance,
                "model_mse": model_mse,
                "null_mse": null_mse,
                "relative_mse": relative_error(model_mse, null_mse, floor=null_mse_floor),
                "model_mae": model_mae,
                "null_mae": null_mae,
                "relative_mae": relative_error(model_mae, null_mae, floor=null_mse_floor),
                "model_corr": pearson(predictions_abs, targets_abs),
                "null_corr": pearson(null_abs, targets_abs),
                "delta_mse": model_mse - null_mse,
                "beats_null_mse": model_mse < null_mse,
                "per_subject": per_subject,
            }

        branch_metrics = metrics["modes"]["calibrated_absolute"]["branches"][branch_name]
        branch_metrics.update(
            aggregate_relative_section(
                branch_metrics["per_target"],
                aggregate_target_names=aggregate_target_names,
            )
        )

    calibrated_mode = metrics["modes"]["calibrated_absolute"]
    calibrated_mode["best_branch"] = min(
        feature_branches,
        key=lambda candidate: calibrated_mode["branches"][candidate]["aggregate_model_relative_mse"],
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
    print(f"Wrote calibrated RBF baseline report to {report_path}")
    print(f"Wrote calibrated RBF baseline metrics to {metrics_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
