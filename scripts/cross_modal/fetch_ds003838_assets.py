#!/usr/bin/env python3
"""Fetch a small DS003838 EEG-PPG Phase 2 subset from the OpenNeuro S3 export."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import time
import tomllib
import urllib.request


ROOT_FILES = [
    "README",
    "dataset_description.json",
    "participants.json",
    "participants.tsv",
]

SUBJECT_SIDECAR_TEMPLATES = [
    "{subject}/eeg/{subject}_task-{task}_eeg.json",
    "{subject}/eeg/{subject}_task-{task}_channels.tsv",
    "{subject}/eeg/{subject}_task-{task}_events.tsv",
    "{subject}/ecg/{subject}_task-{task}_ecg.json",
    "{subject}/ecg/{subject}_task-{task}_channels.tsv",
    "{subject}/ecg/{subject}_task-{task}_events.tsv",
]

SUBJECT_RAW_TEMPLATES = {
    "eeg": "{subject}/eeg/{subject}_task-{task}_eeg.set",
    "ecg": "{subject}/ecg/{subject}_task-{task}_ecg.set",
}


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def iter_subjects(config: dict) -> list[str]:
    train = list(config["subjects"]["train"])
    eval_subjects = list(config["subjects"]["eval"])
    return train + [subject for subject in eval_subjects if subject not in train]


def iter_tasks(config: dict) -> list[str]:
    return list(config["tasks"]["include"])


def build_relative_paths(config: dict, raw_modalities: set[str]) -> list[str]:
    paths = list(ROOT_FILES)
    for subject in iter_subjects(config):
        for task in iter_tasks(config):
            for template in SUBJECT_SIDECAR_TEMPLATES:
                paths.append(template.format(subject=subject, task=task))
            for modality in sorted(raw_modalities):
                paths.append(SUBJECT_RAW_TEMPLATES[modality].format(subject=subject, task=task))
    return paths


def urlopen_with_retries(
    *,
    request: urllib.request.Request | str,
    timeout: int,
    retry_attempts: int,
    retry_backoff_seconds: float,
):
    last_error: Exception | None = None
    for attempt in range(1, retry_attempts + 1):
        try:
            return urllib.request.urlopen(request, timeout=timeout)
        except Exception as error:  # pragma: no cover - network failures are environment-specific.
            last_error = error
            if attempt == retry_attempts:
                raise
            time.sleep(retry_backoff_seconds * attempt)
    if last_error is not None:
        raise last_error
    raise RuntimeError("Unreachable retry path.")


def head_size(url: str, *, retry_attempts: int, retry_backoff_seconds: float) -> int | None:
    request = urllib.request.Request(url, method="HEAD")
    with urlopen_with_retries(
        request=request,
        timeout=30,
        retry_attempts=retry_attempts,
        retry_backoff_seconds=retry_backoff_seconds,
    ) as response:
        length = response.headers.get("Content-Length")
        return int(length) if length else None


def download_file(
    url: str,
    destination: Path,
    force: bool,
    *,
    retry_attempts: int,
    retry_backoff_seconds: float,
) -> tuple[str, int]:
    if destination.exists() and not force:
        return ("skipped_existing", destination.stat().st_size)

    ensure_parent(destination)
    with urlopen_with_retries(
        request=url,
        timeout=120,
        retry_attempts=retry_attempts,
        retry_backoff_seconds=retry_backoff_seconds,
    ) as response:
        payload = response.read()
    destination.write_bytes(payload)
    return ("downloaded", len(payload))


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch a DS003838 Phase 2 subset from OpenNeuro S3.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds003838_phase2_windows.toml",
        help="Path to the TOML config file.",
    )
    parser.add_argument(
        "--raw-modalities",
        help="Optional comma-separated override for raw modalities to fetch: eeg,ecg.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    dataset_root = Path(config["paths"]["dataset_root"])
    fetch_report_path = Path(config["paths"]["fetch_report"])
    base_url = config["dataset"]["base_url"].rstrip("/")
    force = bool(config["fetch"].get("force", False))
    retry_attempts = int(config["fetch"].get("retry_attempts", 3))
    retry_backoff_seconds = float(config["fetch"].get("retry_backoff_seconds", 2.0))
    raw_modalities = set(config["fetch"].get("raw_modalities", []))
    if args.raw_modalities is not None:
        raw_modalities = {item.strip() for item in args.raw_modalities.split(",") if item.strip()}
    invalid = raw_modalities - {"eeg", "ecg"}
    if invalid:
        raise SystemExit(f"Unsupported raw modalities requested: {sorted(invalid)}")

    relative_paths = build_relative_paths(config, raw_modalities)
    fetched: list[dict] = []
    total_bytes = 0
    for relative_path in relative_paths:
        url = f"{base_url}/{relative_path}"
        destination = dataset_root / relative_path
        status, size = download_file(
            url=url,
            destination=destination,
            force=force,
            retry_attempts=retry_attempts,
            retry_backoff_seconds=retry_backoff_seconds,
        )
        total_bytes += size if status == "downloaded" else 0
        fetched.append(
            {
                "relative_path": relative_path,
                "url": url,
                "status": status,
                "bytes": size,
            }
        )

    raw_sizes: dict[str, dict[str, int | None]] = {}
    subjects = iter_subjects(config)
    tasks = iter_tasks(config)
    for modality in sorted(raw_modalities):
        raw_sizes[modality] = {}
        for task in tasks:
            template = SUBJECT_RAW_TEMPLATES[modality]
            sample_url = f"{base_url}/{template.format(subject=subjects[0], task=task)}"
            raw_sizes[modality][task] = head_size(
                sample_url,
                retry_attempts=retry_attempts,
                retry_backoff_seconds=retry_backoff_seconds,
            )

    ensure_parent(fetch_report_path)
    report = {
        "kind": "ds003838_fetch_report",
        "config_path": str(config_path).replace("\\", "/"),
        "dataset_root": str(dataset_root).replace("\\", "/"),
        "subject_count": len(subjects),
        "subjects": subjects,
        "tasks": tasks,
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
