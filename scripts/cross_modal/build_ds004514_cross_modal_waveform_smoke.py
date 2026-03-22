#!/usr/bin/env python3
"""Build a paired EEG-fNIRS waveform smoke dataset for DS004514."""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import math
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
import numpy as np  # noqa: E402


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


def fit_affine(xs: list[float], ys: list[float]) -> tuple[float, float]:
    count = len(xs)
    mean_x = sum(xs) / count
    mean_y = sum(ys) / count
    variance_x = sum((value - mean_x) ** 2 for value in xs)
    covariance_xy = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    slope = covariance_xy / variance_x if variance_x else 1.0
    intercept = mean_y - slope * mean_x
    return slope, intercept


def matched_image_events(eeg_events: list[dict[str, str]], fnirs_events: list[dict[str, str]], use_trial_types: set[str]) -> tuple[list[dict], dict]:
    if len(eeg_events) != len(fnirs_events):
        raise ValueError(f"Mismatched event row counts: EEG={len(eeg_events)} fNIRS={len(fnirs_events)}")

    eeg_onsets = [float(row["onset"]) for row in eeg_events]
    fnirs_onsets = [float(row["onset"]) for row in fnirs_events]
    slope, intercept = fit_affine(eeg_onsets, fnirs_onsets)
    residuals = [fnirs - (slope * eeg + intercept) for eeg, fnirs in zip(eeg_onsets, fnirs_onsets)]
    rmse = math.sqrt(sum(residual * residual for residual in residuals) / len(residuals))
    max_abs = max(abs(residual) for residual in residuals)

    matched: list[dict] = []
    for index, (eeg_row, fnirs_row, residual) in enumerate(zip(eeg_events, fnirs_events, residuals)):
        if eeg_row["trial_type"] != fnirs_row["trial_type"] or eeg_row["value"] != fnirs_row["value"]:
            raise ValueError(f"Event mismatch at row {index}: EEG={eeg_row['trial_type']} fNIRS={fnirs_row['trial_type']}")
        if eeg_row["trial_type"] not in use_trial_types:
            continue
        matched.append(
            {
                "event_index": index,
                "trial_type": eeg_row["trial_type"],
                "event_value": int(eeg_row["value"]),
                "stim_file": eeg_row.get("stim_file", "n/a"),
                "eeg_onset_seconds": float(eeg_row["onset"]),
                "fnirs_onset_seconds": float(fnirs_row["onset"]),
                "predicted_fnirs_onset_seconds": slope * float(eeg_row["onset"]) + intercept,
                "alignment_residual_seconds": residual,
            }
        )

    return matched, {
        "slope": slope,
        "intercept_seconds": intercept,
        "rmse_seconds": rmse,
        "max_abs_seconds": max_abs,
    }


def eeg_window(raw: mne.io.BaseRaw, onset_seconds: float, tmin: float, tmax: float, eeg_channel_count: int) -> np.ndarray:
    sfreq = float(raw.info["sfreq"])
    start = int(round((onset_seconds + tmin) * sfreq))
    sample_count = int(round((tmax - tmin) * sfreq))
    stop = start + sample_count
    return raw.get_data(start=start, stop=stop, picks=list(range(eeg_channel_count))).astype(np.float32)


def fnirs_window(raw_haemo_data: np.ndarray, sfreq: float, onset_seconds: float, tmin: float, tmax: float) -> np.ndarray:
    start = int(round((onset_seconds + tmin) * sfreq))
    stop = int(round((onset_seconds + tmax) * sfreq))
    return raw_haemo_data[:, start:stop].astype(np.float32)


def build_summary(metrics: dict, config_path: Path) -> str:
    lines = [
        "# DS004514 Cross-Modal Waveform Smoke Summary",
        "",
        f"Config: `{str(config_path).replace(chr(92), '/')}`",
        "",
        "## Overview",
        "",
        f"- subjects processed: {metrics['subject_count']}",
        f"- train subjects: {metrics['train_subject_count']}",
        f"- eval subjects: {metrics['eval_subject_count']}",
        f"- paired windows: {metrics['paired_window_count']}",
        f"- eeg tensor shape: {metrics['eeg_tensor_shape']}",
        f"- fnirs tensor shape: {metrics['fnirs_tensor_shape']}",
        f"- max alignment RMSE (s): {metrics['max_subject_rmse_seconds']:.6f}",
        "",
        "## Per-subject alignment",
        "",
    ]
    for subject in metrics["per_subject"]:
        lines.append(
            "- "
            f"{subject['subject_id']} [{subject['split']}]: "
            f"paired_windows={subject['paired_window_count']}, "
            f"eeg_shape={subject['eeg_window_shape']}, "
            f"fnirs_shape={subject['fnirs_window_shape']}, "
            f"rmse={subject['rmse_seconds']:.6f}s, "
            f"max_abs={subject['max_abs_seconds']:.6f}s"
        )
    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- This is the first true paired waveform artifact in the repo.",
            "- It uses the event-alignment transform to bridge EEG and fNIRS timing instead of assuming shared file-start time.",
            "- The scope is intentionally limited to the uniform fNIRS variant shared by `sub-01` and `sub-03`.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a paired DS004514 EEG-fNIRS waveform smoke dataset.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_cross_modal_waveform.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    dataset_root = Path(config["paths"]["dataset_root"])
    dataset_path = Path(config["paths"]["dataset"])
    metadata_path = Path(config["paths"]["metadata"])
    metrics_path = Path(config["paths"]["metrics"])
    summary_path = Path(config["paths"]["summary"])
    use_trial_types = set(config["window"]["event_trial_types"])
    eeg_tmin = float(config["window"]["eeg_tmin_seconds"])
    eeg_tmax = float(config["window"]["eeg_tmax_seconds"])
    fnirs_tmin = float(config["window"]["fnirs_tmin_seconds"])
    fnirs_tmax = float(config["window"]["fnirs_tmax_seconds"])
    eeg_channel_count = int(config["window"]["eeg_channel_count"])

    participants = {row["participant_id"]: row for row in read_tsv(dataset_root / "participants.tsv")}
    eeg_windows: list[np.ndarray] = []
    fnirs_windows: list[np.ndarray] = []
    metadata_windows: list[dict] = []
    per_subject: list[dict] = []

    for subject_id in iter_subjects(config):
        split = split_for_subject(config, subject_id)
        subject_root = dataset_root / subject_id
        eeg_raw = mne.io.read_raw_bdf(subject_root / "eeg" / f"{subject_id}_task-eeg_eeg.bdf", preload=False, verbose="ERROR")
        fnirs_raw = mne.io.read_raw_snirf(subject_root / "nirs" / f"{subject_id}_task-nirs_nirs.snirf", preload=True, verbose="ERROR")
        fnirs_od = mne.preprocessing.nirs.optical_density(fnirs_raw)
        fnirs_haemo = mne.preprocessing.nirs.beer_lambert_law(fnirs_od, ppf=0.1)
        fnirs_haemo_data = fnirs_haemo.get_data()
        fnirs_sfreq = float(fnirs_haemo.info["sfreq"])

        eeg_events = read_tsv(subject_root / "eeg" / f"{subject_id}_task-eeg_events.tsv")
        fnirs_events = read_tsv(subject_root / "nirs" / f"{subject_id}_task-nirs_events.tsv")
        matched, alignment = matched_image_events(eeg_events=eeg_events, fnirs_events=fnirs_events, use_trial_types=use_trial_types)
        participant = participants[subject_id]

        first_eeg_shape: list[int] | None = None
        first_fnirs_shape: list[int] | None = None
        for matched_event in matched:
            eeg_array = eeg_window(
                raw=eeg_raw,
                onset_seconds=matched_event["eeg_onset_seconds"],
                tmin=eeg_tmin,
                tmax=eeg_tmax,
                eeg_channel_count=eeg_channel_count,
            )
            fnirs_array = fnirs_window(
                raw_haemo_data=fnirs_haemo_data,
                sfreq=fnirs_sfreq,
                onset_seconds=matched_event["fnirs_onset_seconds"],
                tmin=fnirs_tmin,
                tmax=fnirs_tmax,
            )
            if first_eeg_shape is None:
                first_eeg_shape = list(eeg_array.shape)
            if first_fnirs_shape is None:
                first_fnirs_shape = list(fnirs_array.shape)

            eeg_windows.append(eeg_array)
            fnirs_windows.append(fnirs_array)
            metadata_windows.append(
                {
                    "subject_id": subject_id,
                    "split": split,
                    "age": int(participant["age"]),
                    "sex": participant["sex"],
                    "hand": participant["hand"],
                    "source_dataset": config["dataset"]["dataset_id"],
                    "run_id": "task-eeg__task-nirs",
                    "event_index": matched_event["event_index"],
                    "trial_type": matched_event["trial_type"],
                    "event_value": matched_event["event_value"],
                    "stim_file": matched_event["stim_file"],
                    "eeg_window_start_seconds": matched_event["eeg_onset_seconds"] + eeg_tmin,
                    "eeg_window_end_seconds": matched_event["eeg_onset_seconds"] + eeg_tmax,
                    "fnirs_window_start_seconds": matched_event["fnirs_onset_seconds"] + fnirs_tmin,
                    "fnirs_window_end_seconds": matched_event["fnirs_onset_seconds"] + fnirs_tmax,
                    "alignment_reference": "matched_events_affine_fit",
                    "geometry_reference": "subject_sidecars_optodes_and_coordsystem",
                    "preprocessing_branch": "eeg_raw_native__fnirs_hbo_hbr_from_raw_amplitude",
                    "alignment_slope": alignment["slope"],
                    "alignment_intercept_seconds": alignment["intercept_seconds"],
                    "alignment_residual_seconds": matched_event["alignment_residual_seconds"],
                }
            )

        per_subject.append(
            {
                "subject_id": subject_id,
                "split": split,
                "paired_window_count": len(matched),
                "eeg_window_shape": first_eeg_shape,
                "fnirs_window_shape": first_fnirs_shape,
                "rmse_seconds": alignment["rmse_seconds"],
                "max_abs_seconds": alignment["max_abs_seconds"],
                "fnirs_channel_count": int(fnirs_haemo_data.shape[0]),
                "fnirs_sampling_rate_hz": fnirs_sfreq,
            }
        )

    eeg_tensor = np.stack(eeg_windows, axis=0)
    fnirs_tensor = np.stack(fnirs_windows, axis=0)

    for path in [dataset_path, metadata_path, metrics_path, summary_path]:
        ensure_parent(path)
    np.savez_compressed(
        dataset_path,
        eeg_windows=eeg_tensor,
        fnirs_windows=fnirs_tensor,
    )
    metadata_path.write_text(json.dumps({"windows": metadata_windows}, indent=2), encoding="utf-8")

    metrics = {
        "kind": "ds004514_cross_modal_waveform_metrics",
        "config_path": str(config_path).replace("\\", "/"),
        "subject_count": len(per_subject),
        "train_subject_count": sum(1 for row in per_subject if row["split"] == "train"),
        "eval_subject_count": sum(1 for row in per_subject if row["split"] == "eval"),
        "paired_window_count": int(eeg_tensor.shape[0]),
        "eeg_tensor_shape": list(eeg_tensor.shape),
        "fnirs_tensor_shape": list(fnirs_tensor.shape),
        "max_subject_rmse_seconds": max(row["rmse_seconds"] for row in per_subject),
        "max_subject_abs_seconds": max(row["max_abs_seconds"] for row in per_subject),
        "per_subject": per_subject,
    }
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    summary_path.write_text(build_summary(metrics=metrics, config_path=config_path), encoding="utf-8")

    print(f"Wrote paired waveform dataset to {dataset_path}")
    print(f"Wrote paired waveform metadata to {metadata_path}")
    print(f"Wrote paired waveform metrics to {metrics_path}")
    print(f"Wrote paired waveform summary to {summary_path}")
    print(f"Paired windows: {eeg_tensor.shape[0]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
