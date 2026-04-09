#!/usr/bin/env python3
"""Train DS006848 calibrated low-rank linear baselines on amplitude targets."""

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


def compute_branch_basis(features: np.ndarray, train_quality_mask: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    branch_train = features[train_quality_mask]
    means, scales = feature_stats(branch_train)
    branch_train_std = standardize(branch_train, means, scales)
    _, _, vt = np.linalg.svd(branch_train_std, full_matrices=False)
    return means, scales, vt


def build_report(*, config_path: Path, metrics: dict) -> str:
    lines = [
        "# DS006848 Calibrated Low-Rank Baseline Report",
        "",
        f"- Config: `{str(config_path).replace(chr(92), '/')}`",
        f"- Ridge lambda: `{metrics['ridge_lambda']:.1f}`",
        f"- Candidate ranks: `{', '.join(str(rank) for rank in metrics['candidate_ranks'])}`",
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
        "## Best Low-Rank Candidate",
        "",
        f"- Best branch: `{metrics['best_candidate']['branch']}`",
        f"- Best rank: `{metrics['best_candidate']['rank']}`",
        f"- Aggregate relative MSE: `{metrics['best_candidate']['aggregate_model_relative_mse']:.6f}`",
        f"- Aggregate delta relative MSE: `{metrics['best_candidate']['aggregate_delta_relative_mse']:.6f}`",
        "",
    ]

    for branch_name, branch_metrics in metrics["branches"].items():
        lines.extend(
            [
                f"## {branch_name}",
                "",
                f"- Best rank: `{branch_metrics['best_rank']}`",
                f"- Best aggregate relative MSE: `{branch_metrics['best_aggregate_relative_mse']:.6f}`",
                f"- Best aggregate delta relative MSE: `{branch_metrics['best_aggregate_delta_relative_mse']:.6f}`",
                "",
                "### Rank Sweep",
                "",
            ]
        )
        for rank in branch_metrics["candidate_ranks"]:
            rank_metrics = branch_metrics["ranks"][str(rank)]
            lines.append(
                f"- rank `{rank}`: aggregate relative MSE `{rank_metrics['aggregate_model_relative_mse']:.6f}`, delta `{rank_metrics['aggregate_delta_relative_mse']:.6f}`"
            )
        lines.append("")
        best_rank_metrics = branch_metrics["ranks"][str(branch_metrics["best_rank"])]
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
    parser = argparse.ArgumentParser(description="Train DS006848 calibrated low-rank baselines.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_swap.toml",
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
    candidate_ranks = [int(rank) for rank in config["model"]["candidate_ranks"]]
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
        "ridge_lambda": ridge_lambda,
        "candidate_ranks": candidate_ranks,
        "calibration_windows_per_subject": calibration_windows_per_subject,
        "target_names": target_names,
        "aggregate_target_names": aggregate_target_names,
        "reference_linear": linear_reference_summary(linear_reference),
        "branches": {},
    }

    for branch_name in feature_branches:
        features = arrays[branch_name].reshape(arrays[branch_name].shape[0], -1).astype(np.float64)
        x_means, x_scales, vt = compute_branch_basis(features, train_quality_mask)
        branch_train_dim = min(vt.shape[0], vt.shape[1])
        branch_candidate_ranks = [rank for rank in candidate_ranks if rank <= branch_train_dim]
        if not branch_candidate_ranks:
            raise SystemExit(f"No valid candidate ranks for branch {branch_name}.")

        branch_metrics = {
            "candidate_ranks": branch_candidate_ranks,
            "ranks": {},
        }

        projected_cache: dict[int, np.ndarray] = {}
        standardized_features = standardize(features, x_means, x_scales)
        for rank in branch_candidate_ranks:
            projected_cache[rank] = standardized_features @ vt[:rank].T

        for rank in branch_candidate_ranks:
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
                eval_indices = np.flatnonzero(eval_mask).tolist()
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
                rank_metrics["per_target"][target_name] = {
                    "train_windows": len(train_indices),
                    "eval_windows": len(calibrated_test_indices),
                    "calibration_windows_per_subject": calibration_windows_per_subject,
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

            rank_metrics.update(
                aggregate_relative_section(
                    rank_metrics["per_target"],
                    aggregate_target_names=aggregate_target_names,
                )
            )
            branch_metrics["ranks"][str(rank)] = rank_metrics

        branch_best_rank = min(
            branch_candidate_ranks,
            key=lambda candidate: branch_metrics["ranks"][str(candidate)]["aggregate_model_relative_mse"],
        )
        branch_metrics["best_rank"] = branch_best_rank
        branch_metrics["best_aggregate_relative_mse"] = branch_metrics["ranks"][str(branch_best_rank)][
            "aggregate_model_relative_mse"
        ]
        branch_metrics["best_aggregate_delta_relative_mse"] = branch_metrics["ranks"][str(branch_best_rank)][
            "aggregate_delta_relative_mse"
        ]
        metrics["branches"][branch_name] = branch_metrics

    best_branch = min(
        feature_branches,
        key=lambda candidate: metrics["branches"][candidate]["best_aggregate_relative_mse"],
    )
    best_rank = metrics["branches"][best_branch]["best_rank"]
    best_rank_metrics = metrics["branches"][best_branch]["ranks"][str(best_rank)]
    metrics["best_candidate"] = {
        "branch": best_branch,
        "rank": best_rank,
        "aggregate_model_relative_mse": best_rank_metrics["aggregate_model_relative_mse"],
        "aggregate_delta_relative_mse": best_rank_metrics["aggregate_delta_relative_mse"],
        "beats_null_relative_mse": best_rank_metrics["beats_null_relative_mse"],
    }

    runtime_sec = time.perf_counter() - start
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    metrics["runtime_sec"] = runtime_sec
    metrics["peak_memory_mb"] = peak_memory_bytes / (1024 * 1024)

    for path in [report_path, metrics_path]:
        ensure_parent(path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    report_path.write_text(build_report(config_path=config_path, metrics=metrics), encoding="utf-8")
    print(f"Wrote calibrated low-rank baseline report to {report_path}")
    print(f"Wrote calibrated low-rank baseline metrics to {metrics_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
