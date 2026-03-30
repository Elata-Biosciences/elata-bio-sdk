#!/usr/bin/env python3
"""Train pilot DS003838 EEG-to-PPG morphology baselines."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import time
import tomllib
import tracemalloc

import numpy as np


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def feature_stats(features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    means = features.mean(axis=0)
    scales = features.std(axis=0)
    scales[scales < 1e-6] = 1.0
    return means, scales


def standardize(values: np.ndarray, means: np.ndarray, scales: np.ndarray) -> np.ndarray:
    return (values - means) / scales


def unstandardize(values: np.ndarray, means: np.ndarray, scales: np.ndarray) -> np.ndarray:
    return values * scales + means


def ridge_dual_predict(train_features: np.ndarray, train_targets: np.ndarray, eval_features: np.ndarray, ridge_lambda: float) -> np.ndarray:
    gram = train_features @ train_features.T
    identity = np.eye(gram.shape[0], dtype=np.float64)
    alpha = np.linalg.solve(gram + ridge_lambda * identity, train_targets)
    return (eval_features @ train_features.T) @ alpha


def mse(predictions: np.ndarray, targets: np.ndarray) -> float:
    return float(np.mean((predictions - targets) ** 2))


def mae(predictions: np.ndarray, targets: np.ndarray) -> float:
    return float(np.mean(np.abs(predictions - targets)))


def pearson(predictions: np.ndarray, targets: np.ndarray) -> float:
    pred = predictions.reshape(-1)
    truth = targets.reshape(-1)
    pred_centered = pred - pred.mean()
    truth_centered = truth - truth.mean()
    denom = math.sqrt(float(np.sum(pred_centered**2) * np.sum(truth_centered**2)))
    if denom <= 1e-12:
        return 0.0
    return float(np.sum(pred_centered * truth_centered) / denom)


def target_valid_key(name: str) -> str:
    return f"{name}_valid"


def main() -> int:
    parser = argparse.ArgumentParser(description="Train pilot DS003838 EEG-to-PPG morphology baselines.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds003838_morphology_baseline.toml",
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
    ridge_lambda = float(config["baseline"]["ridge_lambda"])
    feature_branches = list(config["baseline"]["feature_branches"])
    target_names = list(config["baseline"]["target_names"])
    aggregate_target_names = list(config["baseline"].get("aggregate_target_names", target_names))
    min_train_windows_per_target = int(config["baseline"].get("min_train_windows_per_target", 1))
    min_eval_windows_per_target = int(config["baseline"].get("min_eval_windows_per_target", 1))

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

    results: dict[str, dict] = {}
    best_branch = None
    best_branch_mse = float("inf")
    for branch_name in feature_branches:
        features = arrays[branch_name].reshape(arrays[branch_name].shape[0], -1).astype(np.float64)
        per_target: dict[str, dict] = {}
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
            predictions = unstandardize(predictions_std, target_means, target_scales)
            null_predictions = np.repeat(target_means[np.newaxis, :], repeats=eval_count, axis=0)

            target_metrics = {
                "train_windows": train_count,
                "eval_windows": eval_count,
                "model_mse": mse(predictions, y_eval),
                "null_mse": mse(null_predictions, y_eval),
                "model_mae": mae(predictions, y_eval),
                "null_mae": mae(null_predictions, y_eval),
                "model_corr": pearson(predictions, y_eval),
                "null_corr": pearson(null_predictions, y_eval),
                "model_mse_std": mse(predictions_std, y_eval_std),
                "null_mse_std": mse(null_predictions_std, y_eval_std),
                "model_mae_std": mae(predictions_std, y_eval_std),
                "null_mae_std": mae(null_predictions_std, y_eval_std),
                "beats_null_mse": mse(predictions, y_eval) < mse(null_predictions, y_eval),
            }
            per_target[target_name] = target_metrics

            if target_name in aggregate_target_names:
                aggregate_model_mses.append(target_metrics["model_mse_std"])
                aggregate_null_mses.append(target_metrics["null_mse_std"])
                aggregate_model_maes.append(target_metrics["model_mae_std"])
                aggregate_null_maes.append(target_metrics["null_mae_std"])

        aggregate_model_mse_std = float(np.mean(aggregate_model_mses))
        aggregate_null_mse_std = float(np.mean(aggregate_null_mses))
        if aggregate_model_mse_std < best_branch_mse:
            best_branch_mse = aggregate_model_mse_std
            best_branch = branch_name

        results[branch_name] = {
            "aggregate_model_mse_std": aggregate_model_mse_std,
            "aggregate_null_mse_std": aggregate_null_mse_std,
            "aggregate_model_mae_std": float(np.mean(aggregate_model_maes)),
            "aggregate_null_mae_std": float(np.mean(aggregate_null_maes)),
            "beats_null_std_mse": aggregate_model_mse_std < aggregate_null_mse_std,
            "aggregate_target_names": aggregate_target_names,
            "per_target": per_target,
        }

    runtime_sec = time.perf_counter() - start
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    peak_memory_mb = peak_memory_bytes / (1024 * 1024)

    metrics = {
        "config": str(config_path).replace("\\", "/"),
        "ridge_lambda": ridge_lambda,
        "runtime_sec": runtime_sec,
        "peak_memory_mb": peak_memory_mb,
        "train_windows": int(np.sum(train_quality_mask)),
        "eval_windows": int(np.sum(eval_quality_mask)),
        "target_names": target_names,
        "aggregate_target_names": aggregate_target_names,
        "best_branch": best_branch,
        "branches": results,
    }

    ensure_parent(report_path)
    ensure_parent(metrics_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    lines = [
        "# DS003838 Morphology Baseline Report",
        "",
        f"- Config: `{str(config_path).replace(chr(92), '/')}`",
        f"- Ridge lambda: `{ridge_lambda:.1f}`",
        f"- Runtime seconds: `{runtime_sec:.3f}`",
        f"- Peak memory MB: `{peak_memory_mb:.3f}`",
        f"- Train windows: `{int(np.sum(train_quality_mask))}`",
        f"- Eval windows: `{int(np.sum(eval_quality_mask))}`",
        f"- Best branch by standardized MSE: `{best_branch}`",
        f"- Aggregate target set: `{', '.join(aggregate_target_names)}`",
        "",
    ]
    for branch_name in feature_branches:
        branch = results[branch_name]
        lines.extend(
            [
                f"## {branch_name}",
                "",
                f"- Aggregate standardized model MSE: `{branch['aggregate_model_mse_std']:.6f}`",
                f"- Aggregate standardized null MSE: `{branch['aggregate_null_mse_std']:.6f}`",
                f"- Aggregate standardized model MAE: `{branch['aggregate_model_mae_std']:.6f}`",
                f"- Aggregate standardized null MAE: `{branch['aggregate_null_mae_std']:.6f}`",
                f"- Beats null standardized MSE: `{branch['beats_null_std_mse']}`",
                "",
            ]
        )
        for target_name in target_names:
            target = branch["per_target"][target_name]
            lines.extend(
                [
                    f"### {target_name}",
                    "",
                    f"- Train windows: `{target['train_windows']}`",
                    f"- Eval windows: `{target['eval_windows']}`",
                    f"- Model MSE: `{target['model_mse']:.6f}`",
                    f"- Null MSE: `{target['null_mse']:.6f}`",
                    f"- Model MAE: `{target['model_mae']:.6f}`",
                    f"- Null MAE: `{target['null_mae']:.6f}`",
                    f"- Model corr: `{target['model_corr']:.6f}`",
                    f"- Null corr: `{target['null_corr']:.6f}`",
                    f"- Model standardized MSE: `{target['model_mse_std']:.6f}`",
                    f"- Null standardized MSE: `{target['null_mse_std']:.6f}`",
                    f"- Beats null MSE: `{target['beats_null_mse']}`",
                    "",
                ]
            )

    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote morphology baseline report to {report_path}")
    print(f"Wrote morphology baseline metrics to {metrics_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
