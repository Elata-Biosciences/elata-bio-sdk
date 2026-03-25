#!/usr/bin/env python3
"""Train a single canonicalized EEG-to-fNIRS baseline across both DS004514 variants."""

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


def standardize(features: np.ndarray, means: np.ndarray, scales: np.ndarray) -> np.ndarray:
    return (features - means) / scales


def ridge_dual_predict(train_features: np.ndarray, train_targets: np.ndarray, eval_features: np.ndarray, ridge_lambda: float) -> np.ndarray:
    gram = train_features @ train_features.T
    identity = np.eye(gram.shape[0], dtype=np.float64)
    alpha = np.linalg.solve(gram + ridge_lambda * identity, train_targets)
    return (eval_features @ train_features.T) @ alpha


def mse(predictions: np.ndarray, targets: np.ndarray) -> float:
    return float(np.mean((predictions - targets) ** 2))


def pearson_flat(predictions: np.ndarray, targets: np.ndarray) -> float:
    pred = predictions.reshape(-1)
    truth = targets.reshape(-1)
    pred_centered = pred - pred.mean()
    truth_centered = truth - truth.mean()
    denom = math.sqrt(float(np.sum(pred_centered**2) * np.sum(truth_centered**2)))
    if denom <= 1e-12:
        return 0.0
    return float(np.sum(pred_centered * truth_centered) / denom)


def main() -> int:
    parser = argparse.ArgumentParser(description="Train a canonicalized DS004514 EEG-to-fNIRS baseline.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_canonicalized_baseline.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    dataset_path = Path(config["baseline"]["dataset"])
    metadata_path = Path(config["baseline"]["metadata"])
    routed_metrics_path = Path(config["baseline"]["routed_metrics"])
    report_path = Path(config["paths"]["report"])
    metrics_path = Path(config["paths"]["metrics"])
    ridge_lambda = float(config["baseline"]["ridge_lambda"])
    policy_path = Path(config["policy"]["subject_quality_policy"])
    allowed_tier = config["policy"]["allowed_tier"]

    arrays = np.load(dataset_path)
    metadata = load_json(metadata_path)["windows"]
    routed_metrics = load_json(routed_metrics_path)
    policy = load_json(policy_path)
    allowed_subjects = set(policy["tiers"][allowed_tier])
    subjects = {row["subject_id"] for row in metadata}
    disallowed = sorted(subject for subject in subjects if subject not in allowed_subjects)
    if disallowed:
        raise SystemExit(
            f"Metadata contains disallowed subjects {disallowed} for subject-quality tier "
            f"'{allowed_tier}' from {policy_path}."
        )

    eeg = arrays["eeg_windows"].reshape(arrays["eeg_windows"].shape[0], -1).astype(np.float64)
    fnirs = arrays["fnirs_windows"].reshape(arrays["fnirs_windows"].shape[0], -1).astype(np.float64)
    train_indices = [idx for idx, row in enumerate(metadata) if row["split"] == "train"]
    eval_indices = [idx for idx, row in enumerate(metadata) if row["split"] == "eval"]

    tracemalloc.start()
    start = time.perf_counter()

    eeg_train = eeg[train_indices]
    eeg_eval = eeg[eval_indices]
    fnirs_train = fnirs[train_indices]
    fnirs_eval = fnirs[eval_indices]
    means, scales = feature_stats(eeg_train)
    eeg_train_std = standardize(eeg_train, means, scales)
    eeg_eval_std = standardize(eeg_eval, means, scales)
    predictions = ridge_dual_predict(eeg_train_std, fnirs_train, eeg_eval_std, ridge_lambda)
    null_predictions = np.repeat(fnirs_train.mean(axis=0, keepdims=True), repeats=len(eval_indices), axis=0)

    runtime_sec = time.perf_counter() - start
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    peak_memory_mb = peak_memory_bytes / (1024 * 1024)

    metrics = {
        "config": str(config_path).replace("\\", "/"),
        "subject_quality_policy_path": str(policy_path).replace("\\", "/"),
        "subject_quality_allowed_tier": allowed_tier,
        "runtime_sec": runtime_sec,
        "peak_memory_mb": peak_memory_mb,
        "train_windows": len(train_indices),
        "eval_windows": len(eval_indices),
        "canonical_model_mse": mse(predictions, fnirs_eval),
        "canonical_null_mse": mse(null_predictions, fnirs_eval),
        "canonical_model_corr": pearson_flat(predictions, fnirs_eval),
        "canonical_null_corr": pearson_flat(null_predictions, fnirs_eval),
        "canonical_mse_ratio_vs_null": mse(predictions, fnirs_eval) / max(mse(null_predictions, fnirs_eval), 1e-12),
        "routed_weighted_model_mse": float(routed_metrics["aggregate"]["weighted_model_mse"]),
        "routed_weighted_null_mse": float(routed_metrics["aggregate"]["weighted_null_mse"]),
        "canonical_beats_routed_mse": mse(predictions, fnirs_eval) < float(routed_metrics["aggregate"]["weighted_model_mse"]),
    }

    ensure_parent(report_path)
    ensure_parent(metrics_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    lines = [
        "# DS004514 Canonicalized Baseline Report",
        "",
        f"- Config: `{config_path}`",
        f"- Runtime seconds: `{runtime_sec:.3f}`",
        f"- Peak memory MB: `{peak_memory_mb:.3f}`",
        "",
        "## Canonicalized",
        "",
        f"- Subject-quality tier: `{allowed_tier}`",
        f"- Train windows: `{metrics['train_windows']}`",
        f"- Eval windows: `{metrics['eval_windows']}`",
        f"- Model MSE: `{metrics['canonical_model_mse']:.6f}`",
        f"- Null MSE: `{metrics['canonical_null_mse']:.6f}`",
        f"- MSE ratio vs null: `{metrics['canonical_mse_ratio_vs_null']:.6f}`",
        f"- Model corr: `{metrics['canonical_model_corr']:.6f}`",
        f"- Null corr: `{metrics['canonical_null_corr']:.6f}`",
        "",
        "## Routed Comparison",
        "",
        f"- Routed weighted model MSE: `{metrics['routed_weighted_model_mse']:.6f}`",
        f"- Routed weighted null MSE: `{metrics['routed_weighted_null_mse']:.6f}`",
        f"- Canonicalized beats routed MSE: `{metrics['canonical_beats_routed_mse']}`",
        "",
    ]
    report_path.write_text("\n".join(lines), encoding="utf-8")

    print(f"Wrote canonicalized baseline report to {report_path}")
    print(f"Wrote canonicalized baseline metrics to {metrics_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
