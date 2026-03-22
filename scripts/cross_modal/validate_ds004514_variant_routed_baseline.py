#!/usr/bin/env python3
"""Validate DS004514 variant-routed baseline outputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import tomllib


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DS004514 variant-routed baseline outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_variant_routed_baseline.toml",
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

    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    aggregate = metrics.get("aggregate", {})
    variants = metrics.get("variants", [])

    if aggregate.get("variant_count") != 2:
        failures.append(f"Expected 2 routed variants, found {aggregate.get('variant_count')}.")
    if aggregate.get("eval_windows") != 360:
        failures.append(f"Expected 360 eval windows total, found {aggregate.get('eval_windows')}.")
    for key in ["weighted_model_mse", "weighted_null_mse", "weighted_model_corr", "weighted_null_corr"]:
        value = aggregate.get(key)
        if not isinstance(value, (int, float)):
            failures.append(f"Aggregate metric {key} must be numeric.")

    variant_names = sorted(variant.get("variant") for variant in variants)
    if variant_names != ["variant22", "variant28"]:
        failures.append(f"Expected variant names ['variant22', 'variant28'], found {variant_names}.")

    for variant in variants:
        if variant.get("train_windows") != 180 or variant.get("eval_windows") != 180:
            failures.append(
                f"{variant.get('variant')} expected 180 train/eval windows, found "
                f"{variant.get('train_windows')} train and {variant.get('eval_windows')} eval."
            )
        for key in ["model_mse", "null_mse", "model_corr", "null_corr", "mse_ratio_vs_null"]:
            value = variant.get(key)
            if not isinstance(value, (int, float)):
                failures.append(f"{variant.get('variant')} metric {key} must be numeric.")

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print("Validated DS004514 variant-routed baseline outputs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
