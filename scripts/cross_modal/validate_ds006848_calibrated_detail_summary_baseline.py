#!/usr/bin/env python3
"""Validate DS006848 calibrated detail-summary baseline outputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from train_ds006848_morphology_baseline import load_config


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DS006848 calibrated detail-summary baseline outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_calibrated_detail_summary_amplitude_cohort_swap.toml",
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
    candidate_ranks = [int(rank) for rank in config["model"]["candidate_ranks"]]
    valid_ranks = [int(rank) for rank in metrics.get("candidate_ranks", [])]

    if metrics.get("source_branch") != str(config["baseline"]["source_branch"]):
        failures.append("Source branch in metrics does not match config.")
    if metrics.get("feature_view") != str(config["baseline"]["feature_view"]):
        failures.append("Feature view in metrics does not match config.")
    if metrics.get("haar_levels") != int(config["feature_view"]["haar_levels"]):
        failures.append("Haar levels in metrics do not match config.")
    if metrics.get("detail_statistics") != [str(name) for name in config["feature_view"]["detail_statistics"]]:
        failures.append("Detail statistics in metrics do not match config.")
    if metrics.get("include_final_approx") != bool(config["feature_view"]["include_final_approx"]):
        failures.append("Approximation-inclusion flag in metrics does not match config.")
    if not isinstance(metrics.get("feature_dim"), int) or int(metrics["feature_dim"]) <= 0:
        failures.append("Feature dimension in metrics must be a positive integer.")
    if metrics.get("ridge_lambda") != float(config["model"]["ridge_lambda"]):
        failures.append("Ridge lambda in metrics does not match config.")
    if metrics.get("calibration_windows_per_subject") != int(config["calibration"]["eval_windows_per_subject"]):
        failures.append("Calibration windows per subject in metrics do not match config.")
    if metrics.get("target_names") != list(config["baseline"]["target_names"]):
        failures.append("Target names in metrics do not match config.")
    if any(rank not in candidate_ranks for rank in valid_ranks):
        failures.append("Metrics contain candidate ranks not declared in config.")

    best_rank = metrics.get("best_rank")
    if best_rank not in valid_ranks:
        failures.append(f"Best rank is invalid: {best_rank}.")

    reference = metrics.get("reference_low_rank", {})
    for key in ["config", "branch", "rank", "aggregate_model_relative_mse", "aggregate_delta_relative_mse"]:
        if key not in reference:
            failures.append(f"Reference low-rank summary missing key: {key}.")

    for rank in valid_ranks:
        rank_metrics = metrics.get("ranks", {}).get(str(rank))
        if rank_metrics is None:
            failures.append(f"Missing rank metrics for rank {rank}.")
            continue
        for key in [
            "aggregate_model_relative_mse",
            "aggregate_null_relative_mse",
            "aggregate_delta_relative_mse",
            "aggregate_model_relative_mae",
            "aggregate_null_relative_mae",
        ]:
            if not isinstance(rank_metrics.get(key), (int, float)):
                failures.append(f"Rank {rank} metric {key} must be numeric.")
        for target_name in metrics.get("target_names", []):
            target_metrics = rank_metrics.get("per_target", {}).get(target_name)
            if target_metrics is None:
                failures.append(f"Missing target metrics for rank {rank}/{target_name}.")
                continue
            if int(target_metrics.get("train_windows", 0)) < int(config["baseline"]["min_train_windows_per_target"]):
                failures.append(
                    f"Expected at least {config['baseline']['min_train_windows_per_target']} train windows for rank {rank}/{target_name}, found {target_metrics.get('train_windows')}."
                )
            if int(target_metrics.get("eval_windows", 0)) < int(expected["min_eval_test_windows"]):
                failures.append(
                    f"Expected at least {expected['min_eval_test_windows']} eval windows for rank {rank}/{target_name}, found {target_metrics.get('eval_windows')}."
                )

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print("Validated DS006848 calibrated detail-summary baseline outputs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
