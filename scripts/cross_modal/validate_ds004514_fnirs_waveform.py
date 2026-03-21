#!/usr/bin/env python3
"""Validate the DS004514 fNIRS waveform smoke outputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import tomllib


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DS004514 fNIRS waveform smoke outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_fnirs_waveform.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    metrics_path = Path(config["paths"]["metrics"])
    summary_path = Path(config["paths"]["summary"])

    failures: list[str] = []
    if not metrics_path.exists():
        failures.append(f"Missing metrics output: {metrics_path}")
    if not summary_path.exists():
        failures.append(f"Missing summary output: {summary_path}")
    if failures:
        for failure in failures:
            print(failure)
        return 1

    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    if metrics.get("subject_count") != 12:
        failures.append(f"Expected 12 subjects, found {metrics.get('subject_count')}.")
    if metrics.get("total_image_event_count") != 2160:
        failures.append(f"Expected 2160 image events, found {metrics.get('total_image_event_count')}.")

    channel_set = sorted(metrics.get("raw_channel_count_set", []))
    if channel_set != [22, 28]:
        failures.append(f"Expected raw channel count set [22, 28], found {channel_set}.")

    sampling_set = sorted(metrics.get("sampling_rate_set", []))
    if sampling_set != [7.8125, 8.928571]:
        failures.append(f"Expected sampling rate set [7.8125, 8.928571], found {sampling_set}.")

    for subject in metrics.get("per_subject", []):
        if subject.get("image_event_count") != 180:
            failures.append(
                f"{subject.get('subject_id')} expected 180 image events, found {subject.get('image_event_count')}."
            )
        if subject.get("haemo_channel_count") != subject.get("raw_channel_count"):
            failures.append(
                f"{subject.get('subject_id')} haemo/raw channel mismatch: "
                f"{subject.get('haemo_channel_count')} vs {subject.get('raw_channel_count')}."
            )
        if subject.get("hbo_channel_count") != subject.get("hbr_channel_count"):
            failures.append(
                f"{subject.get('subject_id')} hbo/hbr mismatch: "
                f"{subject.get('hbo_channel_count')} vs {subject.get('hbr_channel_count')}."
            )

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print(f"Validated DS004514 fNIRS waveform smoke outputs from {config_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
