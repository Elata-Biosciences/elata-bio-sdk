#!/usr/bin/env python3
"""Validate DS006848 shift-aware baseline outputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from train_ds006848_morphology_baseline import load_config


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DS006848 shift-aware baseline outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_shift_aware_baseline_cohort_swap.toml",
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
    if metrics.get("ridge_lambda") != float(config["baseline"]["ridge_lambda"]):
        failures.append("Ridge lambda in metrics does not match config.")
    if metrics.get("calibration_windows_per_subject") != int(config["calibration"]["eval_windows_per_subject"]):
        failures.append("Calibration windows per subject in metrics do not match config.")
    if metrics.get("target_names") != list(config["baseline"]["target_names"]):
        failures.append("Target names in metrics do not match config.")
    if metrics.get("aggregate_target_names") != list(config["baseline"]["aggregate_target_names"]):
        failures.append("Aggregate target names in metrics do not match config.")

    branch_names = set(expected["branch_names"])
    mode_names = set(expected["mode_names"])
    if set(metrics.get("modes", {}).keys()) != mode_names:
        failures.append(f"Expected modes {sorted(mode_names)}, found {sorted(metrics.get('modes', {}).keys())}.")

    for mode_name, mode_metrics in metrics.get("modes", {}).items():
        if set(mode_metrics.get("branches", {}).keys()) != branch_names:
            failures.append(f"Mode {mode_name} has unexpected branches.")
        if mode_metrics.get("best_branch") not in branch_names:
            failures.append(f"Mode {mode_name} best branch is invalid: {mode_metrics.get('best_branch')}.")
        for branch_name, branch_metrics in mode_metrics.get("branches", {}).items():
            for key in ["aggregate_model_mse", "aggregate_null_mse", "aggregate_delta_mse", "aggregate_model_mae", "aggregate_null_mae"]:
                if not isinstance(branch_metrics.get(key), (int, float)):
                    failures.append(f"Mode {mode_name}/{branch_name} metric {key} must be numeric.")
            for target_name in metrics.get("target_names", []):
                target_metrics = branch_metrics.get("per_target", {}).get(target_name)
                if target_metrics is None:
                    failures.append(f"Missing target metrics for {mode_name}/{branch_name}/{target_name}.")
                    continue
                if int(target_metrics.get("train_windows", 0)) < int(config["baseline"]["min_train_windows_per_target"]):
                    failures.append(
                        f"Expected at least {config['baseline']['min_train_windows_per_target']} train windows for {mode_name}/{branch_name}/{target_name}, found {target_metrics.get('train_windows')}."
                    )
                if int(target_metrics.get("eval_windows", 0)) < int(expected["min_eval_test_windows"]):
                    failures.append(
                        f"Expected at least {expected['min_eval_test_windows']} eval windows for {mode_name}/{branch_name}/{target_name}, found {target_metrics.get('eval_windows')}."
                    )
                for key in ["model_mse", "null_mse", "delta_mse", "model_mae", "null_mae"]:
                    if not isinstance(target_metrics.get(key), (int, float)):
                        failures.append(f"Mode {mode_name}/{branch_name}/{target_name}/{key} must be numeric.")

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print("Validated DS006848 shift-aware baseline outputs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
