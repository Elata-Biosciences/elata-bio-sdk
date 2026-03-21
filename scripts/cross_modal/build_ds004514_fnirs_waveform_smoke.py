#!/usr/bin/env python3
"""Build a waveform-level fNIRS smoke report for DS004514 raw SNIRF payloads."""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
from pathlib import Path
import sys
import tomllib


def add_local_pydeps() -> None:
    pydeps = Path(".tmp/pydeps")
    if pydeps.exists():
        sys.path.insert(0, str(pydeps.resolve()))


def ensure_h5py() -> None:
    add_local_pydeps()
    if importlib.util.find_spec("h5py") is None:
        raise SystemExit(
            "Missing optional dependency 'h5py'. "
            "Run `python scripts/cross_modal/bootstrap_waveform_deps.py` first."
        )


ensure_h5py()

import mne  # noqa: E402


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def read_tsv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def read_subjects(dataset_root: Path) -> list[str]:
    return sorted(path.name for path in dataset_root.iterdir() if path.is_dir() and path.name.startswith("sub-"))


def split_for_subject(subject_id: str) -> str:
    if subject_id in {"sub-03", "sub-04", "sub-11"}:
        return "eval"
    return "train"


def build_summary(metrics: dict) -> str:
    lines = [
        "# DS004514 fNIRS Waveform Smoke Summary",
        "",
        "## Overview",
        "",
        f"- subjects processed: {metrics['subject_count']}",
        f"- train subjects: {metrics['train_subject_count']}",
        f"- eval subjects: {metrics['eval_subject_count']}",
        f"- total image windows: {metrics['total_image_event_count']}",
        f"- raw channel counts observed: {', '.join(str(value) for value in metrics['raw_channel_count_set'])}",
        f"- sampling rates observed: {', '.join(str(value) for value in metrics['sampling_rate_set'])}",
        f"- low-median-SCI subjects: {', '.join(metrics['low_median_sci_subjects']) if metrics['low_median_sci_subjects'] else 'none'}",
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
            f"haemo_nchan={subject['haemo_channel_count']}, "
            f"image_events={subject['image_event_count']}, "
            f"sci_min={subject['sci_min']:.4f}, "
            f"sci_median={subject['sci_median']:.4f}, "
            f"below_{subject['sci_threshold']}={subject['low_sci_channel_count']}"
        )
    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- This stage validates real SNIRF loading and HbO/HbR derivation on the public raw payloads.",
            "- The dataset is heterogeneous at the raw fNIRS level: both channel count and sampling rate vary across subjects.",
            "- Any final ingest path must preserve geometry and handle subject-specific montage differences explicitly.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a DS004514 fNIRS waveform smoke report.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_fnirs_waveform.toml",
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
    sci_threshold = float(config["quality"]["sci_threshold"])
    low_median_threshold = float(config["quality"]["low_median_sci_threshold"])

    subjects = read_subjects(dataset_root)
    participant_rows = {row["participant_id"]: row for row in read_tsv(dataset_root / "participants.tsv")}
    per_subject: list[dict] = []

    for subject_id in subjects:
        snirf_path = dataset_root / subject_id / "nirs" / f"{subject_id}_task-nirs_nirs.snirf"
        events_path = dataset_root / subject_id / "nirs" / f"{subject_id}_task-nirs_events.tsv"
        raw = mne.io.read_raw_snirf(snirf_path, preload=True, verbose="ERROR")
        raw_od = mne.preprocessing.nirs.optical_density(raw)
        sci = mne.preprocessing.nirs.scalp_coupling_index(raw_od)
        raw_haemo = mne.preprocessing.nirs.beer_lambert_law(raw_od, ppf=0.1)
        events = read_tsv(events_path)
        image_events = [row for row in events if row["trial_type"] in use_trial_types]

        first_crop = raw_haemo.copy().crop(
            tmin=float(image_events[0]["onset"]) + tmin,
            tmax=float(image_events[0]["onset"]) + tmax,
            include_tmax=False,
        )
        participant = participant_rows[subject_id]
        haemo_types = raw_haemo.get_channel_types()
        per_subject.append(
            {
                "subject_id": subject_id,
                "split": split_for_subject(subject_id),
                "age": int(participant["age"]),
                "sex": participant["sex"],
                "hand": participant["hand"],
                "sfreq_hz": round(float(raw.info["sfreq"]), 6),
                "raw_channel_count": len(raw.ch_names),
                "haemo_channel_count": len(raw_haemo.ch_names),
                "hbo_channel_count": haemo_types.count("hbo"),
                "hbr_channel_count": haemo_types.count("hbr"),
                "duration_seconds": round(float(raw.times[-1]), 6),
                "image_event_count": len(image_events),
                "first_window_sample_count": int(first_crop.get_data().shape[1]),
                "window_duration_seconds": tmax - tmin,
                "sci_threshold": sci_threshold,
                "sci_min": float(min(sci)),
                "sci_median": float(sorted(sci)[len(sci) // 2]),
                "low_sci_channel_count": int(sum(value < sci_threshold for value in sci)),
            }
        )

    metrics = {
        "kind": "ds004514_fnirs_waveform_metrics",
        "config_path": str(config_path).replace("\\", "/"),
        "subject_count": len(per_subject),
        "train_subject_count": sum(1 for row in per_subject if row["split"] == "train"),
        "eval_subject_count": sum(1 for row in per_subject if row["split"] == "eval"),
        "total_image_event_count": sum(row["image_event_count"] for row in per_subject),
        "raw_channel_count_set": sorted({row["raw_channel_count"] for row in per_subject}),
        "sampling_rate_set": sorted({row["sfreq_hz"] for row in per_subject}),
        "low_median_sci_subjects": [
            row["subject_id"] for row in per_subject if row["sci_median"] < low_median_threshold
        ],
        "per_subject": per_subject,
    }

    for path in [metrics_path, summary_path]:
        ensure_parent(path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    summary_path.write_text(build_summary(metrics), encoding="utf-8")

    print(f"Wrote waveform metrics to {metrics_path}")
    print(f"Wrote waveform summary to {summary_path}")
    print(f"Subjects processed: {len(per_subject)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
