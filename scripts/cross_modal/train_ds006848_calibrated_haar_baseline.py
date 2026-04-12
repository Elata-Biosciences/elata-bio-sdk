#!/usr/bin/env python3
"""Train DS006848 calibrated Haar low-rank baselines on amplitude targets."""

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


def low_rank_reference_summary(metrics: dict) -> dict[str, float | int | str]:
    best_candidate = metrics["best_candidate"]
    return {
        "config": metrics["config"],
        "branch": best_candidate["branch"],
        "rank": int(best_candidate["rank"]),
        "aggregate_model_relative_mse": float(best_candidate["aggregate_model_relative_mse"]),
        "aggregate_delta_relative_mse": float(best_candidate["aggregate_delta_relative_mse"]),
    }


def full_haar_transform_last_axis(array: np.ndarray, levels: int) -> np.ndarray:
    transformed = array.astype(np.float64, copy=False)
    details: list[np.ndarray] = []
    for _ in range(levels):
        length = transformed.shape[-1]
        if length % 2 != 0:
            raise SystemExit(f"Haar transform requires even axis lengths at every level; found length {length}.")
        even = transformed[..., 0::2]
        odd = transformed[..., 1::2]
        transformed = (even + odd) / np.sqrt(2.0)
        details.append((even - odd) / np.sqrt(2.0))
    return np.concatenate([transformed, *reversed(details)], axis=-1)


def haar_feature_view(features: np.ndarray, levels: int) -> np.ndarray:
    window_length = features.shape[-1]
    if window_length <= 0 or (window_length & (window_length - 1)) != 0:
        raise SystemExit(
            f"Haar feature view requires power-of-two window length; found {window_length} for source branch."
        )
    max_levels = int(np.log2(window_length))
    if levels < 1 or levels > max_levels:
        raise SystemExit(f"Requested Haar levels {levels} but valid range is 1..{max_levels}.")
    return full_haar_transform_last_axis(features, levels)


def compute_basis(features: np.ndarray, train_quality_mask: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    train_features = features[train_quality_mask]
    means, scales = feature_stats(train_features)
    train_std = standardize(train_features, means, scales)
    _, _, vt = np.linalg.svd(train_std, full_matrices=False)
    return means, scales, vt


def build_report(*, config_path: Path, metrics: dict) -> str:
    lines = [
        "# DS006848 Calibrated Haar Baseline Report",
        "",
        f"- Config: `{str(config_path).replace(chr(92), '/')}`",
        f"- Source branch: `{metrics['source_branch']}`",
        f"- Feature view: `{metrics['feature_view']}`",
        f"- Haar levels: `{metrics['haar_levels']}`",
        f"- Ridge lambda: `{metrics['ridge_lambda']:.1f}`",
        f"- Candidate ranks: `{', '.join(str(rank) for rank in metrics['candidate_ranks'])}`",
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
        "## Best Haar Candidate",
        "",
        f"- Best rank: `{metrics['best_rank']}`",
        f"- Aggregate relative MSE: `{metrics['aggregate_model_relative_mse']:.6f}`",
        f"- Aggregate delta relative MSE: `{metrics['aggregate_delta_relative_mse']:.6f}`",
        f"- Beats null aggregate relative MSE: `{metrics['beats_null_relative_mse']}`",
        "",
        "## Rank Sweep",
        "",
    ]

    for rank in metrics["candidate_ranks"]:
        rank_metrics = metrics["ranks"][str(rank)]
        lines.append(
            f"- rank `{rank}`: aggregate relative MSE `{rank_metrics['aggregate_model_relative_mse']:.6f}`, delta `{rank_metrics['aggregate_delta_relative_mse']:.6f}`"
        )
    lines.append("")

    best_rank_metrics = metrics["ranks"][str(metrics["best_rank"])]
    for target_name in metrics["target_names"]:
        target_metrics = best_rank_metrics["per_target"][target_name]
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
    parser = argparse.ArgumentParser(description="Train DS006848 calibrated Haar baselines.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_calibrated_haar_amplitude_cohort_swap.toml",
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

    ridge_lambda = float(config["model"]["ridge_lambda"])
    candidate_ranks = [int(rank) for rank in config["model"]["candidate_ranks"]]
    source_branch = str(config["baseline"]["source_branch"])
    feature_view = str(config["baseline"]["feature_view"])
    target_names = list(config["baseline"]["target_names"])
    aggregate_target_names = list(config["baseline"]["aggregate_target_names"])
    min_train_windows_per_target = int(config["baseline"]["min_train_windows_per_target"])
    min_eval_windows_per_target = int(config["baseline"]["min_eval_windows_per_target"])
    calibration_windows_per_subject = int(config["calibration"]["eval_windows_per_subject"])
    subject_std_floor = float(config["calibration"]["subject_std_floor"])
    null_mse_floor = float(config["calibration"]["null_mse_floor"])
    haar_levels = int(config["feature_view"]["haar_levels"])

    arrays = np.load(dataset_path)
    target_arrays = np.load(targets_path)
    metadata = load_json(metadata_path)["windows"]
    reference_low_rank = load_json(reference_low_rank_metrics_path)

    source_features = arrays[source_branch].astype(np.float64)
    transformed = haar_feature_view(source_features, haar_levels).reshape(source_features.shape[0], -1)

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

    x_means, x_scales, vt = compute_basis(transformed, train_quality_mask)
    standardized = standardize(transformed, x_means, x_scales)
    max_rank = min(vt.shape[0], vt.shape[1])
    valid_candidate_ranks = [rank for rank in candidate_ranks if rank <= max_rank]
    if not valid_candidate_ranks:
        raise SystemExit("No valid candidate ranks for transformed Haar feature view.")
    projected_cache = {rank: standardized @ vt[:rank].T for rank in valid_candidate_ranks}

    metrics = {
        "config": str(config_path).replace("\\", "/"),
        "source_branch": source_branch,
        "feature_view": feature_view,
        "haar_levels": haar_levels,
        "ridge_lambda": ridge_lambda,
        "candidate_ranks": valid_candidate_ranks,
        "calibration_windows_per_subject": calibration_windows_per_subject,
        "target_names": target_names,
        "aggregate_target_names": aggregate_target_names,
        "reference_low_rank": low_rank_reference_summary(reference_low_rank),
        "ranks": {},
    }

    for rank in valid_candidate_ranks:
        rank_metrics = {"per_target": {}}
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
            train_projected = projected_cache[rank][np.asarray(train_indices, dtype=np.int64)]
            y_train = zscore_by_subject(target_values, metadata, train_indices, train_stats)

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

            eval_projected = projected_cache[rank][np.asarray(calibrated_test_indices, dtype=np.int64)]
            predictions_z = ridge_dual_predict(train_projected, y_train, eval_projected, ridge_lambda)
            targets_abs = target_values[np.asarray(calibrated_test_indices, dtype=np.int64)].reshape(-1, 1)
            predictions_abs = absolute_from_subject_zscores(
                predictions_z,
                metadata,
                calibrated_test_indices,
                calibration_stats,
            )
            null_abs = subject_mean_predictions(metadata, calibrated_test_indices, calibration_stats)

            relative_mse = relative_error(mse(predictions_abs, targets_abs), mse(null_abs, targets_abs), floor=null_mse_floor)
            relative_mae = relative_error(mae(predictions_abs, targets_abs), mae(null_abs, targets_abs), floor=null_mse_floor)
            rank_metrics["per_target"][target_name] = {
                "train_windows": train_count,
                "eval_windows": len(calibrated_test_indices),
                "calibration_windows_per_subject": calibration_windows_per_subject,
                "model_mse": mse(predictions_abs, targets_abs),
                "null_mse": mse(null_abs, targets_abs),
                "relative_mse": relative_mse,
                "model_mae": mae(predictions_abs, targets_abs),
                "null_mae": mae(null_abs, targets_abs),
                "relative_mae": relative_mae,
                "model_corr": pearson(predictions_abs, targets_abs),
                "null_corr": pearson(null_abs, targets_abs),
                "delta_mse": mse(predictions_abs, targets_abs) - mse(null_abs, targets_abs),
                "beats_null_mse": relative_mse < 1.0,
            }

        rank_metrics.update(aggregate_relative_section(rank_metrics["per_target"], aggregate_target_names))
        metrics["ranks"][str(rank)] = rank_metrics

    best_rank = min(
        valid_candidate_ranks,
        key=lambda rank: metrics["ranks"][str(rank)]["aggregate_model_relative_mse"],
    )
    best_metrics = metrics["ranks"][str(best_rank)]
    metrics.update(
        {
            "best_rank": best_rank,
            "aggregate_model_relative_mse": float(best_metrics["aggregate_model_relative_mse"]),
            "aggregate_null_relative_mse": float(best_metrics["aggregate_null_relative_mse"]),
            "aggregate_model_relative_mae": float(best_metrics["aggregate_model_relative_mae"]),
            "aggregate_null_relative_mae": float(best_metrics["aggregate_null_relative_mae"]),
            "aggregate_delta_relative_mse": float(best_metrics["aggregate_delta_relative_mse"]),
            "beats_null_relative_mse": bool(best_metrics["beats_null_relative_mse"]),
            "best_candidate": {
                "rank": best_rank,
                "aggregate_model_relative_mse": float(best_metrics["aggregate_model_relative_mse"]),
                "aggregate_delta_relative_mse": float(best_metrics["aggregate_delta_relative_mse"]),
            },
        }
    )

    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    del current
    metrics["runtime_sec"] = time.perf_counter() - start
    metrics["peak_memory_mb"] = peak / (1024 * 1024)

    ensure_parent(report_path)
    ensure_parent(metrics_path)
    report_path.write_text(build_report(config_path=config_path, metrics=metrics), encoding="utf-8")
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print(f"Wrote calibrated Haar baseline report to {report_path}")
    print(f"Wrote calibrated Haar baseline metrics to {metrics_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
