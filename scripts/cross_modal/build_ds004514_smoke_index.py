#!/usr/bin/env python3
"""Build a canonical event-aligned smoke index for DS004514 from local sidecars."""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
import tomllib


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def read_tsv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def fit_affine(xs: list[float], ys: list[float]) -> tuple[float, float]:
    count = len(xs)
    mean_x = sum(xs) / count
    mean_y = sum(ys) / count
    variance_x = sum((value - mean_x) ** 2 for value in xs)
    covariance_xy = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    slope = covariance_xy / variance_x if variance_x else 1.0
    intercept = mean_y - slope * mean_x
    return slope, intercept


def compute_alignment_metrics(eeg_events: list[dict[str, str]], fnirs_events: list[dict[str, str]]) -> tuple[dict, list[dict]]:
    if len(eeg_events) != len(fnirs_events):
        raise ValueError(f"Mismatched event row counts: EEG={len(eeg_events)} fNIRS={len(fnirs_events)}")

    mismatches = []
    eeg_onsets: list[float] = []
    fnirs_onsets: list[float] = []
    for index, (eeg_event, fnirs_event) in enumerate(zip(eeg_events, fnirs_events)):
        if eeg_event["trial_type"] != fnirs_event["trial_type"] or eeg_event["value"] != fnirs_event["value"]:
            mismatches.append(
                {
                    "event_index": index,
                    "eeg_trial_type": eeg_event["trial_type"],
                    "fnirs_trial_type": fnirs_event["trial_type"],
                    "eeg_value": eeg_event["value"],
                    "fnirs_value": fnirs_event["value"],
                }
            )
        eeg_onsets.append(float(eeg_event["onset"]))
        fnirs_onsets.append(float(fnirs_event["onset"]))

    if mismatches:
        raise ValueError(f"Found {len(mismatches)} event mismatches.")

    slope, intercept = fit_affine(eeg_onsets, fnirs_onsets)
    residuals = [fnirs - (slope * eeg + intercept) for eeg, fnirs in zip(eeg_onsets, fnirs_onsets)]
    rmse = math.sqrt(sum(residual * residual for residual in residuals) / len(residuals))
    max_abs = max(abs(residual) for residual in residuals)
    return (
        {
            "slope": slope,
            "intercept_seconds": intercept,
            "rmse_seconds": rmse,
            "max_abs_seconds": max_abs,
            "event_count": len(eeg_events),
            "trial_type_count": len({event["trial_type"] for event in eeg_events}),
        },
        [
            {
                "event_index": index,
                "trial_type": eeg_event["trial_type"],
                "event_value": eeg_event["value"],
                "stim_file": eeg_event.get("stim_file", "n/a"),
                "eeg_onset_seconds": float(eeg_event["onset"]),
                "fnirs_onset_seconds": float(fnirs_event["onset"]),
                "predicted_fnirs_onset_seconds": slope * float(eeg_event["onset"]) + intercept,
                "alignment_residual_seconds": residual,
            }
            for index, (eeg_event, fnirs_event, residual) in enumerate(zip(eeg_events, fnirs_events, residuals))
        ],
    )


def subject_split(config: dict, subject_id: str) -> str:
    if subject_id in set(config["subjects"]["eval"]):
        return "eval"
    return "train"


def raw_status(subject_root: Path, subject_id: str) -> dict[str, bool]:
    return {
        "eeg_raw_present": (subject_root / "eeg" / f"{subject_id}_task-eeg_eeg.bdf").exists(),
        "fnirs_raw_present": (subject_root / "nirs" / f"{subject_id}_task-nirs_nirs.snirf").exists(),
    }


def build_summary_markdown(metrics: dict, per_subject: list[dict], config_path: Path) -> str:
    lines = [
        "# DS004514 Smoke Summary",
        "",
        f"Config: `{str(config_path).replace(chr(92), '/')}`",
        "",
        "## Overview",
        "",
        f"- subjects indexed: {metrics['subject_count']}",
        f"- train subjects: {metrics['train_subject_count']}",
        f"- eval subjects: {metrics['eval_subject_count']}",
        f"- canonical event windows: {metrics['window_count']}",
        f"- max subject alignment RMSE (s): {metrics['max_subject_rmse_seconds']:.6f}",
        f"- max subject absolute residual (s): {metrics['max_subject_abs_seconds']:.6f}",
        "",
        "## Per-subject alignment",
        "",
    ]
    for subject in per_subject:
        lines.append(
            "- "
            f"{subject['subject_id']} [{subject['split']}]: "
            f"events={subject['event_count']}, "
            f"rmse={subject['rmse_seconds']:.6f}s, "
            f"max_abs={subject['max_abs_seconds']:.6f}s, "
            f"eeg_raw={subject['eeg_raw_present']}, "
            f"fnirs_raw={subject['fnirs_raw_present']}"
        )
    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- This smoke path indexes canonical event-aligned windows from BIDS sidecars and event tables.",
            "- It does not require heavyweight EEG raw downloads by default.",
            "- Real signal-level baselines still require fetching `.bdf` and `.snirf` payloads.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a canonical DS004514 smoke index.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_smoke.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    dataset_root = Path(config["paths"]["dataset_root"])
    window_index_path = Path(config["paths"]["window_index"])
    summary_path = Path(config["paths"]["summary"])
    metrics_path = Path(config["paths"]["metrics"])

    participants = {
        row["participant_id"]: row
        for row in read_tsv(dataset_root / "participants.tsv")
    }

    subjects = list(config["subjects"]["train"]) + [
        subject for subject in config["subjects"]["eval"] if subject not in set(config["subjects"]["train"])
    ]

    windows: list[dict] = []
    per_subject: list[dict] = []

    for subject_id in subjects:
        subject_root = dataset_root / subject_id
        eeg_events = read_tsv(subject_root / "eeg" / f"{subject_id}_task-eeg_events.tsv")
        fnirs_events = read_tsv(subject_root / "nirs" / f"{subject_id}_task-nirs_events.tsv")
        eeg_meta = read_json(subject_root / "eeg" / f"{subject_id}_task-eeg_eeg.json")
        fnirs_meta = read_json(subject_root / "nirs" / f"{subject_id}_task-nirs_nirs.json")
        scans = read_tsv(subject_root / f"{subject_id}_scans.tsv")
        alignment, subject_windows = compute_alignment_metrics(eeg_events=eeg_events, fnirs_events=fnirs_events)
        split = subject_split(config, subject_id)
        participant = participants[subject_id]
        raw = raw_status(subject_root, subject_id)

        for window in subject_windows:
            window.update(
                {
                    "subject_id": subject_id,
                    "split": split,
                    "age": int(participant["age"]),
                    "sex": participant["sex"],
                    "hand": participant["hand"],
                    "eeg_sampling_rate_hz": float(eeg_meta["SamplingFrequency"]),
                    "fnirs_sampling_rate_hz": float(fnirs_meta["SamplingFrequency"]),
                    "eeg_scan_acq_time": scans[0]["acq_time"],
                    "fnirs_scan_acq_time": scans[1]["acq_time"],
                    "alignment_slope": alignment["slope"],
                    "alignment_intercept_seconds": alignment["intercept_seconds"],
                    "alignment_reference": "matched_events_affine_fit",
                    "eeg_raw_present": raw["eeg_raw_present"],
                    "fnirs_raw_present": raw["fnirs_raw_present"],
                }
            )
        windows.extend(subject_windows)

        per_subject.append(
            {
                "subject_id": subject_id,
                "split": split,
                "age": int(participant["age"]),
                "sex": participant["sex"],
                "hand": participant["hand"],
                "event_count": alignment["event_count"],
                "trial_type_count": alignment["trial_type_count"],
                "slope": alignment["slope"],
                "intercept_seconds": alignment["intercept_seconds"],
                "rmse_seconds": alignment["rmse_seconds"],
                "max_abs_seconds": alignment["max_abs_seconds"],
                **raw,
            }
        )

    metrics = {
        "kind": "ds004514_smoke_metrics",
        "config_path": str(config_path).replace("\\", "/"),
        "subject_count": len(per_subject),
        "train_subject_count": sum(1 for subject in per_subject if subject["split"] == "train"),
        "eval_subject_count": sum(1 for subject in per_subject if subject["split"] == "eval"),
        "window_count": len(windows),
        "max_subject_rmse_seconds": max(subject["rmse_seconds"] for subject in per_subject),
        "max_subject_abs_seconds": max(subject["max_abs_seconds"] for subject in per_subject),
        "subjects_with_eeg_raw": sum(1 for subject in per_subject if subject["eeg_raw_present"]),
        "subjects_with_fnirs_raw": sum(1 for subject in per_subject if subject["fnirs_raw_present"]),
        "per_subject": per_subject,
    }

    payload = {
        "kind": "ds004514_smoke_index",
        "dataset_name": config["dataset"]["dataset_name"],
        "dataset_version": config["dataset"]["dataset_version"],
        "windows": windows,
    }

    for path in [window_index_path, summary_path, metrics_path]:
        ensure_parent(path)
    window_index_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    summary_path.write_text(build_summary_markdown(metrics=metrics, per_subject=per_subject, config_path=config_path), encoding="utf-8")

    print(f"Wrote smoke index to {window_index_path}")
    print(f"Wrote smoke metrics to {metrics_path}")
    print(f"Wrote smoke summary to {summary_path}")
    print(f"Canonical windows: {len(windows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
