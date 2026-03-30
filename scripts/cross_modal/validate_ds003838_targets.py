#!/usr/bin/env python3
"""Validate DS003838 derived target artifacts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import tomllib

import numpy as np


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def target_valid_key(name: str) -> str:
    return f"{name}_valid"


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DS003838 derived target artifacts.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds003838_targets.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config = load_config(Path(args.config))
    targets_path = Path(config["paths"]["targets"])
    coverage_path = Path(config["paths"]["coverage"])
    summary_path = Path(config["paths"]["summary"])
    expected = config["expected"]
    target_names = list(config["targets"]["target_names"])

    failures: list[str] = []
    for path in [targets_path, coverage_path, summary_path]:
        if not path.exists():
            failures.append(f"Missing output: {path}")
    if failures:
        for failure in failures:
            print(failure)
        return 1

    arrays = np.load(targets_path)
    coverage = load_json(coverage_path)
    expected_window_count = int(expected["window_count"])
    if coverage.get("window_count") != expected_window_count:
        failures.append(f"Expected {expected_window_count} windows, found {coverage.get('window_count')}.")

    for name in target_names:
        if name not in arrays:
            failures.append(f"Missing target array: {name}")
            continue
        if target_valid_key(name) not in arrays:
            failures.append(f"Missing target-valid array: {target_valid_key(name)}")
            continue
        if arrays[name].shape[0] != expected_window_count:
            failures.append(f"Unexpected shape for {name}: {list(arrays[name].shape)}")
        if arrays[target_valid_key(name)].shape[0] != expected_window_count:
            failures.append(f"Unexpected shape for {target_valid_key(name)}: {list(arrays[target_valid_key(name)].shape)}")
        if arrays[target_valid_key(name)].dtype != np.bool_:
            failures.append(f"Expected bool dtype for {target_valid_key(name)}, found {arrays[target_valid_key(name)].dtype}.")

    minimum_total = expected.get("minimum_valid_total", {})
    minimum_train = expected.get("minimum_valid_train", {})
    minimum_eval = expected.get("minimum_valid_eval", {})
    for name, minimum in minimum_total.items():
        actual = int(coverage["per_target"][name]["total_valid"])
        if actual < int(minimum):
            failures.append(f"Expected at least {minimum} total valid windows for {name}, found {actual}.")
    for name, minimum in minimum_train.items():
        actual = int(coverage["per_target"][name]["train_valid"])
        if actual < int(minimum):
            failures.append(f"Expected at least {minimum} train valid windows for {name}, found {actual}.")
    for name, minimum in minimum_eval.items():
        actual = int(coverage["per_target"][name]["eval_valid"])
        if actual < int(minimum):
            failures.append(f"Expected at least {minimum} eval valid windows for {name}, found {actual}.")

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print("Validated DS003838 derived target artifacts.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
