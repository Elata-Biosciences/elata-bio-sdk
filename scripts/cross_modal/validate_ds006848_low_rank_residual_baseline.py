#!/usr/bin/env python3
"""Validate DS006848 low-rank residual baseline outputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from train_ds006848_morphology_baseline import load_config


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DS006848 low-rank residual baseline outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_low_rank_residual_cohort_swap.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config = load_config(Path(args.config))
    report_path = Path(config["paths"]["report"])
    metrics_path = Path(config["paths"]["metrics"])
    expected = config["expected"]

    failures: list[str] = []
    for path in [report_path, metrics_path]:
        if not path.exists():
            failures.append(f"Missing output: {path}")
    if failures:
        for failure in failures:
            print(failure)
        return 1

    metrics = load_json(metrics_path)
    if metrics.get("feature_branch") != config["baseline"]["feature_branch"]:
        failures.append("Feature branch in metrics does not match config.")
    if metrics.get("rank") != int(config["baseline"]["rank"]):
        failures.append("Rank in metrics does not match config.")
    if metrics.get("ridge_lambda") != float(config["model"]["ridge_lambda"]):
        failures.append("Ridge lambda in metrics does not match config.")
    if metrics.get("calibration_windows_per_subject") != int(config["calibration"]["eval_windows_per_subject"]):
        failures.append("Calibration windows per subject in metrics do not match config.")
    if metrics.get("target_names") != list(config["baseline"]["target_names"]):
        failures.append("Target names in metrics do not match config.")

    if not isinstance(metrics.get("aggregate_model_relative_mse"), (int, float)):
        failures.append("Aggregate model relative MSE must be numeric.")
    if not isinstance(metrics.get("reference_low_rank", {}).get("aggregate_model_relative_mse"), (int, float)):
        failures.append("Reference low-rank aggregate relative MSE must be numeric.")

    for target_name in metrics.get("target_names", []):
        target_metrics = metrics.get("per_target", {}).get(target_name)
        if target_metrics is None:
            failures.append(f"Missing target metrics for {target_name}.")
            continue
        if int(target_metrics.get("train_windows", 0)) < int(config["baseline"]["min_train_windows_per_target"]):
            failures.append(
                f"Expected at least {config['baseline']['min_train_windows_per_target']} train windows for {target_name}, found {target_metrics.get('train_windows')}."
            )
        if int(target_metrics.get("eval_windows", 0)) < int(expected["min_eval_test_windows"]):
            failures.append(
                f"Expected at least {expected['min_eval_test_windows']} eval windows for {target_name}, found {target_metrics.get('eval_windows')}."
            )
        for subject_id, subject_metrics in target_metrics.get("per_subject", {}).items():
            if not isinstance(subject_metrics.get("residual_bias"), (int, float)):
                failures.append(f"Target {target_name} subject {subject_id} residual_bias must be numeric.")

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print("Validated DS006848 low-rank residual baseline outputs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
