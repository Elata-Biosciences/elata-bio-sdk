#!/usr/bin/env python3
"""Validate DS006848 broader PPG quality review outputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import tomllib


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DS006848 PPG quality review outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_ppg_quality_review.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config = load_config(Path(args.config))
    metrics_path = Path(config["paths"]["metrics"])
    report_path = Path(config["paths"]["report"])
    expected = config["expected"]

    failures: list[str] = []
    for path in [metrics_path, report_path]:
        if not path.exists():
            failures.append(f"Missing output: {path}")
    if failures:
        for failure in failures:
            print(failure)
        return 1

    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    if int(metrics.get("subject_count", 0)) != int(expected["subject_count"]):
        failures.append(
            f"Expected {expected['subject_count']} reviewed subjects, found {metrics.get('subject_count')}."
        )
    if int(metrics.get("sampled_window_count_total", 0)) < int(expected["min_sampled_windows_total"]):
        failures.append(
            f"Expected at least {expected['min_sampled_windows_total']} sampled windows, found {metrics.get('sampled_window_count_total')}."
        )
    if int(metrics.get("quality_pass_window_count_total", 0)) < int(expected["min_quality_pass_windows_total"]):
        failures.append(
            f"Expected at least {expected['min_quality_pass_windows_total']} quality-pass windows, found {metrics.get('quality_pass_window_count_total')}."
        )
    if len(metrics.get("top_subjects", [])) < 3 or len(metrics.get("bottom_subjects", [])) < 3:
        failures.append("Expected at least three subjects in top and bottom quality summaries.")
    for subject in metrics.get("subjects", []):
        for key in [
            "quality_pass_rate",
            "dominant_beat_valid_rate",
            "notch_valid_rate",
        ]:
            value = float(subject.get(key, -1.0))
            if value < 0.0 or value > 1.0:
                failures.append(f"Subject {subject.get('subject_id')} has invalid {key}: {value}")

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print("Validated DS006848 PPG quality review outputs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
