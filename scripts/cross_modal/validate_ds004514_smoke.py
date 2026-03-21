#!/usr/bin/env python3
"""Validate DS004514 smoke outputs against basic alignment expectations."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import tomllib


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the DS004514 smoke ingest outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_smoke.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    fetch_report_path = Path(config["paths"]["fetch_report"])
    window_index_path = Path(config["paths"]["window_index"])
    summary_path = Path(config["paths"]["summary"])
    metrics_path = Path(config["paths"]["metrics"])

    missing = [path for path in [fetch_report_path, window_index_path, summary_path, metrics_path] if not path.exists()]
    if missing:
        for path in missing:
            print(f"Missing output: {path}")
        return 1

    fetch_report = json.loads(fetch_report_path.read_text(encoding="utf-8"))
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    smoke_index = json.loads(window_index_path.read_text(encoding="utf-8"))

    failures: list[str] = []
    if fetch_report.get("subject_count") != metrics.get("subject_count"):
        failures.append("Subject count mismatch between fetch report and metrics.")
    if metrics.get("window_count", 0) <= 0:
        failures.append("Smoke metrics window_count must be > 0.")
    if not smoke_index.get("windows"):
        failures.append("Smoke index windows must not be empty.")

    max_rmse = float(config["alignment"]["max_rmse_seconds"])
    max_abs = float(config["alignment"]["max_abs_seconds"])
    if float(metrics.get("max_subject_rmse_seconds", 1e9)) > max_rmse:
        failures.append(
            f"max_subject_rmse_seconds exceeds threshold: {metrics.get('max_subject_rmse_seconds')} > {max_rmse}"
        )
    if float(metrics.get("max_subject_abs_seconds", 1e9)) > max_abs:
        failures.append(
            f"max_subject_abs_seconds exceeds threshold: {metrics.get('max_subject_abs_seconds')} > {max_abs}"
        )

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print(f"Validated DS004514 smoke ingest outputs from {config_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
