#!/usr/bin/env python3
"""Validate DS004514 canonicalized baseline outputs."""

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
    parser = argparse.ArgumentParser(description="Validate DS004514 canonicalized baseline outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_canonicalized_baseline.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config = load_config(Path(args.config))
    report_path = Path(config["paths"]["report"])
    metrics_path = Path(config["paths"]["metrics"])

    failures: list[str] = []
    for path in [report_path, metrics_path]:
        if not path.exists():
            failures.append(f"Missing output: {path}")
    if failures:
        for failure in failures:
            print(failure)
        return 1

    metrics = load_json(metrics_path)
    policy_path = Path(config["policy"]["subject_quality_policy"])
    allowed_tier = config["policy"]["allowed_tier"]
    policy = load_json(policy_path)
    for key in [
        "canonical_model_mse",
        "canonical_null_mse",
        "canonical_model_corr",
        "canonical_null_corr",
        "canonical_mse_ratio_vs_null",
        "routed_weighted_model_mse",
        "routed_weighted_null_mse",
    ]:
        if not isinstance(metrics.get(key), (int, float)):
            failures.append(f"Metric {key} must be numeric.")
    if metrics.get("train_windows") != 360 or metrics.get("eval_windows") != 360:
        failures.append(f"Expected 360/360 train/eval windows, found {metrics.get('train_windows')}/{metrics.get('eval_windows')}.")
    if metrics.get("subject_quality_allowed_tier") != allowed_tier:
        failures.append(
            f"Expected subject-quality tier '{allowed_tier}', found {metrics.get('subject_quality_allowed_tier')}."
        )
    if allowed_tier not in policy.get("tiers", {}):
        failures.append(f"Missing subject-quality tier '{allowed_tier}' in {policy_path}.")

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print("Validated DS004514 canonicalized baseline outputs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
