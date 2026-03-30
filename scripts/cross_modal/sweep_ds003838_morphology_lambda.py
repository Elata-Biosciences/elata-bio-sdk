#!/usr/bin/env python3
"""Sweep ridge regularization for the DS003838 morphology baseline."""

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
    load_json,
    load_config,
    mse,
    ridge_dual_predict,
    standardize,
    target_valid_key,
)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def build_report(config_path: Path, metrics: dict) -> str:
    lines = [
        "# DS003838 Morphology Lambda Sweep",
        "",
        f"- Config: `{str(config_path).replace(chr(92), '/')}`",
        f"- Runtime seconds: `{metrics['runtime_sec']:.3f}`",
        f"- Peak memory MB: `{metrics['peak_memory_mb']:.3f}`",
        "",
    ]
    for branch_name, branch in metrics["branches"].items():
        lines.extend(
            [
                f"## {branch_name}",
                "",
                f"- Null aggregate standardized MSE: `{branch['aggregate_null_mse_std']:.6f}`",
                f"- Best lambda: `{branch['best_lambda']:.1f}`",
                f"- Best aggregate standardized MSE: `{branch['best_aggregate_model_mse_std']:.6f}`",
                f"- Beats null at any tested lambda: `{branch['beats_null_any_lambda']}`",
                "",
                "| lambda | aggregate standardized MSE | beats null |",
                "| --- | ---: | :---: |",
            ]
        )
        for row in branch["sweep"]:
            lines.append(
                f"| `{row['ridge_lambda']:.1f}` | `{row['aggregate_model_mse_std']:.6f}` | `{row['beats_null_std_mse']}` |"
            )
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Sweep ridge regularization for DS003838 morphology baselines.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds003838_morphology_sweep_expanded.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    dataset_path = Path(config["sweep"]["dataset"])
    metadata_path = Path(config["sweep"]["metadata"])
    targets_path = Path(config["sweep"]["targets"])
    feature_branches = list(config["sweep"]["feature_branches"])
    target_names = list(config["sweep"]["target_names"])
    aggregate_target_names = list(config["sweep"]["aggregate_target_names"])
    ridge_lambdas = [float(value) for value in config["sweep"]["ridge_lambdas"]]
    min_train_windows_per_target = int(config["sweep"].get("min_train_windows_per_target", 1))
    min_eval_windows_per_target = int(config["sweep"].get("min_eval_windows_per_target", 1))
    metrics_path = Path(config["paths"]["metrics"])
    report_path = Path(config["paths"]["report"])

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

    tracemalloc.start()
    start = time.perf_counter()

    metrics = {
        "config": str(config_path).replace("\\", "/"),
        "ridge_lambdas": ridge_lambdas,
        "target_names": target_names,
        "aggregate_target_names": aggregate_target_names,
        "train_windows": int(np.sum(train_quality_mask)),
        "eval_windows": int(np.sum(eval_quality_mask)),
        "branches": {},
    }

    for branch_name in feature_branches:
        features = arrays[branch_name].reshape(arrays[branch_name].shape[0], -1).astype(np.float64)
        branch_rows: list[dict] = []
        null_aggregate = None
        for ridge_lambda in ridge_lambdas:
            aggregate_model_mses: list[float] = []
            aggregate_null_mses: list[float] = []
            for target_name in aggregate_target_names:
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
                aggregate_model_mses.append(mse(predictions_std, y_eval_std))
                aggregate_null_mses.append(mse(null_predictions_std, y_eval_std))

            aggregate_model_mse_std = float(np.mean(aggregate_model_mses))
            aggregate_null_mse_std = float(np.mean(aggregate_null_mses))
            if null_aggregate is None:
                null_aggregate = aggregate_null_mse_std
            branch_rows.append(
                {
                    "ridge_lambda": ridge_lambda,
                    "aggregate_model_mse_std": aggregate_model_mse_std,
                    "aggregate_null_mse_std": aggregate_null_mse_std,
                    "beats_null_std_mse": aggregate_model_mse_std < aggregate_null_mse_std,
                }
            )

        best_row = min(branch_rows, key=lambda row: row["aggregate_model_mse_std"])
        metrics["branches"][branch_name] = {
            "aggregate_null_mse_std": null_aggregate,
            "best_lambda": best_row["ridge_lambda"],
            "best_aggregate_model_mse_std": best_row["aggregate_model_mse_std"],
            "beats_null_any_lambda": any(row["beats_null_std_mse"] for row in branch_rows),
            "sweep": branch_rows,
        }

    runtime_sec = time.perf_counter() - start
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    metrics["runtime_sec"] = runtime_sec
    metrics["peak_memory_mb"] = peak_memory_bytes / (1024 * 1024)

    ensure_parent(metrics_path)
    ensure_parent(report_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    report_path.write_text(build_report(config_path, metrics), encoding="utf-8")
    print(f"Wrote sweep metrics to {metrics_path}")
    print(f"Wrote sweep report to {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
