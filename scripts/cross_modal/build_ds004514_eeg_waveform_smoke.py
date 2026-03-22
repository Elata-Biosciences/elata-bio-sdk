#!/usr/bin/env python3
"""Build a small EEG waveform smoke report for DS004514 BDF payloads."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import tomllib

import mne


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def read_tsv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def iter_subjects(config: dict) -> list[str]:
    train = list(config["subjects"]["train"])
    eval_subjects = list(config["subjects"]["eval"])
    return train + [subject for subject in eval_subjects if subject not in train]


def split_for_subject(config: dict, subject_id: str) -> str:
    return "eval" if subject_id in set(config["subjects"]["eval"]) else "train"


def channel_type_counts(rows: list[dict[str, str]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["type"]] = counts.get(row["type"], 0) + 1
    return counts


def first_window_shape(raw: mne.io.BaseRaw, onset_seconds: float, tmin: float, tmax: float, picks: list[int]) -> tuple[int, int]:
    start = int(round((onset_seconds + tmin) * raw.info["sfreq"]))
    stop = int(round((onset_seconds + tmax) * raw.info["sfreq"]))
    window = raw.get_data(start=start, stop=stop, picks=picks)
    return window.shape


def build_summary(metrics: dict, config_path: Path) -> str:
    lines = [
        "# DS004514 EEG Waveform Smoke Summary",
        "",
        f"Config: `{str(config_path).replace(chr(92), '/')}`",
        "",
        "## Overview",
        "",
        f"- subjects processed: {metrics['subject_count']}",
        f"- train subjects: {metrics['train_subject_count']}",
        f"- eval subjects: {metrics['eval_subject_count']}",
        f"- image events indexed: {metrics['total_image_event_count']}",
        f"- raw sampling rates observed: {', '.join(str(value) for value in metrics['sampling_rate_set'])}",
        f"- total raw channel counts observed: {', '.join(str(value) for value in metrics['raw_channel_count_set'])}",
        "",
        "## Per-subject metrics",
        "",
    ]
    for subject in metrics["per_subject"]:
        lines.append(
            "- "
            f"{subject['subject_id']} [{subject['split']}]: "
            f"sfreq={subject['sfreq_hz']}, "
            f"raw_nchan={subject['raw_channel_count']}, "
            f"eeg_nchan={subject['eeg_channel_count']}, "
            f"image_events={subject['image_event_count']}, "
            f"window_shape={subject['first_window_shape']}, "
            f"duration={subject['duration_seconds']:.3f}s"
        )
    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- This stage validates real BDF loading and event-anchored waveform access on a laptop-safe two-subject subset.",
            "- It avoids full-dataset EEG download while still proving the raw EEG branch is workable.",
            "- The next step is to align these EEG waveform windows against the already-validated fNIRS waveform branch.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a DS004514 EEG waveform smoke report.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_eeg_waveform.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    dataset_root = Path(config["paths"]["dataset_root"])
    metrics_path = Path(config["paths"]["metrics"])
    summary_path = Path(config["paths"]["summary"])
    use_trial_types = set(config["window"]["event_trial_types"])
    tmin = float(config["window"]["tmin_seconds"])
    tmax = float(config["window"]["tmax_seconds"])

    participants = {row["participant_id"]: row for row in read_tsv(dataset_root / "participants.tsv")}
    per_subject: list[dict] = []

    for subject_id in iter_subjects(config):
        participant = participants[subject_id]
        subject_root = dataset_root / subject_id
        bdf_path = subject_root / "eeg" / f"{subject_id}_task-eeg_eeg.bdf"
        events_path = subject_root / "eeg" / f"{subject_id}_task-eeg_events.tsv"
        channels_path = subject_root / "eeg" / f"{subject_id}_task-eeg_channels.tsv"

        raw = mne.io.read_raw_bdf(bdf_path, preload=False, verbose="ERROR")
        channel_rows = read_tsv(channels_path)
        type_counts = channel_type_counts(channel_rows)
        image_events = [row for row in read_tsv(events_path) if row["trial_type"] in use_trial_types]
        eeg_picks = list(range(type_counts.get("EEG", 0)))
        shape = first_window_shape(raw=raw, onset_seconds=float(image_events[0]["onset"]), tmin=tmin, tmax=tmax, picks=eeg_picks)

        per_subject.append(
            {
                "subject_id": subject_id,
                "split": split_for_subject(config, subject_id),
                "age": int(participant["age"]),
                "sex": participant["sex"],
                "hand": participant["hand"],
                "sfreq_hz": round(float(raw.info["sfreq"]), 6),
                "raw_channel_count": len(raw.ch_names),
                "eeg_channel_count": type_counts.get("EEG", 0),
                "misc_channel_count": type_counts.get("MISC", 0),
                "gsr_channel_count": type_counts.get("GSR", 0),
                "resp_channel_count": type_counts.get("RESP", 0),
                "temp_channel_count": type_counts.get("TEMP", 0),
                "trig_channel_count": type_counts.get("TRIG", 0),
                "duration_seconds": float(raw.n_times / raw.info["sfreq"]),
                "image_event_count": len(image_events),
                "first_window_shape": list(shape),
            }
        )

    metrics = {
        "kind": "ds004514_eeg_waveform_metrics",
        "config_path": str(config_path).replace("\\", "/"),
        "subject_count": len(per_subject),
        "train_subject_count": sum(1 for row in per_subject if row["split"] == "train"),
        "eval_subject_count": sum(1 for row in per_subject if row["split"] == "eval"),
        "total_image_event_count": sum(row["image_event_count"] for row in per_subject),
        "sampling_rate_set": sorted({row["sfreq_hz"] for row in per_subject}),
        "raw_channel_count_set": sorted({row["raw_channel_count"] for row in per_subject}),
        "per_subject": per_subject,
    }

    for path in [metrics_path, summary_path]:
        ensure_parent(path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    summary_path.write_text(build_summary(metrics=metrics, config_path=config_path), encoding="utf-8")

    print(f"Wrote EEG waveform metrics to {metrics_path}")
    print(f"Wrote EEG waveform summary to {summary_path}")
    print(f"Subjects processed: {len(per_subject)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
