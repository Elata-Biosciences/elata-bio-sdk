#!/usr/bin/env python3
"""Validate DS004514 canonicalized cross-modal outputs."""

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


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DS004514 canonicalized cross-modal outputs.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_cross_modal_canonicalized.toml",
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
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    policy_path = Path(config["policy"]["subject_quality_policy"])
    allowed_tier = config["policy"]["allowed_tier"]
    policy = load_json(policy_path)
    allowed_subjects = set(policy["tiers"][allowed_tier])

    if list(arrays["eeg_windows"].shape) != [int(expected["paired_window_count"]), *list(expected["eeg_window_shape"])]:
        failures.append(f"Unexpected EEG tensor shape: {list(arrays['eeg_windows'].shape)}")
    if list(arrays["fnirs_windows"].shape) != [int(expected["paired_window_count"]), *list(expected["fnirs_window_shape"])]:
        failures.append(f"Unexpected fNIRS tensor shape: {list(arrays['fnirs_windows'].shape)}")
    if len(metadata.get("windows", [])) != int(expected["paired_window_count"]):
        failures.append(f"Expected {expected['paired_window_count']} metadata windows, found {len(metadata.get('windows', []))}.")
    if metrics.get("canonical_channel_count") != int(expected["canonical_channel_count"]):
        failures.append(f"Expected canonical channel count {expected['canonical_channel_count']}, found {metrics.get('canonical_channel_count')}.")
    subjects = sorted({row["subject_id"] for row in metadata.get("windows", [])})
    if subjects != sorted(list(expected["subject_ids"])):
        failures.append(f"Expected subjects {sorted(list(expected['subject_ids']))}, found {subjects}.")
    if any(subject not in allowed_subjects for subject in subjects):
        failures.append(
            f"Subjects {subjects} are not all contained in allowed subject-quality tier '{allowed_tier}'."
        )
    if metrics.get("subject_quality_allowed_tier") != allowed_tier:
        failures.append(
            f"Expected subject-quality tier '{allowed_tier}', found {metrics.get('subject_quality_allowed_tier')}."
        )

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print("Validated DS004514 canonicalized cross-modal outputs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
