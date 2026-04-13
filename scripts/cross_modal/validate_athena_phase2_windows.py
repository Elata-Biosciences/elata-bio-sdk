#!/usr/bin/env python3
"""Validate Athena Phase 2 transport-level smoke outputs."""

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
    parser = argparse.ArgumentParser(description="Validate Athena Phase 2 transport-level smoke outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/athena_phase2_fixture.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config = load_config(Path(args.config))
    dataset_path = Path(config["paths"]["dataset"])
    metadata_path = Path(config["paths"]["metadata"])
    metrics_path = Path(config["paths"]["metrics"])
    summary_path = Path(config["paths"]["summary"])
    expected = config["expected"]

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
    if list(arrays["optics_transport_windows"].shape) != [expected_count, *list(expected["optics_window_shape"])]:
        failures.append(f"Unexpected optics tensor shape: {list(arrays['optics_transport_windows'].shape)}")
    if list(arrays["ppg_native_windows"].shape) != [expected_count, *list(expected["ppg_native_window_shape"])]:
        failures.append(f"Unexpected PPG native tensor shape: {list(arrays['ppg_native_windows'].shape)}")
    if list(arrays["ppg_clean_windows"].shape) != [expected_count, *list(expected["ppg_clean_window_shape"])]:
        failures.append(f"Unexpected PPG clean tensor shape: {list(arrays['ppg_clean_windows'].shape)}")
    if len(windows) != expected_count:
        failures.append(f"Expected {expected_count} metadata windows, found {len(windows)}.")

    subjects = sorted({row["subject_id"] for row in windows})
    if subjects != sorted(list(expected["subject_ids"])):
        failures.append(f"Expected subjects {sorted(list(expected['subject_ids']))}, found {subjects}.")

    if metrics.get("quality_pass_window_count", 0) < int(expected["min_quality_pass_count"]):
        failures.append(
            f"Expected at least {expected['min_quality_pass_count']} quality-pass windows, found {metrics.get('quality_pass_window_count')}."
        )
    if float(metrics.get("min_shared_overlap_seconds", 0.0)) < float(expected["min_shared_overlap_seconds"]):
        failures.append(
            f"Expected minimum shared overlap >= {expected['min_shared_overlap_seconds']}, found {metrics.get('min_shared_overlap_seconds')}."
        )
    if float(metrics.get("mean_ppg_peak_count", 0.0)) < float(expected["min_mean_ppg_peak_count"]):
        failures.append(
            f"Expected mean PPG peak count >= {expected['min_mean_ppg_peak_count']}, found {metrics.get('mean_ppg_peak_count')}."
        )
    if np.isnan(arrays["eeg_event_windows"]).any():
        failures.append("Found NaNs in EEG event windows.")
    if np.isnan(arrays["eeg_clean_windows"]).any():
        failures.append("Found NaNs in EEG clean windows.")
    if np.isnan(arrays["optics_transport_windows"]).any():
        failures.append("Found NaNs in optics transport windows.")
    if np.isnan(arrays["ppg_native_windows"]).any() or np.isnan(arrays["ppg_clean_windows"]).any():
        failures.append("Found NaNs in PPG windows.")

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print("Validated Athena Phase 2 transport-level smoke windows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
