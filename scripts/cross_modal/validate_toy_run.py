#!/usr/bin/env python3
"""Validate that a toy-mode run produced the minimum required artifacts and fields."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import tomllib

from manifest_contract import MANIFEST_KIND, SCHEMA_VERSION, validate_manifest


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def require(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate toy-mode artifacts.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/proto_cpu.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    dataset_path = Path(config["paths"]["toy_dataset"])
    manifest_path = Path(config["paths"]["toy_manifest"])
    report_path = Path(config["paths"]["toy_report"])
    metrics_path = Path(config["paths"]["toy_metrics"])

    failures: list[str] = []
    for path in [dataset_path, manifest_path, report_path, metrics_path]:
        require(path.exists(), f"Missing artifact: {path}", failures)

    if failures:
        for failure in failures:
            print(failure)
        return 1

    dataset = load_json(dataset_path)
    manifest = load_json(manifest_path)
    metrics = load_json(metrics_path)
    report_text = report_path.read_text(encoding="utf-8")

    require(dataset.get("metadata", {}).get("schema_version") == "0.1", "Dataset schema_version missing or unexpected.", failures)
    failures.extend(validate_manifest(manifest))
    require(manifest.get("kind") == MANIFEST_KIND, "Manifest kind missing or unexpected.", failures)
    require(manifest.get("schema_version") == SCHEMA_VERSION, "Manifest schema_version missing or unexpected.", failures)
    require(metrics.get("toy_mode", {}).get("single_command_success") is True, "Metrics do not record toy-mode success.", failures)
    require("Runtime seconds" in report_text, "Report is missing runtime output.", failures)
    require("Peak memory MB" in report_text, "Report is missing memory output.", failures)
    require(metrics.get("eeg_to_fnirs", {}).get("model_mse", 1e9) < metrics.get("eeg_to_fnirs", {}).get("null_mse", -1e9), "EEG->fNIRS smoke model did not beat null baseline.", failures)
    require(metrics.get("fusion_to_ppg", {}).get("model_mae", 1e9) < metrics.get("fusion_to_ppg", {}).get("null_mae", -1e9), "Fusion->PPG smoke model did not beat null baseline.", failures)
    require(manifest.get("split_summary", {}).get("eval_windows", 0) > 0, "Manifest does not contain eval windows.", failures)
    require(manifest.get("storage", {}).get("dataset_path"), "Manifest storage.dataset_path is missing.", failures)
    require(len(dataset.get("windows", [])) > 0, "Dataset has no windows.", failures)

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print(f"Validated toy-mode artifacts for {config_path}")
    print(f"Dataset: {dataset_path}")
    print(f"Manifest: {manifest_path}")
    print(f"Report: {report_path}")
    print(f"Metrics: {metrics_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
