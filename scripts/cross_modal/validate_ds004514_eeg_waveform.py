#!/usr/bin/env python3
"""Validate the DS004514 EEG waveform smoke outputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import tomllib


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DS004514 EEG waveform smoke outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_eeg_waveform.toml",
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
    if metrics.get("subject_count") != 2:
        failures.append(f"Expected 2 subjects, found {metrics.get('subject_count')}.")
    if metrics.get("total_image_event_count") != 360:
        failures.append(f"Expected 360 image events, found {metrics.get('total_image_event_count')}.")
    if sorted(metrics.get("sampling_rate_set", [])) != [2048.0]:
        failures.append(f"Expected sampling rate set [2048.0], found {metrics.get('sampling_rate_set')}.")
    if sorted(metrics.get("raw_channel_count_set", [])) != [80]:
        failures.append(f"Expected raw channel count set [80], found {metrics.get('raw_channel_count_set')}.")

    for subject in metrics.get("per_subject", []):
        if subject.get("eeg_channel_count") != 64:
            failures.append(f"{subject.get('subject_id')} expected 64 EEG channels, found {subject.get('eeg_channel_count')}.")
        if subject.get("misc_channel_count") != 11:
            failures.append(f"{subject.get('subject_id')} expected 11 MISC channels, found {subject.get('misc_channel_count')}.")
        if subject.get("gsr_channel_count") != 2:
            failures.append(f"{subject.get('subject_id')} expected 2 GSR channels, found {subject.get('gsr_channel_count')}.")
        if subject.get("resp_channel_count") != 1:
            failures.append(f"{subject.get('subject_id')} expected 1 RESP channel, found {subject.get('resp_channel_count')}.")
        if subject.get("temp_channel_count") != 1:
            failures.append(f"{subject.get('subject_id')} expected 1 TEMP channel, found {subject.get('temp_channel_count')}.")
        if subject.get("trig_channel_count") != 1:
            failures.append(f"{subject.get('subject_id')} expected 1 TRIG channel, found {subject.get('trig_channel_count')}.")
        if subject.get("image_event_count") != 180:
            failures.append(f"{subject.get('subject_id')} expected 180 image events, found {subject.get('image_event_count')}.")
        if subject.get("first_window_shape") != [64, 1229]:
            failures.append(f"{subject.get('subject_id')} expected first window shape [64, 1229], found {subject.get('first_window_shape')}.")

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print(f"Validated DS004514 EEG waveform smoke outputs from {config_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
