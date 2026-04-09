#!/usr/bin/env python3
"""Validate DS006848 calibrated RBF baseline outputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from train_ds006848_morphology_baseline import load_config


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DS006848 calibrated RBF baseline outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_calibrated_rbf_amplitude_cohort_swap.toml",
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
    if metrics.get("kernel") != "rbf_median":
        failures.append(f"Expected kernel rbf_median, found {metrics.get('kernel')}.")
    if metrics.get("ridge_lambda") != float(config["model"]["ridge_lambda"]):
        failures.append("Ridge lambda in metrics does not match config.")
    if metrics.get("gamma_scale") != float(config["model"]["gamma_scale"]):
        failures.append("Gamma scale in metrics does not match config.")
    if metrics.get("calibration_windows_per_subject") != int(config["calibration"]["eval_windows_per_subject"]):
        failures.append("Calibration windows per subject in metrics do not match config.")
    if metrics.get("target_names") != list(config["baseline"]["target_names"]):
        failures.append("Target names in metrics do not match config.")
    if metrics.get("aggregate_target_names") != list(config["baseline"]["aggregate_target_names"]):
        failures.append("Aggregate target names in metrics do not match config.")

    modes = metrics.get("modes", {})
    if set(modes.keys()) != {"calibrated_absolute"}:
        failures.append(f"Expected only calibrated_absolute mode, found {sorted(modes.keys())}.")

    branch_names = set(expected["branch_names"])
    calibrated_mode = modes.get("calibrated_absolute", {})
    if set(calibrated_mode.get("branches", {}).keys()) != branch_names:
        failures.append("Calibrated mode has unexpected branches.")
    if calibrated_mode.get("best_branch") not in branch_names:
        failures.append(f"Best branch is invalid: {calibrated_mode.get('best_branch')}.")

    reference_linear = metrics.get("reference_linear", {})
    if not isinstance(reference_linear.get("best_branch_aggregate_relative_mse"), (int, float)):
        failures.append("Reference linear aggregate relative MSE must be numeric.")

    for branch_name, branch_metrics in calibrated_mode.get("branches", {}).items():
        for key in [
            "aggregate_model_relative_mse",
            "aggregate_null_relative_mse",
            "aggregate_delta_relative_mse",
            "aggregate_model_relative_mae",
            "aggregate_null_relative_mae",
        ]:
            if not isinstance(branch_metrics.get(key), (int, float)):
                failures.append(f"Branch {branch_name} metric {key} must be numeric.")
        for target_name in metrics.get("target_names", []):
            target_metrics = branch_metrics.get("per_target", {}).get(target_name)
            if target_metrics is None:
                failures.append(f"Missing target metrics for {branch_name}/{target_name}.")
                continue
            if int(target_metrics.get("train_windows", 0)) < int(config["baseline"]["min_train_windows_per_target"]):
                failures.append(
                    f"Expected at least {config['baseline']['min_train_windows_per_target']} train windows for {branch_name}/{target_name}, found {target_metrics.get('train_windows')}."
                )
            if int(target_metrics.get("eval_windows", 0)) < int(expected["min_eval_test_windows"]):
                failures.append(
                    f"Expected at least {expected['min_eval_test_windows']} eval windows for {branch_name}/{target_name}, found {target_metrics.get('eval_windows')}."
                )
            for key in [
                "gamma",
                "median_squared_distance",
                "model_mse",
                "null_mse",
                "relative_mse",
                "model_mae",
                "null_mae",
                "relative_mae",
                "model_corr",
                "null_corr",
                "delta_mse",
            ]:
                if not isinstance(target_metrics.get(key), (int, float)):
                    failures.append(f"Branch {branch_name}/{target_name}/{key} must be numeric.")

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print("Validated DS006848 calibrated RBF baseline outputs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
