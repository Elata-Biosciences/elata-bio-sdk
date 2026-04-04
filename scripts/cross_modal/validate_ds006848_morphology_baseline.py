#!/usr/bin/env python3
"""Validate DS006848 morphology baseline outputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import tomllib


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DS006848 morphology baseline outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_morphology_baseline_expanded.toml",
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
    if metrics.get("train_windows") != int(expected["train_windows"]):
        failures.append(f"Expected {expected['train_windows']} train windows, found {metrics.get('train_windows')}.")
    if metrics.get("eval_windows") != int(expected["eval_windows"]):
        failures.append(f"Expected {expected['eval_windows']} eval windows, found {metrics.get('eval_windows')}.")
    branch_names = set(metrics.get("branches", {}).keys())
    if branch_names != set(expected["branch_names"]):
        failures.append(f"Expected branches {sorted(expected['branch_names'])}, found {sorted(branch_names)}.")
    if metrics.get("best_branch") not in branch_names:
        failures.append(f"Best branch {metrics.get('best_branch')} is not present in metrics.")
    if metrics.get("aggregate_target_names") != list(config["baseline"].get("aggregate_target_names", metrics.get("target_names", []))):
        failures.append("Aggregate target names in metrics do not match the config.")

    for branch_name, branch_metrics in metrics.get("branches", {}).items():
        for key in ["aggregate_model_mse_std", "aggregate_null_mse_std", "aggregate_model_mae_std", "aggregate_null_mae_std"]:
            if not isinstance(branch_metrics.get(key), (int, float)):
                failures.append(f"Branch {branch_name} metric {key} must be numeric.")
        for target_name in metrics.get("target_names", []):
            target = branch_metrics.get("per_target", {}).get(target_name)
            if target is None:
                failures.append(f"Missing target metrics for {branch_name}/{target_name}.")
                continue
            for key in ["train_windows", "eval_windows"]:
                if not isinstance(target.get(key), (int, float)):
                    failures.append(f"Target metric {branch_name}/{target_name}/{key} must be numeric.")
            for key in ["model_mse", "null_mse", "model_mae", "null_mae", "model_corr", "null_corr"]:
                if not isinstance(target.get(key), (int, float)):
                    failures.append(f"Target metric {branch_name}/{target_name}/{key} must be numeric.")
            for key in ["model_mse_std", "null_mse_std", "model_mae_std", "null_mae_std"]:
                if not isinstance(target.get(key), (int, float)):
                    failures.append(f"Target metric {branch_name}/{target_name}/{key} must be numeric.")

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print("Validated DS006848 morphology baseline outputs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
