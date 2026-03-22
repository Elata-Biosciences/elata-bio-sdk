#!/usr/bin/env python3
"""Train a variant-routed EEG-to-fNIRS baseline on DS004514 paired waveform artifacts."""

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
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def flatten_windows(array: np.ndarray) -> np.ndarray:
    return array.reshape(array.shape[0], -1).astype(np.float64)


def feature_stats(features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    means = features.mean(axis=0)
    scales = features.std(axis=0)
    scales[scales < 1e-6] = 1.0
    return means, scales


def standardize(features: np.ndarray, means: np.ndarray, scales: np.ndarray) -> np.ndarray:
    return (features - means) / scales


def ridge_dual_predict(
    train_features: np.ndarray,
    train_targets: np.ndarray,
    eval_features: np.ndarray,
    ridge_lambda: float,
) -> np.ndarray:
    gram = train_features @ train_features.T
    identity = np.eye(gram.shape[0], dtype=np.float64)
    alpha = np.linalg.solve(gram + ridge_lambda * identity, train_targets)
    cross = eval_features @ train_features.T
    return cross @ alpha


def mse(predictions: np.ndarray, targets: np.ndarray) -> float:
    return float(np.mean((predictions - targets) ** 2))


def mae(predictions: np.ndarray, targets: np.ndarray) -> float:
    return float(np.mean(np.abs(predictions - targets)))


def pearson_flat(predictions: np.ndarray, targets: np.ndarray) -> float:
    pred = predictions.reshape(-1)
    truth = targets.reshape(-1)
    pred_centered = pred - pred.mean()
    truth_centered = truth - truth.mean()
    denom = math.sqrt(float(np.sum(pred_centered**2) * np.sum(truth_centered**2)))
    if denom <= 1e-12:
        return 0.0
    return float(np.sum(pred_centered * truth_centered) / denom)


def run_variant(variant_name: str, variant_config: dict, ridge_lambda: float) -> dict:
    arrays = np.load(Path(variant_config["dataset"]))
    metadata = load_json(Path(variant_config["metadata"]))["windows"]
    paired_metrics = load_json(Path(variant_config["metrics"]))

    eeg = flatten_windows(arrays["eeg_windows"])
    fnirs = flatten_windows(arrays["fnirs_windows"])
    train_indices = [idx for idx, row in enumerate(metadata) if row["split"] == "train"]
    eval_indices = [idx for idx, row in enumerate(metadata) if row["split"] == "eval"]

    if not train_indices or not eval_indices:
        raise SystemExit(f"Variant {variant_name} must contain both train and eval windows.")

    eeg_train = eeg[train_indices]
    eeg_eval = eeg[eval_indices]
    fnirs_train = fnirs[train_indices]
    fnirs_eval = fnirs[eval_indices]

    eeg_means, eeg_scales = feature_stats(eeg_train)
    eeg_train_std = standardize(eeg_train, eeg_means, eeg_scales)
    eeg_eval_std = standardize(eeg_eval, eeg_means, eeg_scales)

    predictions = ridge_dual_predict(
        train_features=eeg_train_std,
        train_targets=fnirs_train,
        eval_features=eeg_eval_std,
        ridge_lambda=ridge_lambda,
    )
    null_predictions = np.repeat(fnirs_train.mean(axis=0, keepdims=True), repeats=len(eval_indices), axis=0)

    return {
        "variant": variant_name,
        "train_windows": len(train_indices),
        "eval_windows": len(eval_indices),
        "eeg_input_shape": list(arrays["eeg_windows"].shape[1:]),
        "fnirs_target_shape": list(arrays["fnirs_windows"].shape[1:]),
        "alignment_rmse_seconds": float(paired_metrics["max_subject_rmse_seconds"]),
        "model_mse": mse(predictions, fnirs_eval),
        "null_mse": mse(null_predictions, fnirs_eval),
        "model_mae": mae(predictions, fnirs_eval),
        "null_mae": mae(null_predictions, fnirs_eval),
        "model_corr": pearson_flat(predictions, fnirs_eval),
        "null_corr": pearson_flat(null_predictions, fnirs_eval),
        "mse_ratio_vs_null": mse(predictions, fnirs_eval) / max(mse(null_predictions, fnirs_eval), 1e-12),
        "beats_null_mse": mse(predictions, fnirs_eval) < mse(null_predictions, fnirs_eval),
    }


def build_report(config_path: Path, report_path: Path, metrics_path: Path, runtime_sec: float, peak_memory_mb: float, metrics: dict) -> None:
    ensure_parent(report_path)
    ensure_parent(metrics_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    lines = [
        "# DS004514 Variant-Routed Baseline Report",
        "",
        f"- Config: `{config_path}`",
        f"- Runtime seconds: `{runtime_sec:.3f}`",
        f"- Peak memory MB: `{peak_memory_mb:.3f}`",
        "",
        "## Aggregate",
        "",
        f"- Routed variants: `{metrics['aggregate']['variant_count']}`",
        f"- Total train windows: `{metrics['aggregate']['train_windows']}`",
        f"- Total eval windows: `{metrics['aggregate']['eval_windows']}`",
        f"- Weighted model MSE: `{metrics['aggregate']['weighted_model_mse']:.6f}`",
        f"- Weighted null MSE: `{metrics['aggregate']['weighted_null_mse']:.6f}`",
        f"- Weighted MSE ratio vs null: `{metrics['aggregate']['weighted_mse_ratio_vs_null']:.6f}`",
        f"- Weighted model corr: `{metrics['aggregate']['weighted_model_corr']:.6f}`",
        f"- Weighted null corr: `{metrics['aggregate']['weighted_null_corr']:.6f}`",
        "",
        "## Per-Variant",
        "",
    ]
    for variant in metrics["variants"]:
        lines.extend(
            [
                f"### {variant['variant']}",
                "",
                f"- Train windows: `{variant['train_windows']}`",
                f"- Eval windows: `{variant['eval_windows']}`",
                f"- EEG shape: `{variant['eeg_input_shape']}`",
                f"- fNIRS shape: `{variant['fnirs_target_shape']}`",
                f"- Alignment RMSE (s): `{variant['alignment_rmse_seconds']:.6f}`",
                f"- Model MSE: `{variant['model_mse']:.6f}`",
                f"- Null MSE: `{variant['null_mse']:.6f}`",
                f"- MSE ratio vs null: `{variant['mse_ratio_vs_null']:.6f}`",
                f"- Model corr: `{variant['model_corr']:.6f}`",
                f"- Null corr: `{variant['null_corr']:.6f}`",
                f"- Beats null MSE: `{variant['beats_null_mse']}`",
                "",
            ]
        )
    lines.extend(
        [
            "## Interpretation",
            "",
            "- This routed baseline is currently an executable negative control, not a winning cross-subject model.",
            "- The fact that it underperforms the null on held-out subjects is itself informative for planning.",
            "",
        ]
    )
    report_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Train a variant-routed EEG-to-fNIRS baseline for DS004514.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_variant_routed_baseline.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    report_path = Path(config["paths"]["report"])
    metrics_path = Path(config["paths"]["metrics"])
    ridge_lambda = float(config["baseline"]["ridge_lambda"])

    tracemalloc.start()
    start = time.perf_counter()

    variants = []
    for variant_key, variant_config in config["variant"].items():
        variants.append(run_variant(variant_name=variant_key, variant_config=variant_config, ridge_lambda=ridge_lambda))

    runtime_sec = time.perf_counter() - start
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    peak_memory_mb = peak_memory_bytes / (1024 * 1024)

    total_eval = sum(variant["eval_windows"] for variant in variants)
    aggregate = {
        "variant_count": len(variants),
        "train_windows": sum(variant["train_windows"] for variant in variants),
        "eval_windows": total_eval,
        "weighted_model_mse": sum(variant["model_mse"] * variant["eval_windows"] for variant in variants) / total_eval,
        "weighted_null_mse": sum(variant["null_mse"] * variant["eval_windows"] for variant in variants) / total_eval,
        "weighted_mse_ratio_vs_null": (
            sum(variant["model_mse"] * variant["eval_windows"] for variant in variants)
            / max(sum(variant["null_mse"] * variant["eval_windows"] for variant in variants), 1e-12)
        ),
        "weighted_model_mae": sum(variant["model_mae"] * variant["eval_windows"] for variant in variants) / total_eval,
        "weighted_null_mae": sum(variant["null_mae"] * variant["eval_windows"] for variant in variants) / total_eval,
        "weighted_model_corr": sum(variant["model_corr"] * variant["eval_windows"] for variant in variants) / total_eval,
        "weighted_null_corr": sum(variant["null_corr"] * variant["eval_windows"] for variant in variants) / total_eval,
        "beats_null_mse": (
            sum(variant["model_mse"] * variant["eval_windows"] for variant in variants)
            < sum(variant["null_mse"] * variant["eval_windows"] for variant in variants)
        ),
    }
    metrics = {
        "config": str(config_path).replace("\\", "/"),
        "runtime_sec": runtime_sec,
        "peak_memory_mb": peak_memory_mb,
        "aggregate": aggregate,
        "variants": variants,
    }

    build_report(
        config_path=config_path,
        report_path=report_path,
        metrics_path=metrics_path,
        runtime_sec=runtime_sec,
        peak_memory_mb=peak_memory_mb,
        metrics=metrics,
    )

    print(f"Wrote baseline report to {report_path}")
    print(f"Wrote baseline metrics to {metrics_path}")
    print(f"Runtime: {runtime_sec:.3f}s, peak memory: {peak_memory_mb:.3f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
