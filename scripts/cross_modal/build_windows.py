#!/usr/bin/env python3
"""Build a canonical paired EEG-fNIRS Phase 2 window dataset."""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import math
from pathlib import Path
import sys
import time
import tomllib
import tracemalloc


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


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


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


def validate_subject_policy(config: dict, subject_ids: list[str]) -> tuple[Path, str]:
    policy_path = Path(config["policy"]["subject_quality_policy"])
    allowed_tier = config["policy"]["allowed_tier"]
    policy = load_json(policy_path)
    tiers = policy["tiers"]
    if allowed_tier not in tiers:
        raise SystemExit(f"Unknown subject policy tier '{allowed_tier}' in {policy_path}.")
    allowed_subjects = set(tiers[allowed_tier])
    disallowed = [subject_id for subject_id in subject_ids if subject_id not in allowed_subjects]
    if disallowed:
        raise SystemExit(
            f"Configured subjects {disallowed} are outside allowed subject-quality tier "
            f"'{allowed_tier}' from {policy_path}."
        )
    return policy_path, allowed_tier


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
                "alignment_residual_seconds": residual,
            }
        )

    return matched, {
        "slope": slope,
        "intercept_seconds": intercept,
        "rmse_seconds": rmse,
        "max_abs_seconds": max_abs,
    }


def extract_eeg_window(raw: mne.io.BaseRaw, onset_seconds: float, tmin: float, tmax: float, eeg_channel_count: int) -> np.ndarray:
    sfreq = float(raw.info["sfreq"])
    start = int(round((onset_seconds + tmin) * sfreq))
    sample_count = int(round((tmax - tmin) * sfreq))
    stop = start + sample_count
    return raw.get_data(start=start, stop=stop, picks=list(range(eeg_channel_count))).astype(np.float32)


def clean_eeg_window(data: np.ndarray, source_sfreq: float, target_sfreq: float, notch_freq_hz: float) -> np.ndarray:
    cleaned = mne.filter.notch_filter(
        data.astype(np.float64, copy=False),
        Fs=source_sfreq,
        freqs=[notch_freq_hz],
        method="iir",
        phase="zero",
        verbose="ERROR",
    )
    source = int(round(source_sfreq))
    target = int(round(target_sfreq))
    common_divisor = math.gcd(source, target)
    return mne.filter.resample(
        cleaned,
        up=target // common_divisor,
        down=source // common_divisor,
        axis=-1,
        verbose="ERROR",
    ).astype(np.float32)


def resample_rows(data: np.ndarray, target_samples: int) -> np.ndarray:
    source_samples = data.shape[1]
    if source_samples == target_samples:
        return data.astype(np.float32)
    source_x = np.linspace(0.0, 1.0, source_samples, dtype=np.float64)
    target_x = np.linspace(0.0, 1.0, target_samples, dtype=np.float64)
    out = np.empty((data.shape[0], target_samples), dtype=np.float32)
    for row_index in range(data.shape[0]):
        out[row_index] = np.interp(target_x, source_x, data[row_index]).astype(np.float32)
    return out


def canonical_fnirs_window(raw_haemo: mne.io.BaseRaw, canonical_channels: list[str], onset_seconds: float, tmin: float, tmax: float, target_samples: int) -> np.ndarray:
    sfreq = float(raw_haemo.info["sfreq"])
    start = int(round((onset_seconds + tmin) * sfreq))
    stop = int(round((onset_seconds + tmax) * sfreq))
    picks = [raw_haemo.ch_names.index(name) for name in canonical_channels]
    data = raw_haemo.get_data(start=start, stop=stop, picks=picks)
    return resample_rows(data, target_samples)


def canonical_channel_names(dataset_root: Path, subject_ids: list[str]) -> list[str]:
    channel_sets: dict[str, list[str]] = {}
    for subject_id in subject_ids:
        raw = mne.io.read_raw_snirf(dataset_root / subject_id / "nirs" / f"{subject_id}_task-nirs_nirs.snirf", preload=True, verbose="ERROR")
        raw_haemo = mne.preprocessing.nirs.beer_lambert_law(mne.preprocessing.nirs.optical_density(raw), ppf=0.1)
        channel_sets[subject_id] = list(raw_haemo.ch_names)
    common = set(channel_sets[subject_ids[0]])
    for subject_id in subject_ids[1:]:
        common &= set(channel_sets[subject_id])
    return [name for name in channel_sets[subject_ids[0]] if name in common]


def window_quality_flags(event_window: np.ndarray, clean_window: np.ndarray, fnirs_window: np.ndarray, alignment: dict, residual_seconds: float, quality_config: dict) -> tuple[dict, float]:
    flags = {
        "alignment_rmse_ok": bool(alignment["rmse_seconds"] <= float(quality_config["max_alignment_rmse_seconds"])),
        "alignment_residual_ok": bool(abs(residual_seconds) <= float(quality_config["max_alignment_abs_seconds"])),
        "eeg_event_has_nan": bool(np.isnan(event_window).any()),
        "eeg_clean_has_nan": bool(np.isnan(clean_window).any()),
        "fnirs_has_nan": bool(np.isnan(fnirs_window).any()),
    }
    alignment_penalty = min(abs(residual_seconds) / max(float(quality_config["max_alignment_abs_seconds"]), 1e-12), 1.0)
    finite_penalty = 1.0 if (flags["eeg_event_has_nan"] or flags["eeg_clean_has_nan"] or flags["fnirs_has_nan"]) else 0.0
    score = max(0.0, 1.0 - 0.5 * alignment_penalty - 0.5 * finite_penalty)
    flags["window_quality_pass"] = bool(
        flags["alignment_rmse_ok"]
        and flags["alignment_residual_ok"]
        and not flags["eeg_event_has_nan"]
        and not flags["eeg_clean_has_nan"]
        and not flags["fnirs_has_nan"]
    )
    return flags, score


def build_summary(metrics: dict, config_path: Path) -> str:
    lines = [
        "# DS004514 Phase 2 Windowing Summary",
        "",
        f"Config: `{str(config_path).replace(chr(92), '/')}`",
        "",
        "## Overview",
        "",
        f"- subjects processed: {metrics['subject_count']}",
        f"- train subjects: {metrics['train_subject_count']}",
        f"- eval subjects: {metrics['eval_subject_count']}",
        f"- paired windows: {metrics['paired_window_count']}",
        f"- quality-pass windows: {metrics['quality_pass_window_count']}",
        f"- eeg event tensor shape: {metrics['eeg_event_tensor_shape']}",
        f"- eeg clean tensor shape: {metrics['eeg_clean_tensor_shape']}",
        f"- fnirs tensor shape: {metrics['fnirs_tensor_shape']}",
        f"- canonical fNIRS channels: {metrics['canonical_channel_count']}",
        f"- max alignment RMSE (s): {metrics['max_subject_rmse_seconds']:.6f}",
        "",
        "## Notes",
        "",
        "- This is the first reusable Phase 2-style paired window artifact built from the DS004514 canonicalized path.",
        "- The dataset carries both an event-preserving EEG view and a cleaned EEG view for side-by-side baseline comparisons.",
        "- The cleaned EEG view currently uses zero-phase 60 Hz notch filtering plus 2048 Hz to 256 Hz resampling.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Phase 2 paired windows from the DS004514 canonicalized path.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_phase2_windows.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    if config["builder"]["pipeline"] != "ds004514_eeg_fnirs_phase2":
        raise SystemExit(f"Unsupported pipeline: {config['builder']['pipeline']}")

    dataset_root = Path(config["paths"]["dataset_root"])
    dataset_path = Path(config["paths"]["dataset"])
    metadata_path = Path(config["paths"]["metadata"])
    metrics_path = Path(config["paths"]["metrics"])
    summary_path = Path(config["paths"]["summary"])
    subject_ids = iter_subjects(config)
    policy_path, allowed_tier = validate_subject_policy(config=config, subject_ids=subject_ids)
    use_trial_types = set(config["window"]["event_trial_types"])
    eeg_event_tmin = float(config["window"]["eeg_event_tmin_seconds"])
    eeg_event_tmax = float(config["window"]["eeg_event_tmax_seconds"])
    eeg_clean_tmin = float(config["window"]["eeg_clean_tmin_seconds"])
    eeg_clean_tmax = float(config["window"]["eeg_clean_tmax_seconds"])
    eeg_event_channel_count = int(config["window"]["eeg_event_channel_count"])
    eeg_clean_resample_hz = float(config["window"]["eeg_clean_resample_hz"])
    fnirs_tmin = float(config["window"]["fnirs_tmin_seconds"])
    fnirs_tmax = float(config["window"]["fnirs_tmax_seconds"])
    fnirs_target_samples = int(config["window"]["fnirs_target_samples"])
    notch_freq_hz = float(config["cleaning"]["eeg"]["notch_freq_hz"])
    quality_config = config["quality"]

    participants = {row["participant_id"]: row for row in read_tsv(dataset_root / "participants.tsv")}
    canonical_channels = canonical_channel_names(dataset_root=dataset_root, subject_ids=subject_ids)

    eeg_event_windows: list[np.ndarray] = []
    eeg_clean_windows: list[np.ndarray] = []
    fnirs_windows: list[np.ndarray] = []
    metadata_windows: list[dict] = []
    per_subject: list[dict] = []

    tracemalloc.start()
    start = time.perf_counter()

    for subject_id in subject_ids:
        split = split_for_subject(config, subject_id)
        subject_root = dataset_root / subject_id
        eeg_raw = mne.io.read_raw_bdf(subject_root / "eeg" / f"{subject_id}_task-eeg_eeg.bdf", preload=False, verbose="ERROR")
        eeg_sfreq = float(eeg_raw.info["sfreq"])
        fnirs_raw = mne.io.read_raw_snirf(subject_root / "nirs" / f"{subject_id}_task-nirs_nirs.snirf", preload=True, verbose="ERROR")
        fnirs_haemo = mne.preprocessing.nirs.beer_lambert_law(mne.preprocessing.nirs.optical_density(fnirs_raw), ppf=0.1)
        eeg_events = read_tsv(subject_root / "eeg" / f"{subject_id}_task-eeg_events.tsv")
        fnirs_events = read_tsv(subject_root / "nirs" / f"{subject_id}_task-nirs_events.tsv")
        matched, alignment = matched_image_events(eeg_events=eeg_events, fnirs_events=fnirs_events, use_trial_types=use_trial_types)
        participant = participants[subject_id]

        quality_pass_count = 0
        for matched_event in matched:
            eeg_event = extract_eeg_window(
                raw=eeg_raw,
                onset_seconds=matched_event["eeg_onset_seconds"],
                tmin=eeg_event_tmin,
                tmax=eeg_event_tmax,
                eeg_channel_count=eeg_event_channel_count,
            )
            eeg_clean_source = extract_eeg_window(
                raw=eeg_raw,
                onset_seconds=matched_event["eeg_onset_seconds"],
                tmin=eeg_clean_tmin,
                tmax=eeg_clean_tmax,
                eeg_channel_count=eeg_event_channel_count,
            )
            eeg_clean = clean_eeg_window(
                data=eeg_clean_source,
                source_sfreq=eeg_sfreq,
                target_sfreq=eeg_clean_resample_hz,
                notch_freq_hz=notch_freq_hz,
            )
            fnirs_window = canonical_fnirs_window(
                raw_haemo=fnirs_haemo,
                canonical_channels=canonical_channels,
                onset_seconds=matched_event["fnirs_onset_seconds"],
                tmin=fnirs_tmin,
                tmax=fnirs_tmax,
                target_samples=fnirs_target_samples,
            )
            quality_flags, quality_score = window_quality_flags(
                event_window=eeg_event,
                clean_window=eeg_clean,
                fnirs_window=fnirs_window,
                alignment=alignment,
                residual_seconds=matched_event["alignment_residual_seconds"],
                quality_config=quality_config,
            )
            quality_pass_count += int(quality_flags["window_quality_pass"])

            eeg_event_windows.append(eeg_event)
            eeg_clean_windows.append(eeg_clean)
            fnirs_windows.append(fnirs_window)
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
                    "alignment_reference": "matched_events_affine_fit",
                    "geometry_reference": "canonical_overlap_hbo_hbr_channel_space",
                    "preprocessing_branch": "eeg_event_native__eeg_clean_zero_phase_notch_resample__fnirs_hbo_hbr_canonicalized",
                    "subject_quality_tier": allowed_tier,
                    "window_anchor": config["window"]["anchor"],
                    "eeg_event_window_start_seconds": matched_event["eeg_onset_seconds"] + eeg_event_tmin,
                    "eeg_event_window_end_seconds": matched_event["eeg_onset_seconds"] + eeg_event_tmax,
                    "eeg_clean_window_start_seconds": matched_event["eeg_onset_seconds"] + eeg_clean_tmin,
                    "eeg_clean_window_end_seconds": matched_event["eeg_onset_seconds"] + eeg_clean_tmax,
                    "fnirs_window_start_seconds": matched_event["fnirs_onset_seconds"] + fnirs_tmin,
                    "fnirs_window_end_seconds": matched_event["fnirs_onset_seconds"] + fnirs_tmax,
                    "canonical_channel_names": canonical_channels,
                    "canonical_fnirs_target_samples": fnirs_target_samples,
                    "eeg_event_native_sfreq_hz": eeg_sfreq,
                    "eeg_clean_sfreq_hz": eeg_clean_resample_hz,
                    "alignment_slope": alignment["slope"],
                    "alignment_intercept_seconds": alignment["intercept_seconds"],
                    "alignment_residual_seconds": matched_event["alignment_residual_seconds"],
                    "quality_flags": quality_flags,
                    "quality_score": quality_score,
                }
            )

        per_subject.append(
            {
                "subject_id": subject_id,
                "split": split,
                "paired_window_count": len(matched),
                "quality_pass_window_count": quality_pass_count,
                "rmse_seconds": alignment["rmse_seconds"],
                "max_abs_seconds": alignment["max_abs_seconds"],
                "original_fnirs_channel_count": len(fnirs_haemo.ch_names),
                "original_fnirs_sampling_rate_hz": float(fnirs_haemo.info["sfreq"]),
                "subject_quality_tier": allowed_tier,
            }
        )

    runtime_sec = time.perf_counter() - start
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    eeg_event_tensor = np.stack(eeg_event_windows, axis=0)
    eeg_clean_tensor = np.stack(eeg_clean_windows, axis=0)
    fnirs_tensor = np.stack(fnirs_windows, axis=0)

    for path in [dataset_path, metadata_path, metrics_path, summary_path]:
        ensure_parent(path)
    np.savez_compressed(
        dataset_path,
        eeg_event_windows=eeg_event_tensor,
        eeg_clean_windows=eeg_clean_tensor,
        fnirs_windows=fnirs_tensor,
    )
    metadata_path.write_text(json.dumps({"windows": metadata_windows}, indent=2), encoding="utf-8")

    quality_pass_count = sum(1 for row in metadata_windows if row["quality_flags"]["window_quality_pass"])
    metrics = {
        "kind": "ds004514_phase2_window_metrics",
        "config_path": str(config_path).replace("\\", "/"),
        "subject_quality_policy_path": str(policy_path).replace("\\", "/"),
        "subject_quality_allowed_tier": allowed_tier,
        "runtime_sec": runtime_sec,
        "peak_memory_mb": peak_memory_bytes / (1024 * 1024),
        "subject_count": len(per_subject),
        "train_subject_count": sum(1 for row in per_subject if row["split"] == "train"),
        "eval_subject_count": sum(1 for row in per_subject if row["split"] == "eval"),
        "paired_window_count": int(eeg_event_tensor.shape[0]),
        "quality_pass_window_count": quality_pass_count,
        "eeg_event_tensor_shape": list(eeg_event_tensor.shape),
        "eeg_clean_tensor_shape": list(eeg_clean_tensor.shape),
        "fnirs_tensor_shape": list(fnirs_tensor.shape),
        "canonical_channel_count": len(canonical_channels),
        "canonical_channel_names": canonical_channels,
        "max_subject_rmse_seconds": max(row["rmse_seconds"] for row in per_subject),
        "max_subject_abs_seconds": max(row["max_abs_seconds"] for row in per_subject),
        "per_subject": per_subject,
    }
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    summary_path.write_text(build_summary(metrics=metrics, config_path=config_path), encoding="utf-8")

    print(f"Wrote Phase 2 dataset to {dataset_path}")
    print(f"Wrote Phase 2 metadata to {metadata_path}")
    print(f"Wrote Phase 2 metrics to {metrics_path}")
    print(f"Wrote Phase 2 summary to {summary_path}")
    print(f"Paired windows: {eeg_event_tensor.shape[0]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
