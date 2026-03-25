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


def detect_ppg_peaks(signal: np.ndarray, sfreq: float, min_distance_seconds: float, threshold_std: float) -> list[int]:
    centered = signal - float(np.median(signal))
    scale = float(np.std(centered))
    if scale <= 1e-9:
        return []
    threshold = threshold_std * scale
    candidates = np.where(
        (centered[1:-1] > centered[:-2])
        & (centered[1:-1] >= centered[2:])
        & (centered[1:-1] >= threshold)
    )[0] + 1
    min_distance = max(1, int(round(min_distance_seconds * sfreq)))
    selected: list[int] = []
    for candidate in candidates.tolist():
        if not selected or (candidate - selected[-1]) >= min_distance:
            selected.append(candidate)
            continue
        if centered[candidate] > centered[selected[-1]]:
            selected[-1] = candidate
    return selected


def derive_targets(ppg_clean_windows: np.ndarray, metadata: list[dict], config: dict) -> np.ndarray:
    sfreq = float(config["baseline"]["ppg_clean_sfreq_hz"])
    window_duration_seconds = ppg_clean_windows.shape[1] / sfreq
    rows: list[list[float]] = []
    for signal, row in zip(ppg_clean_windows, metadata):
        peaks = detect_ppg_peaks(
            signal,
            sfreq=sfreq,
            min_distance_seconds=float(config["baseline"]["ppg_peak_min_distance_seconds"]),
            threshold_std=float(config["baseline"]["ppg_peak_threshold_std"]),
        )
        if len(peaks) >= 2:
            mean_ibi_seconds = float(np.mean(np.diff(peaks)) / sfreq)
        elif len(peaks) == 1:
            mean_ibi_seconds = window_duration_seconds
        else:
            mean_ibi_seconds = window_duration_seconds
        amplitude_range = float(np.percentile(signal, 95.0) - np.percentile(signal, 5.0))
        rising_edge_slope_max = float(row["ppg_rising_edge_slope_max"])
        rows.append([mean_ibi_seconds, amplitude_range, rising_edge_slope_max])
    return np.asarray(rows, dtype=np.float64)


def branch_metrics(predictions: np.ndarray, null_predictions: np.ndarray, targets: np.ndarray, target_names: list[str]) -> dict:
    per_target: dict[str, dict[str, float]] = {}
    for index, name in enumerate(target_names):
        target_truth = targets[:, index : index + 1]
        target_pred = predictions[:, index : index + 1]
        target_null = null_predictions[:, index : index + 1]
        per_target[name] = {
            "model_mse": mse(target_pred, target_truth),
            "null_mse": mse(target_null, target_truth),
            "model_mae": mae(target_pred, target_truth),
            "null_mae": mae(target_null, target_truth),
            "model_corr": pearson(target_pred, target_truth),
            "null_corr": pearson(target_null, target_truth),
            "beats_null_mse": mse(target_pred, target_truth) < mse(target_null, target_truth),
        }
    return per_target


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
    report_path = Path(config["paths"]["report"])
    metrics_path = Path(config["paths"]["metrics"])
    ridge_lambda = float(config["baseline"]["ridge_lambda"])
    feature_branches = list(config["baseline"]["feature_branches"])
    target_names = list(config["baseline"]["target_names"])

    arrays = np.load(dataset_path)
    metadata = load_json(metadata_path)["windows"]
    ppg_clean = arrays["ppg_clean_windows"].astype(np.float64)
    targets = derive_targets(ppg_clean, metadata, config=config)
    train_indices = [idx for idx, row in enumerate(metadata) if row["split"] == "train" and row["quality_flags"]["window_quality_pass"]]
    eval_indices = [idx for idx, row in enumerate(metadata) if row["split"] == "eval" and row["quality_flags"]["window_quality_pass"]]

    tracemalloc.start()
    start = time.perf_counter()

    y_train = targets[train_indices]
    y_eval = targets[eval_indices]
    target_means, target_scales = feature_stats(y_train)
    y_train_std = standardize(y_train, target_means, target_scales)
    y_eval_std = standardize(y_eval, target_means, target_scales)

    results: dict[str, dict] = {}
    best_branch = None
    best_branch_mse = float("inf")
    for branch_name in feature_branches:
        features = arrays[branch_name].reshape(arrays[branch_name].shape[0], -1).astype(np.float64)
        x_train = features[train_indices]
        x_eval = features[eval_indices]
        x_means, x_scales = feature_stats(x_train)
        x_train_std = standardize(x_train, x_means, x_scales)
        x_eval_std = standardize(x_eval, x_means, x_scales)

        predictions_std = ridge_dual_predict(x_train_std, y_train_std, x_eval_std, ridge_lambda)
        null_predictions_std = np.zeros_like(predictions_std)
        predictions = unstandardize(predictions_std, target_means, target_scales)
        null_predictions = np.repeat(target_means[np.newaxis, :], repeats=len(eval_indices), axis=0)

        aggregate_model_mse_std = mse(predictions_std, y_eval_std)
        aggregate_null_mse_std = mse(null_predictions_std, y_eval_std)
        if aggregate_model_mse_std < best_branch_mse:
            best_branch_mse = aggregate_model_mse_std
            best_branch = branch_name

        results[branch_name] = {
            "aggregate_model_mse_std": aggregate_model_mse_std,
            "aggregate_null_mse_std": aggregate_null_mse_std,
            "aggregate_model_mae_std": mae(predictions_std, y_eval_std),
            "aggregate_null_mae_std": mae(null_predictions_std, y_eval_std),
            "beats_null_std_mse": aggregate_model_mse_std < aggregate_null_mse_std,
            "per_target": branch_metrics(predictions, null_predictions, y_eval, target_names=target_names),
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
        "train_windows": len(train_indices),
        "eval_windows": len(eval_indices),
        "target_names": target_names,
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
        f"- Train windows: `{len(train_indices)}`",
        f"- Eval windows: `{len(eval_indices)}`",
        f"- Best branch by standardized MSE: `{best_branch}`",
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
                    f"- Model MSE: `{target['model_mse']:.6f}`",
                    f"- Null MSE: `{target['null_mse']:.6f}`",
                    f"- Model MAE: `{target['model_mae']:.6f}`",
                    f"- Null MAE: `{target['null_mae']:.6f}`",
                    f"- Model corr: `{target['model_corr']:.6f}`",
                    f"- Null corr: `{target['null_corr']:.6f}`",
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
