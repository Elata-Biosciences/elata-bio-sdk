#!/usr/bin/env python3
"""Fetch a minimal DS004514 smoke subset directly from the OpenNeuro S3 export.

This intentionally uses only the Python standard library. By default it fetches
the BIDS sidecars needed for event-aligned canonical indexing and skips large
raw payloads unless they are explicitly enabled in the config or CLI.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import tomllib
import urllib.request


ROOT_FILES = [
    "CHANGES",
    "README",
    "dataset_description.json",
    "participants.json",
    "participants.tsv",
]

CODE_FILES = [
    "code/read_eeg.py",
    "code/read_fnirs.py",
]

SUBJECT_SIDECAR_FILES = [
    "{subject}/{subject}_scans.tsv",
    "{subject}/eeg/{subject}_task-eeg_eeg.json",
    "{subject}/eeg/{subject}_task-eeg_channels.tsv",
    "{subject}/eeg/{subject}_task-eeg_events.json",
    "{subject}/eeg/{subject}_task-eeg_events.tsv",
    "{subject}/nirs/{subject}_task-nirs_nirs.json",
    "{subject}/nirs/{subject}_task-nirs_channels.tsv",
    "{subject}/nirs/{subject}_task-nirs_events.json",
    "{subject}/nirs/{subject}_task-nirs_events.tsv",
    "{subject}/nirs/{subject}_optodes.tsv",
    "{subject}/nirs/{subject}_coordsystem.json",
]

SUBJECT_RAW_FILES = {
    "eeg": "{subject}/eeg/{subject}_task-eeg_eeg.bdf",
    "fnirs": "{subject}/nirs/{subject}_task-nirs_nirs.snirf",
}


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def iter_subjects(config: dict) -> list[str]:
    train = list(config["subjects"]["train"])
    eval_subjects = list(config["subjects"]["eval"])
    ordered = train + [subject for subject in eval_subjects if subject not in train]
    return ordered


def build_relative_paths(config: dict, raw_modalities: set[str]) -> list[str]:
    paths = list(ROOT_FILES)
    if bool(config["fetch"].get("include_code_examples", False)):
        paths.extend(CODE_FILES)
    for subject in iter_subjects(config):
        for template in SUBJECT_SIDECAR_FILES:
            paths.append(template.format(subject=subject))
        for modality in sorted(raw_modalities):
            paths.append(SUBJECT_RAW_FILES[modality].format(subject=subject))
    return paths


def head_size(url: str) -> int | None:
    request = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(request, timeout=30) as response:
        length = response.headers.get("Content-Length")
        return int(length) if length else None


def download_file(url: str, destination: Path, force: bool) -> tuple[str, int]:
    if destination.exists() and not force:
        return ("skipped_existing", destination.stat().st_size)

    ensure_parent(destination)
    with urllib.request.urlopen(url, timeout=60) as response:
        payload = response.read()
    destination.write_bytes(payload)
    return ("downloaded", len(payload))


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch a DS004514 smoke subset from OpenNeuro S3.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_smoke.toml",
        help="Path to the TOML config file.",
    )
    parser.add_argument(
        "--raw-modalities",
        help="Optional comma-separated override for raw modalities to fetch: eeg,fnirs.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    dataset_root = Path(config["paths"]["dataset_root"])
    fetch_report_path = Path(config["paths"]["fetch_report"])
    base_url = config["dataset"]["base_url"].rstrip("/")
    force = bool(config["fetch"].get("force", False))

    raw_modalities = set(config["fetch"].get("raw_modalities", []))
    if args.raw_modalities is not None:
        raw_modalities = {item.strip() for item in args.raw_modalities.split(",") if item.strip()}
    invalid = raw_modalities - {"eeg", "fnirs"}
    if invalid:
        raise SystemExit(f"Unsupported raw modalities requested: {sorted(invalid)}")

    relative_paths = build_relative_paths(config, raw_modalities)
    fetched: list[dict] = []
    total_bytes = 0

    for relative_path in relative_paths:
        url = f"{base_url}/{relative_path}"
        destination = dataset_root / relative_path
        status, size = download_file(url=url, destination=destination, force=force)
        total_bytes += size if status == "downloaded" else 0
        fetched.append(
            {
                "relative_path": relative_path,
                "url": url,
                "status": status,
                "bytes": size,
            }
        )

    raw_sizes = {}
    for modality in sorted(raw_modalities):
        template = SUBJECT_RAW_FILES[modality]
        sample_url = f"{base_url}/{template.format(subject=iter_subjects(config)[0])}"
        raw_sizes[modality] = head_size(sample_url)

    ensure_parent(fetch_report_path)
    report = {
        "kind": "ds004514_fetch_report",
        "config_path": str(config_path).replace("\\", "/"),
        "dataset_root": str(dataset_root).replace("\\", "/"),
        "subject_count": len(iter_subjects(config)),
        "subjects": iter_subjects(config),
        "raw_modalities": sorted(raw_modalities),
        "raw_head_sizes": raw_sizes,
        "downloaded_file_count": sum(1 for item in fetched if item["status"] == "downloaded"),
        "skipped_file_count": sum(1 for item in fetched if item["status"] == "skipped_existing"),
        "downloaded_bytes": total_bytes,
        "files": fetched,
    }
    fetch_report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"Wrote fetch report to {fetch_report_path}")
    print(f"Files processed: {len(fetched)}")
    print(f"New bytes downloaded: {total_bytes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
