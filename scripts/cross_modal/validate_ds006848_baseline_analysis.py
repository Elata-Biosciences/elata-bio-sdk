#!/usr/bin/env python3
"""Validate DS006848 expanded baseline analysis outputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from train_ds006848_morphology_baseline import load_config


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DS006848 expanded baseline analysis outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_baseline_analysis_expanded.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config = load_config(Path(args.config))
    metrics_path = Path(config["paths"]["metrics"])
    report_path = Path(config["paths"]["report"])
    failures: list[str] = []

    for path in [metrics_path, report_path]:
        if not path.exists():
            failures.append(f"Missing output: {path}")
    if failures:
        for failure in failures:
            print(failure)
        return 1

    metrics = load_json(metrics_path)
    recommended = metrics.get("recommended_default_branch")
    branches = metrics.get("branches", {})
    if recommended not in branches:
        failures.append(f"Recommended branch {recommended} is not present in branch metrics.")
    for branch_name, branch in branches.items():
        for key in ["aggregate_model_mse_std", "aggregate_null_mse_std", "aggregate_delta_mse_std"]:
            if not isinstance(branch.get(key), (int, float)):
                failures.append(f"Branch {branch_name} metric {key} must be numeric.")
        for subject_id, subject_metrics in branch.get("subject_aggregate", {}).items():
            for key in ["aggregate_model_mse_std", "aggregate_null_mse_std", "aggregate_delta_mse_std"]:
                if not isinstance(subject_metrics.get(key), (int, float)):
                    failures.append(f"Subject metric {branch_name}/{subject_id}/{key} must be numeric.")
        for slice_name, slice_metrics in branch.get("quality_slices", {}).items():
            for label, stats in slice_metrics.items():
                if not isinstance(stats.get("count"), int):
                    failures.append(f"Slice metric {branch_name}/{slice_name}/{label}/count must be an int.")

    for target_name, shift in metrics.get("target_shift", {}).items():
        for key in ["train_mean", "train_std", "eval_mean", "eval_std", "eval_mean_shift_z", "eval_std_ratio"]:
            if not isinstance(shift.get(key), (int, float)):
                failures.append(f"Shift metric {target_name}/{key} must be numeric.")

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print("Validated DS006848 baseline analysis outputs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
