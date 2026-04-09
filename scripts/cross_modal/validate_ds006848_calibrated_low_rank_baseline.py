#!/usr/bin/env python3
"""Validate DS006848 calibrated low-rank baseline outputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from train_ds006848_morphology_baseline import load_config


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DS006848 calibrated low-rank baseline outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_swap.toml",
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
    if metrics.get("candidate_ranks") != candidate_ranks:
        failures.append("Candidate ranks in metrics do not match config.")
    if metrics.get("ridge_lambda") != float(config["model"]["ridge_lambda"]):
        failures.append("Ridge lambda in metrics does not match config.")
    if metrics.get("calibration_windows_per_subject") != int(config["calibration"]["eval_windows_per_subject"]):
        failures.append("Calibration windows per subject in metrics do not match config.")
    if metrics.get("target_names") != list(config["baseline"]["target_names"]):
        failures.append("Target names in metrics do not match config.")

    branch_names = set(expected["branch_names"])
    if set(metrics.get("branches", {}).keys()) != branch_names:
        failures.append(f"Expected branches {sorted(branch_names)}, found {sorted(metrics.get('branches', {}).keys())}.")

    best_candidate = metrics.get("best_candidate", {})
    if best_candidate.get("branch") not in branch_names:
        failures.append(f"Best candidate branch is invalid: {best_candidate.get('branch')}.")
    if best_candidate.get("rank") not in candidate_ranks:
        failures.append(f"Best candidate rank is invalid: {best_candidate.get('rank')}.")

    for branch_name, branch_metrics in metrics.get("branches", {}).items():
        if branch_metrics.get("best_rank") not in candidate_ranks:
            failures.append(f"Branch {branch_name} best rank is invalid: {branch_metrics.get('best_rank')}.")
        branch_ranks = branch_metrics.get("ranks", {})
        for rank in branch_metrics.get("candidate_ranks", []):
            rank_key = str(rank)
            if rank_key not in branch_ranks:
                failures.append(f"Branch {branch_name} missing rank metrics for {rank}.")
                continue
            rank_metrics = branch_ranks[rank_key]
            for key in [
                "aggregate_model_relative_mse",
                "aggregate_null_relative_mse",
                "aggregate_delta_relative_mse",
                "aggregate_model_relative_mae",
                "aggregate_null_relative_mae",
            ]:
                if not isinstance(rank_metrics.get(key), (int, float)):
                    failures.append(f"Branch {branch_name} rank {rank} metric {key} must be numeric.")
            for target_name in metrics.get("target_names", []):
                target_metrics = rank_metrics.get("per_target", {}).get(target_name)
                if target_metrics is None:
                    failures.append(f"Missing target metrics for {branch_name}/rank {rank}/{target_name}.")
                    continue
                if int(target_metrics.get("train_windows", 0)) < int(config["baseline"]["min_train_windows_per_target"]):
                    failures.append(
                        f"Expected at least {config['baseline']['min_train_windows_per_target']} train windows for {branch_name}/rank {rank}/{target_name}, found {target_metrics.get('train_windows')}."
                    )
                if int(target_metrics.get("eval_windows", 0)) < int(expected["min_eval_test_windows"]):
                    failures.append(
                        f"Expected at least {expected['min_eval_test_windows']} eval windows for {branch_name}/rank {rank}/{target_name}, found {target_metrics.get('eval_windows')}."
                    )

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print("Validated DS006848 calibrated low-rank baseline outputs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
