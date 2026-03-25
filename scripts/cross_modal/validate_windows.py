#!/usr/bin/env python3
"""Validate Phase 2 paired window outputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import tomllib

import numpy as np


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Phase 2 paired window outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_phase2_windows.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config = load_config(Path(args.config))
    dataset_path = Path(config["paths"]["dataset"])
    metadata_path = Path(config["paths"]["metadata"])
    metrics_path = Path(config["paths"]["metrics"])
    summary_path = Path(config["paths"]["summary"])
    expected = config["expected"]
    quality = config["quality"]

    failures: list[str] = []
    for path in [dataset_path, metadata_path, metrics_path, summary_path]:
        if not path.exists():
            failures.append(f"Missing output: {path}")
    if failures:
        for failure in failures:
            print(failure)
        return 1

    arrays = np.load(dataset_path)
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    windows = metadata.get("windows", [])

    expected_count = int(expected["paired_window_count"])
    if list(arrays["eeg_event_windows"].shape) != [expected_count, *list(expected["eeg_event_window_shape"])]:
        failures.append(f"Unexpected EEG event tensor shape: {list(arrays['eeg_event_windows'].shape)}")
    if list(arrays["eeg_clean_windows"].shape) != [expected_count, *list(expected["eeg_clean_window_shape"])]:
        failures.append(f"Unexpected EEG clean tensor shape: {list(arrays['eeg_clean_windows'].shape)}")
    if list(arrays["fnirs_windows"].shape) != [expected_count, *list(expected["fnirs_window_shape"])]:
        failures.append(f"Unexpected fNIRS tensor shape: {list(arrays['fnirs_windows'].shape)}")
    if len(windows) != expected_count:
        failures.append(f"Expected {expected_count} metadata windows, found {len(windows)}.")
    if metrics.get("canonical_channel_count") != int(expected["canonical_channel_count"]):
        failures.append(
            f"Expected canonical channel count {expected['canonical_channel_count']}, found {metrics.get('canonical_channel_count')}."
        )
    subjects = sorted({row["subject_id"] for row in windows})
    if subjects != sorted(list(expected["subject_ids"])):
        failures.append(f"Expected subjects {sorted(list(expected['subject_ids']))}, found {subjects}.")
    if np.isnan(arrays["eeg_event_windows"]).any() or np.isnan(arrays["eeg_clean_windows"]).any() or np.isnan(arrays["fnirs_windows"]).any():
        failures.append("Found NaNs in window tensors.")
    if metrics.get("quality_pass_window_count", 0) < int(expected["min_quality_pass_count"]):
        failures.append(
            f"Expected at least {expected['min_quality_pass_count']} quality-pass windows, found {metrics.get('quality_pass_window_count')}."
        )
    if float(metrics.get("max_subject_rmse_seconds", 1e9)) > float(quality["max_alignment_rmse_seconds"]):
        failures.append(
            f"Max alignment RMSE {metrics.get('max_subject_rmse_seconds')} exceeds threshold {quality['max_alignment_rmse_seconds']}."
        )
    if float(metrics.get("max_subject_abs_seconds", 1e9)) > float(quality["max_alignment_abs_seconds"]):
        failures.append(
            f"Max alignment abs residual {metrics.get('max_subject_abs_seconds')} exceeds threshold {quality['max_alignment_abs_seconds']}."
        )

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print("Validated Phase 2 paired windows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
