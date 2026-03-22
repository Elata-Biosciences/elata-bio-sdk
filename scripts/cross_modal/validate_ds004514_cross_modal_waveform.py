#!/usr/bin/env python3
"""Validate paired DS004514 EEG-fNIRS waveform smoke outputs."""

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
    parser = argparse.ArgumentParser(description="Validate paired DS004514 cross-modal waveform smoke outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_cross_modal_waveform.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    dataset_path = Path(config["paths"]["dataset"])
    metadata_path = Path(config["paths"]["metadata"])
    metrics_path = Path(config["paths"]["metrics"])
    summary_path = Path(config["paths"]["summary"])

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

    eeg_windows = arrays["eeg_windows"]
    fnirs_windows = arrays["fnirs_windows"]
    expected = config.get("expected", {})
    expected_subjects = sorted(list(expected.get("subject_ids", [])))
    expected_paired_window_count = int(expected.get("paired_window_count", 0))
    expected_eeg_window_shape = list(expected.get("eeg_window_shape", []))
    expected_fnirs_window_shape = list(expected.get("fnirs_window_shape", []))

    if list(eeg_windows.shape[1:]) != expected_eeg_window_shape:
        failures.append(f"Expected eeg window shape {expected_eeg_window_shape}, found {list(eeg_windows.shape[1:])}.")
    if list(fnirs_windows.shape[1:]) != expected_fnirs_window_shape:
        failures.append(f"Expected fNIRS window shape {expected_fnirs_window_shape}, found {list(fnirs_windows.shape[1:])}.")
    if list(eeg_windows.shape)[0] != expected_paired_window_count:
        failures.append(f"Expected {expected_paired_window_count} EEG windows, found {list(eeg_windows.shape)[0]}.")
    if list(fnirs_windows.shape)[0] != expected_paired_window_count:
        failures.append(f"Expected {expected_paired_window_count} fNIRS windows, found {list(fnirs_windows.shape)[0]}.")
    if len(metadata.get("windows", [])) != expected_paired_window_count:
        failures.append(f"Expected {expected_paired_window_count} metadata windows, found {len(metadata.get('windows', []))}.")
    if metrics.get("subject_count") != 2:
        failures.append(f"Expected 2 subjects, found {metrics.get('subject_count')}.")
    if float(metrics.get("max_subject_rmse_seconds", 1e9)) > float(config["alignment"]["max_rmse_seconds"]):
        failures.append("Cross-modal alignment RMSE exceeds configured threshold.")
    if float(metrics.get("max_subject_abs_seconds", 1e9)) > float(config["alignment"]["max_abs_seconds"]):
        failures.append("Cross-modal alignment max-abs residual exceeds configured threshold.")

    subjects = sorted({row["subject_id"] for row in metadata.get("windows", [])})
    if subjects != expected_subjects:
        failures.append(f"Expected paired subjects {expected_subjects}, found {subjects}.")

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print(f"Validated DS004514 paired cross-modal waveform outputs from {config_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
