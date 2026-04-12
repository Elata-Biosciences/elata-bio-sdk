#!/usr/bin/env python3
"""Train DS006848 subject-conditioned residual baselines on top of low-rank amplitude models."""

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


def compute_branch_basis(features: np.ndarray, train_quality_mask: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    branch_train = features[train_quality_mask]
    means, scales = feature_stats(branch_train)
    branch_train_std = standardize(branch_train, means, scales)
    _, _, vt = np.linalg.svd(branch_train_std, full_matrices=False)
    return means, scales, vt


def low_rank_reference_summary(metrics: dict) -> dict[str, float | str | int]:
    best = metrics["best_candidate"]
    return {
        "config": metrics["config"],
        "branch": best["branch"],
        "rank": int(best["rank"]),
        "aggregate_model_relative_mse": float(best["aggregate_model_relative_mse"]),
        "aggregate_delta_relative_mse": float(best["aggregate_delta_relative_mse"]),
    }


def build_report(*, config_path: Path, metrics: dict) -> str:
    lines = [
        "# DS006848 Low-Rank Residual Baseline Report",
        "",
        f"- Config: `{str(config_path).replace(chr(92), '/')}`",
        f"- Feature branch: `{metrics['feature_branch']}`",
        f"- Rank: `{metrics['rank']}`",
        f"- Ridge lambda: `{metrics['ridge_lambda']:.1f}`",
        f"- Calibration windows per eval subject: `{metrics['calibration_windows_per_subject']}`",
        f"- Runtime seconds: `{metrics['runtime_sec']:.3f}`",
        f"- Peak memory MB: `{metrics['peak_memory_mb']:.3f}`",
        "",
        "## Reference Low-Rank Baseline",
        "",
        f"- Reference config: `{metrics['reference_low_rank']['config']}`",
        f"- Reference branch: `{metrics['reference_low_rank']['branch']}`",
        f"- Reference rank: `{metrics['reference_low_rank']['rank']}`",
        f"- Reference aggregate relative MSE: `{metrics['reference_low_rank']['aggregate_model_relative_mse']:.6f}`",
        f"- Reference aggregate delta relative MSE: `{metrics['reference_low_rank']['aggregate_delta_relative_mse']:.6f}`",
        "",
        "## Residual Bias Correction",
        "",
        f"- Aggregate relative MSE: `{metrics['aggregate_model_relative_mse']:.6f}`",
        f"- Aggregate delta relative MSE: `{metrics['aggregate_delta_relative_mse']:.6f}`",
        f"- Beats null aggregate relative MSE: `{metrics['beats_null_relative_mse']}`",
        "",
    ]
    for target_name in metrics["target_names"]:
        target_metrics = metrics["per_target"][target_name]
        lines.extend(
            [
                f"### {target_name}",
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
    parser = argparse.ArgumentParser(description="Train DS006848 low-rank residual baselines.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_low_rank_residual_cohort_swap.toml",
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
    reference_low_rank_metrics_path = Path(config["baseline"]["reference_low_rank_metrics"])

    feature_branch = str(config["baseline"]["feature_branch"])
    rank = int(config["baseline"]["rank"])
    ridge_lambda = float(config["model"]["ridge_lambda"])
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
    reference_low_rank = load_json(reference_low_rank_metrics_path)

    train_quality_mask = np.asarray(
        [row["split"] == "train" and row["quality_flags"]["window_quality_pass"] for row in metadata],
        dtype=bool,
    )
    eval_quality_mask = np.asarray(
        [row["split"] == "eval" and row["quality_flags"]["window_quality_pass"] for row in metadata],
        dtype=bool,
    )

    features = arrays[feature_branch].reshape(arrays[feature_branch].shape[0], -1).astype(np.float64)
    x_means, x_scales, vt = compute_branch_basis(features, train_quality_mask)
    if rank > vt.shape[0]:
        raise SystemExit(f"Configured rank {rank} exceeds available basis size {vt.shape[0]}.")
    projected_features = standardize(features, x_means, x_scales) @ vt[:rank].T

    tracemalloc.start()
    start = time.perf_counter()

    metrics = {
        "config": str(config_path).replace("\\", "/"),
        "feature_branch": feature_branch,
        "rank": rank,
        "ridge_lambda": ridge_lambda,
        "calibration_windows_per_subject": calibration_windows_per_subject,
        "target_names": target_names,
        "aggregate_target_names": aggregate_target_names,
        "reference_low_rank": low_rank_reference_summary(reference_low_rank),
        "per_target": {},
    }

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
        train_projected = projected_features[np.asarray(train_indices, dtype=np.int64)]
        y_train = zscore_by_subject(target_values, metadata, train_indices, train_stats)

        calibration_stats: dict[str, dict[str, float]] = {}
        calibration_indices_all: list[int] = []
        test_indices_all: list[int] = []
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
            calibration_indices_all.extend(calibration_indices)
            test_indices_all.extend(test_indices)

        calibration_projected = projected_features[np.asarray(calibration_indices_all, dtype=np.int64)]
        test_projected = projected_features[np.asarray(test_indices_all, dtype=np.int64)]
        calibration_predictions_z = ridge_dual_predict(train_projected, y_train, calibration_projected, ridge_lambda)
        test_predictions_z = ridge_dual_predict(train_projected, y_train, test_projected, ridge_lambda)

        calibration_targets_abs = target_values[np.asarray(calibration_indices_all, dtype=np.int64)].reshape(-1, 1)
        test_targets_abs = target_values[np.asarray(test_indices_all, dtype=np.int64)].reshape(-1, 1)
        calibration_predictions_abs = absolute_from_subject_zscores(
            calibration_predictions_z,
            metadata,
            calibration_indices_all,
            calibration_stats,
        )
        test_predictions_abs = absolute_from_subject_zscores(
            test_predictions_z,
            metadata,
            test_indices_all,
            calibration_stats,
        )
        null_abs = subject_mean_predictions(metadata, test_indices_all, calibration_stats)

        calibration_local_lookup = {
            global_index: local_index for local_index, global_index in enumerate(calibration_indices_all)
        }
        test_local_lookup = {
            global_index: local_index for local_index, global_index in enumerate(test_indices_all)
        }

        adjusted_predictions_abs = np.zeros_like(test_predictions_abs)
        per_subject: dict[str, dict[str, float | int]] = {}
        for subject_id, subject_eval_indices in eval_groups.items():
            subject_calibration_indices = subject_eval_indices[:calibration_windows_per_subject]
            subject_test_indices = subject_eval_indices[calibration_windows_per_subject:]
            calibration_local = [calibration_local_lookup[index] for index in subject_calibration_indices]
            test_local = [test_local_lookup[index] for index in subject_test_indices]

            residual_bias = float(
                np.mean(
                    calibration_targets_abs[calibration_local] - calibration_predictions_abs[calibration_local]
                )
            )
            adjusted_predictions_abs[test_local] = test_predictions_abs[test_local] + residual_bias

            model_mse = mse(adjusted_predictions_abs[test_local], test_targets_abs[test_local])
            null_mse = mse(null_abs[test_local], test_targets_abs[test_local])
            per_subject[subject_id] = {
                "calibration_windows": calibration_windows_per_subject,
                "eval_windows": len(test_local),
                "residual_bias": residual_bias,
                "model_mse": model_mse,
                "null_mse": null_mse,
                "relative_mse": relative_error(model_mse, null_mse, floor=null_mse_floor),
                "delta_mse": model_mse - null_mse,
            }

        model_mse = mse(adjusted_predictions_abs, test_targets_abs)
        null_mse = mse(null_abs, test_targets_abs)
        model_mae = mae(adjusted_predictions_abs, test_targets_abs)
        null_mae = mae(null_abs, test_targets_abs)
        metrics["per_target"][target_name] = {
            "train_windows": train_count,
            "eval_windows": len(test_indices_all),
            "calibration_windows_per_subject": calibration_windows_per_subject,
            "model_mse": model_mse,
            "null_mse": null_mse,
            "relative_mse": relative_error(model_mse, null_mse, floor=null_mse_floor),
            "model_mae": model_mae,
            "null_mae": null_mae,
            "relative_mae": relative_error(model_mae, null_mae, floor=null_mse_floor),
            "model_corr": pearson(adjusted_predictions_abs, test_targets_abs),
            "null_corr": pearson(null_abs, test_targets_abs),
            "delta_mse": model_mse - null_mse,
            "beats_null_mse": model_mse < null_mse,
            "per_subject": per_subject,
        }

    metrics.update(
        aggregate_relative_section(
            metrics["per_target"],
            aggregate_target_names=aggregate_target_names,
        )
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
    print(f"Wrote low-rank residual baseline report to {report_path}")
    print(f"Wrote low-rank residual baseline metrics to {metrics_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
