#!/usr/bin/env python3
"""Run a dependency-light local smoke test for cross-modal toy-mode experiments."""

from __future__ import annotations

import argparse
import json
import math
import statistics
import time
import tracemalloc
from pathlib import Path
import tomllib
from json import JSONDecodeError

from manifest_contract import validate_manifest


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def load_dataset(path: Path) -> dict:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError as exc:
        raise SystemExit(
            f"Toy dataset not found at {path}. Run scripts/cross_modal/make_toy_subset.py first."
        ) from exc
    except JSONDecodeError as exc:
        raise SystemExit(
            f"Toy dataset at {path} is incomplete or invalid. Re-run scripts/cross_modal/make_toy_subset.py and then retry."
        ) from exc


def load_manifest(path: Path) -> dict:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError as exc:
        raise SystemExit(
            f"Toy manifest not found at {path}. Run scripts/cross_modal/make_toy_subset.py first."
        ) from exc
    except JSONDecodeError as exc:
        raise SystemExit(
            f"Toy manifest at {path} is incomplete or invalid. Re-run scripts/cross_modal/make_toy_subset.py and then retry."
        ) from exc


def vector_mean(rows: list[list[float]]) -> list[float]:
    width = len(rows[0])
    return [sum(row[idx] for row in rows) / len(rows) for idx in range(width)]


def standardize(rows: list[list[float]], means: list[float], scales: list[float]) -> list[list[float]]:
    out = []
    for row in rows:
        out.append([(value - means[idx]) / scales[idx] for idx, value in enumerate(row)])
    return out


def feature_stats(rows: list[list[float]]) -> tuple[list[float], list[float]]:
    means = vector_mean(rows)
    width = len(rows[0])
    scales = []
    for idx in range(width):
        variance = sum((row[idx] - means[idx]) ** 2 for row in rows) / max(1, len(rows))
        scales.append(max(math.sqrt(variance), 1e-6))
    return means, scales


def dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def predict(features: list[list[float]], weights: list[list[float]], bias: list[float]) -> list[list[float]]:
    outputs = []
    for row in features:
        outputs.append([dot(row, column) + bias[col_idx] for col_idx, column in enumerate(weights)])
    return outputs


def train_multi_output_linear(
    features: list[list[float]],
    targets: list[list[float]],
    learning_rate: float,
    epochs: int,
) -> tuple[list[list[float]], list[float]]:
    feature_dim = len(features[0])
    target_dim = len(targets[0])
    weights = [[0.0 for _ in range(feature_dim)] for _ in range(target_dim)]
    bias = [0.0 for _ in range(target_dim)]

    sample_count = len(features)
    for _ in range(epochs):
        for row, target in zip(features, targets):
            prediction = [dot(row, weights[idx]) + bias[idx] for idx in range(target_dim)]
            errors = [prediction[idx] - target[idx] for idx in range(target_dim)]
            for out_idx in range(target_dim):
                for feat_idx in range(feature_dim):
                    weights[out_idx][feat_idx] -= learning_rate * 2.0 * errors[out_idx] * row[feat_idx] / sample_count
                bias[out_idx] -= learning_rate * 2.0 * errors[out_idx] / sample_count

    return weights, bias


def flatten(matrix: list[list[float]]) -> list[float]:
    return [value for row in matrix for value in row]


def mse(predictions: list[list[float]], targets: list[list[float]]) -> float:
    errors = [(prediction - target) ** 2 for prediction, target in zip(flatten(predictions), flatten(targets))]
    return sum(errors) / max(1, len(errors))


def mae(predictions: list[list[float]], targets: list[list[float]]) -> float:
    errors = [abs(prediction - target) for prediction, target in zip(flatten(predictions), flatten(targets))]
    return sum(errors) / max(1, len(errors))


def pearson_flat(predictions: list[list[float]], targets: list[list[float]]) -> float:
    pred = flatten(predictions)
    truth = flatten(targets)
    if len(pred) < 2:
        return 0.0
    pred_mean = statistics.fmean(pred)
    truth_mean = statistics.fmean(truth)
    numerator = sum((p - pred_mean) * (t - truth_mean) for p, t in zip(pred, truth))
    pred_var = sum((p - pred_mean) ** 2 for p in pred)
    truth_var = sum((t - truth_mean) ** 2 for t in truth)
    denominator = math.sqrt(pred_var * truth_var)
    if denominator <= 1e-12:
        return 0.0
    return numerator / denominator


def mean_target(rows: list[list[float]]) -> list[float]:
    return vector_mean(rows)


def constant_predict(target_mean: list[float], count: int) -> list[list[float]]:
    return [list(target_mean) for _ in range(count)]


def build_report(
    config_path: Path,
    dataset_path: Path,
    manifest_path: Path,
    report_path: Path,
    metrics_path: Path,
    runtime_sec: float,
    peak_memory_mb: float,
    dataset: dict,
    metrics: dict,
) -> None:
    ensure_parent(report_path)
    ensure_parent(metrics_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    train_windows = sum(1 for window in dataset["windows"] if window["split"] == "train")
    eval_windows = sum(1 for window in dataset["windows"] if window["split"] == "eval")
    lines = [
        "# Cross-Modal Toy Smoke Report",
        "",
        f"- Config: `{config_path}`",
        f"- Manifest: `{manifest_path}`",
        f"- Dataset: `{dataset_path}`",
        f"- Train windows: `{train_windows}`",
        f"- Eval windows: `{eval_windows}`",
        f"- Runtime seconds: `{runtime_sec:.3f}`",
        f"- Peak memory MB: `{peak_memory_mb:.3f}`",
        "",
        "## EEG -> fNIRS",
        "",
        f"- Model MSE: `{metrics['eeg_to_fnirs']['model_mse']:.6f}`",
        f"- Null MSE: `{metrics['eeg_to_fnirs']['null_mse']:.6f}`",
        f"- Model correlation: `{metrics['eeg_to_fnirs']['model_corr']:.6f}`",
        "",
        "## EEG+fNIRS -> PPG Morphology",
        "",
        f"- Model MAE: `{metrics['fusion_to_ppg']['model_mae']:.6f}`",
        f"- Null MAE: `{metrics['fusion_to_ppg']['null_mae']:.6f}`",
        f"- Model correlation: `{metrics['fusion_to_ppg']['model_corr']:.6f}`",
        "",
        "## Toy-Mode Contract",
        "",
        f"- Single-command report written: `{report_path}`",
        f"- Machine-readable metrics written: `{metrics_path}`",
    ]
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the local cross-modal toy smoke test.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/proto_cpu.toml",
        help="Path to the TOML config file.",
    )
    parser.add_argument(
        "--dataset",
        help="Optional override for the dataset path.",
    )
    parser.add_argument(
        "--manifest",
        help="Optional override for the manifest path.",
    )
    parser.add_argument(
        "--report",
        help="Optional override for the Markdown report path.",
    )
    parser.add_argument(
        "--metrics",
        help="Optional override for the JSON metrics path.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    manifest_path = Path(args.manifest or config["paths"]["toy_manifest"])
    manifest = load_manifest(manifest_path)
    manifest_failures = validate_manifest(manifest)
    if manifest_failures:
        raise SystemExit("Toy manifest failed validation:\n" + "\n".join(manifest_failures))
    dataset_path = Path(args.dataset or manifest["storage"]["dataset_path"])
    report_path = Path(args.report or config["paths"]["toy_report"])
    metrics_path = Path(args.metrics or config["paths"]["toy_metrics"])

    dataset = load_dataset(dataset_path)
    windows = dataset["windows"]
    train_rows = [window for window in windows if window["split"] == "train"]
    eval_rows = [window for window in windows if window["split"] == "eval"]

    if not train_rows or not eval_rows:
        raise SystemExit("Toy dataset must contain both train and eval rows.")

    tracemalloc.start()
    start = time.perf_counter()

    eeg_train = [row["eeg_features"] for row in train_rows]
    eeg_eval = [row["eeg_features"] for row in eval_rows]
    fnirs_train = [row["fnirs_targets"] for row in train_rows]
    fnirs_eval = [row["fnirs_targets"] for row in eval_rows]

    eeg_means, eeg_scales = feature_stats(eeg_train)
    eeg_train_std = standardize(eeg_train, eeg_means, eeg_scales)
    eeg_eval_std = standardize(eeg_eval, eeg_means, eeg_scales)

    learning_rate = float(config["train"]["learning_rate"])
    epochs = int(config["train"]["epochs"])

    fnirs_weights, fnirs_bias = train_multi_output_linear(
        eeg_train_std,
        fnirs_train,
        learning_rate=learning_rate,
        epochs=epochs,
    )
    fnirs_predictions = predict(eeg_eval_std, fnirs_weights, fnirs_bias)
    fnirs_null = constant_predict(mean_target(fnirs_train), len(fnirs_eval))

    fusion_train = [row["eeg_features"] + row["fnirs_targets"] for row in train_rows]
    fusion_eval = [row["eeg_features"] + row["fnirs_targets"] for row in eval_rows]
    ppg_train = [row["ppg_morphology_targets"] for row in train_rows]
    ppg_eval = [row["ppg_morphology_targets"] for row in eval_rows]

    fusion_means, fusion_scales = feature_stats(fusion_train)
    fusion_train_std = standardize(fusion_train, fusion_means, fusion_scales)
    fusion_eval_std = standardize(fusion_eval, fusion_means, fusion_scales)

    ppg_weights, ppg_bias = train_multi_output_linear(
        fusion_train_std,
        ppg_train,
        learning_rate=learning_rate,
        epochs=epochs,
    )
    ppg_predictions = predict(fusion_eval_std, ppg_weights, ppg_bias)
    ppg_null = constant_predict(mean_target(ppg_train), len(ppg_eval))

    runtime_sec = time.perf_counter() - start
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    peak_memory_mb = peak_memory_bytes / (1024 * 1024)

    metrics = {
        "config": str(config_path),
        "manifest": str(manifest_path),
        "dataset": str(dataset_path),
        "runtime_sec": runtime_sec,
        "peak_memory_mb": peak_memory_mb,
        "eeg_to_fnirs": {
            "model_mse": mse(fnirs_predictions, fnirs_eval),
            "null_mse": mse(fnirs_null, fnirs_eval),
            "model_corr": pearson_flat(fnirs_predictions, fnirs_eval),
            "null_corr": pearson_flat(fnirs_null, fnirs_eval),
        },
        "fusion_to_ppg": {
            "model_mae": mae(ppg_predictions, ppg_eval),
            "null_mae": mae(ppg_null, ppg_eval),
            "model_corr": pearson_flat(ppg_predictions, ppg_eval),
            "null_corr": pearson_flat(ppg_null, ppg_eval),
        },
        "toy_mode": {
            "single_command_success": True,
            "train_windows": len(train_rows),
            "eval_windows": len(eval_rows),
            "heldout_subjects": manifest["split_summary"]["heldout_subjects"],
        },
    }

    build_report(
        config_path=config_path,
        dataset_path=dataset_path,
        manifest_path=manifest_path,
        report_path=report_path,
        metrics_path=metrics_path,
        runtime_sec=runtime_sec,
        peak_memory_mb=peak_memory_mb,
        dataset=dataset,
        metrics=metrics,
    )

    print(f"Wrote report to {report_path}")
    print(f"Wrote metrics to {metrics_path}")
    print(f"Runtime: {runtime_sec:.3f}s, peak memory: {peak_memory_mb:.3f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
