#!/usr/bin/env python3
"""Fetch a small DS006848 EEG-PPG Phase 2 subset from the OpenNeuro S3 export."""

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

SUBJECT_ALWAYS_TEMPLATES = [
    "{subject}/sub-{subject_suffix}_scans.tsv",
    "{subject}/eeg/{subject}_space-CapTrak_coordsystem.json",
    "{subject}/eeg/{subject}_space-CapTrak_electrodes.tsv",
]

SUBJECT_TASK_TEMPLATES = [
    "{subject}/eeg/{subject}_task-{task}_eeg.json",
    "{subject}/eeg/{subject}_task-{task}_channels.tsv",
    "{subject}/eeg/{subject}_task-{task}_events.tsv",
]

SUBJECT_BEH_TEMPLATES = [
    "{subject}/beh/{subject}_task-verbalwm_beh.json",
    "{subject}/beh/{subject}_task-verbalwm_beh.tsv",
]

SUBJECT_RAW_TEMPLATES = {
    "eeg": [
        "{subject}/eeg/{subject}_task-{task}_eeg.vhdr",
        "{subject}/eeg/{subject}_task-{task}_eeg.vmrk",
        "{subject}/eeg/{subject}_task-{task}_eeg.eeg",
    ]
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
        subject_suffix = subject.split("-", 1)[1]
        for template in SUBJECT_ALWAYS_TEMPLATES:
            paths.append(template.format(subject=subject, subject_suffix=subject_suffix))
        for task in iter_tasks(config):
            for template in SUBJECT_TASK_TEMPLATES:
                paths.append(template.format(subject=subject, task=task))
            if task == "verbalwm":
                for template in SUBJECT_BEH_TEMPLATES:
                    paths.append(template.format(subject=subject))
            for modality in sorted(raw_modalities):
                for template in SUBJECT_RAW_TEMPLATES[modality]:
                    paths.append(template.format(subject=subject, task=task))
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


def head_size(
    url: str,
    *,
    timeout_seconds: int,
    retry_attempts: int,
    retry_backoff_seconds: float,
) -> int | None:
    request = urllib.request.Request(url, method="HEAD")
    with urlopen_with_retries(
        request=request,
        timeout=timeout_seconds,
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
    timeout_seconds: int,
    retry_attempts: int,
    retry_backoff_seconds: float,
) -> tuple[str, int]:
    if destination.exists() and not force:
        return ("skipped_existing", destination.stat().st_size)

    ensure_parent(destination)
    temp_path = destination.with_suffix(destination.suffix + ".part")
    last_error: Exception | None = None
    for attempt in range(1, retry_attempts + 1):
        try:
            with urlopen_with_retries(
                request=url,
                timeout=timeout_seconds,
                retry_attempts=retry_attempts,
                retry_backoff_seconds=retry_backoff_seconds,
            ) as response:
                with temp_path.open("wb") as handle:
                    total_bytes = 0
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        handle.write(chunk)
                        total_bytes += len(chunk)
            temp_path.replace(destination)
            return ("downloaded", total_bytes)
        except Exception as error:  # pragma: no cover - network failures are environment-specific.
            last_error = error
            if temp_path.exists():
                temp_path.unlink()
            if attempt == retry_attempts:
                raise
            time.sleep(retry_backoff_seconds * attempt)
    if last_error is not None:
        raise last_error
    raise RuntimeError("Unreachable download retry path.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch a DS006848 Phase 2 subset from OpenNeuro S3.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_phase2_windows.toml",
        help="Path to the TOML config file.",
    )
    parser.add_argument(
        "--raw-modalities",
        help="Optional comma-separated override for raw modalities to fetch: eeg.",
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
    timeout_seconds = int(config["fetch"].get("timeout_seconds", 600))
    raw_modalities = set(config["fetch"].get("raw_modalities", []))
    if args.raw_modalities is not None:
        raw_modalities = {item.strip() for item in args.raw_modalities.split(",") if item.strip()}
    invalid = raw_modalities - {"eeg"}
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
            timeout_seconds=timeout_seconds,
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
            template = SUBJECT_RAW_TEMPLATES[modality][-1]
            sample_url = f"{base_url}/{template.format(subject=subjects[0], task=task)}"
            raw_sizes[modality][task] = head_size(
                sample_url,
                timeout_seconds=timeout_seconds,
                retry_attempts=retry_attempts,
                retry_backoff_seconds=retry_backoff_seconds,
            )

    ensure_parent(fetch_report_path)
    report = {
        "kind": "ds006848_fetch_report",
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
