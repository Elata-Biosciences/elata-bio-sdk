#!/usr/bin/env python3
"""Build a Phase 2 paired EEG-PPG window dataset from DS006848."""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
import sys
import time
import tomllib
import tracemalloc

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from ppg_targets import detect_ppg_peaks, rising_edge_slope_max  # noqa: E402

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


def sample_events(rows: list[dict], max_events: int) -> list[dict]:
    if max_events <= 0 or len(rows) <= max_events:
        return rows
    positions = np.linspace(0, len(rows) - 1, num=max_events, dtype=int)
    return [rows[index] for index in sorted(set(int(value) for value in positions))]


def trial_family(trial_type: str) -> str:
    if trial_type.startswith("Encoding_"):
        return "encoding"
    if trial_type.startswith("Retention_"):
        return "retention"
    if trial_type.startswith("Digits_Retrieval"):
        return "retrieval"
    if trial_type.startswith("Baseline_"):
        return "baseline"
    if trial_type.startswith("Eyes_"):
        return "rest_state"
    if "Cartoon" in trial_type:
        return "rest_cartoon"
    if trial_type.startswith("Rest"):
        return "rest"
    return "other"


def extract_window(raw: mne.io.BaseRaw, *, channel_names: list[str], start_sample: int, sample_count: int) -> np.ndarray:
    return raw.get_data(picks=channel_names, start=start_sample, stop=start_sample + sample_count)


def resample_rows(data: np.ndarray, source_sfreq: float, target_sfreq: float) -> np.ndarray:
    source = int(round(source_sfreq))
    target = int(round(target_sfreq))
    common_divisor = math.gcd(source, target)
    return mne.filter.resample(
        data.astype(np.float64, copy=False),
        up=target // common_divisor,
        down=source // common_divisor,
        axis=-1,
        verbose="ERROR",
    ).astype(np.float32)


def clean_eeg_window(data: np.ndarray, source_sfreq: float, target_sfreq: float, notch_freq_hz: float) -> np.ndarray:
    filtered = mne.filter.notch_filter(
        data.astype(np.float64, copy=False),
        Fs=source_sfreq,
        freqs=[notch_freq_hz],
        method="iir",
        phase="zero",
        verbose="ERROR",
    )
    return resample_rows(filtered, source_sfreq=source_sfreq, target_sfreq=target_sfreq)


def clean_ppg_window(
    signal: np.ndarray,
    *,
    source_sfreq: float,
    target_sfreq: float,
    notch_freq_hz: float,
    l_freq_hz: float,
    h_freq_hz: float,
) -> np.ndarray:
    filtered = mne.filter.notch_filter(
        signal[np.newaxis, :].astype(np.float64, copy=False),
        Fs=source_sfreq,
        freqs=[notch_freq_hz],
        method="iir",
        phase="zero",
        verbose="ERROR",
    )
    filtered = mne.filter.filter_data(
        filtered,
        sfreq=source_sfreq,
        l_freq=l_freq_hz,
        h_freq=h_freq_hz,
        method="iir",
        phase="zero",
        verbose="ERROR",
    )
    return resample_rows(filtered, source_sfreq=source_sfreq, target_sfreq=target_sfreq)[0]


def clipped_fraction(signal: np.ndarray) -> float:
    lo = float(np.min(signal))
    hi = float(np.max(signal))
    span = hi - lo
    if span <= 1e-9:
        return 1.0
    tolerance = span * 1e-4
    clipped = (np.abs(signal - lo) <= tolerance) | (np.abs(signal - hi) <= tolerance)
    return float(np.mean(clipped))


def window_quality_flags(
    *,
    eeg_event: np.ndarray,
    eeg_clean: np.ndarray,
    ppg_native: np.ndarray,
    ppg_clean: np.ndarray,
    peak_count: int,
    clip_fraction: float,
    quality_config: dict,
) -> tuple[dict, float]:
    ppg_std = float(np.std(ppg_clean))
    flags = {
        "alignment_rmse_ok": True,
        "alignment_residual_ok": True,
        "eeg_event_has_nan": bool(np.isnan(eeg_event).any()),
        "eeg_clean_has_nan": bool(np.isnan(eeg_clean).any()),
        "ppg_native_has_nan": bool(np.isnan(ppg_native).any()),
        "ppg_clean_has_nan": bool(np.isnan(ppg_clean).any()),
        "ppg_peak_count_ok": bool(
            peak_count >= int(quality_config["ppg_min_peak_count"]) and peak_count <= int(quality_config["ppg_max_peak_count"])
        ),
        "ppg_std_ok": bool(ppg_std >= float(quality_config["ppg_clean_min_std"])),
        "ppg_clip_ok": bool(clip_fraction <= float(quality_config["ppg_max_clip_fraction"])),
    }
    score = 1.0
    if not flags["ppg_peak_count_ok"]:
        score -= 0.4
    if not flags["ppg_std_ok"]:
        score -= 0.3
    if not flags["ppg_clip_ok"]:
        score -= 0.3
    if flags["eeg_event_has_nan"] or flags["eeg_clean_has_nan"] or flags["ppg_native_has_nan"] or flags["ppg_clean_has_nan"]:
        score = 0.0
    flags["window_quality_pass"] = bool(
        flags["alignment_rmse_ok"]
        and flags["alignment_residual_ok"]
        and flags["ppg_peak_count_ok"]
        and flags["ppg_std_ok"]
        and flags["ppg_clip_ok"]
        and not flags["eeg_event_has_nan"]
        and not flags["eeg_clean_has_nan"]
        and not flags["ppg_native_has_nan"]
        and not flags["ppg_clean_has_nan"]
    )
    return flags, max(0.0, score)


def build_summary(metrics: dict, config_path: Path) -> str:
    task = metrics["task"]
    lines = [
        "# DS006848 Phase 2 Windowing Summary",
        "",
        f"Config: `{str(config_path).replace(chr(92), '/')}`",
        "",
        "## Overview",
        "",
        f"- subjects processed: {metrics['subject_count']}",
        f"- train subjects: {metrics['train_subject_count']}",
        f"- eval subjects: {metrics['eval_subject_count']}",
        f"- task: `{task}`",
        f"- paired windows: {metrics['paired_window_count']}",
        f"- quality-pass windows: {metrics['quality_pass_window_count']}",
        f"- eeg event tensor shape: {metrics['eeg_event_tensor_shape']}",
        f"- eeg clean tensor shape: {metrics['eeg_clean_tensor_shape']}",
        f"- ppg native tensor shape: {metrics['ppg_native_tensor_shape']}",
        f"- ppg clean tensor shape: {metrics['ppg_clean_tensor_shape']}",
        f"- mean PPG peak count per window: {metrics['mean_ppg_peak_count']:.3f}",
        "",
        "## Notes",
        "",
        f"- This Phase 2 artifact uses DS006848 task-{task} BrainVision recordings.",
        "- EEG, PPG, and ECG come from the same task file, so alignment residual is zero by construction for this path.",
        "- The raw/native PPG view stays at 1000 Hz to preserve morphology; the cleaned PPG view is a separate mild denoising branch.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Phase 2 paired EEG-PPG windows from DS006848.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_phase2_windows.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    if config["builder"]["pipeline"] != "ds006848_eeg_ppg_phase2":
        raise SystemExit(f"Unsupported pipeline: {config['builder']['pipeline']}")

    dataset_root = Path(config["paths"]["dataset_root"])
    dataset_path = Path(config["paths"]["dataset"])
    metadata_path = Path(config["paths"]["metadata"])
    metrics_path = Path(config["paths"]["metrics"])
    summary_path = Path(config["paths"]["summary"])
    subjects = iter_subjects(config)
    task = config["window"]["task"]
    eeg_event_tmin = float(config["window"]["eeg_event_tmin_seconds"])
    eeg_event_tmax = float(config["window"]["eeg_event_tmax_seconds"])
    ppg_native_tmin = float(config["window"]["ppg_native_tmin_seconds"])
    ppg_native_tmax = float(config["window"]["ppg_native_tmax_seconds"])
    eeg_clean_resample_hz = float(config["window"]["eeg_clean_resample_hz"])
    ppg_clean_resample_hz = float(config["window"]["ppg_clean_resample_hz"])
    max_events_per_subject = int(config["window"]["max_events_per_subject"])
    exclude_trial_types = set(config["window"]["exclude_trial_types"])
    ppg_channel_name = config["window"]["ppg_channel_name"]
    participants = {row["participant_id"]: row for row in read_tsv(dataset_root / "participants.tsv")}
    quality_config = config["quality"]

    eeg_event_windows: list[np.ndarray] = []
    eeg_clean_windows: list[np.ndarray] = []
    ppg_native_windows: list[np.ndarray] = []
    ppg_clean_windows: list[np.ndarray] = []
    metadata_windows: list[dict] = []
    per_subject: list[dict] = []

    tracemalloc.start()
    start = time.perf_counter()

    for subject_id in subjects:
        subject_root = dataset_root / subject_id
        split = split_for_subject(config, subject_id)
        participant = participants[subject_id]
        channels = read_tsv(subject_root / "eeg" / f"{subject_id}_task-{task}_channels.tsv")
        eeg_channel_names = [row["name"] for row in channels if row["type"] == "EEG"]
        if ppg_channel_name not in {row["name"] for row in channels}:
            raise ValueError(f"Missing PPG channel {ppg_channel_name} for {subject_id}.")
        events = read_tsv(subject_root / "eeg" / f"{subject_id}_task-{task}_events.tsv")
        raw = mne.io.read_raw_brainvision(
            subject_root / "eeg" / f"{subject_id}_task-{task}_eeg.vhdr",
            preload=False,
            verbose="ERROR",
        )
        sfreq = float(raw.info["sfreq"])
        eeg_event_start_offset = int(round(eeg_event_tmin * sfreq))
        eeg_event_sample_count = int(round((eeg_event_tmax - eeg_event_tmin) * sfreq))
        ppg_native_start_offset = int(round(ppg_native_tmin * sfreq))
        ppg_native_sample_count = int(round((ppg_native_tmax - ppg_native_tmin) * sfreq))

        valid_events: list[dict] = []
        for index, row in enumerate(events):
            trial_type = row["trial_type"]
            if trial_type in exclude_trial_types:
                continue
            event_sample = int(float(row["sample"]))
            eeg_start = event_sample + eeg_event_start_offset
            ppg_start = event_sample + ppg_native_start_offset
            eeg_stop = eeg_start + eeg_event_sample_count
            ppg_stop = ppg_start + ppg_native_sample_count
            if eeg_start < 0 or ppg_start < 0:
                continue
            if eeg_stop > raw.n_times or ppg_stop > raw.n_times:
                continue
            valid_events.append(
                {
                    "event_index": index,
                    "trial_type": trial_type,
                    "event_value": row["value"],
                    "onset_seconds": float(row["onset"]),
                    "event_sample": event_sample,
                }
            )
        selected_events = sample_events(valid_events, max_events=max_events_per_subject)
        peak_counts: list[int] = []
        quality_pass_count = 0

        for event in selected_events:
            eeg_start = event["event_sample"] + eeg_event_start_offset
            ppg_start = event["event_sample"] + ppg_native_start_offset
            eeg_event = extract_window(raw, channel_names=eeg_channel_names, start_sample=eeg_start, sample_count=eeg_event_sample_count)
            eeg_clean = clean_eeg_window(
                eeg_event,
                source_sfreq=sfreq,
                target_sfreq=eeg_clean_resample_hz,
                notch_freq_hz=float(config["cleaning"]["eeg"]["notch_freq_hz"]),
            )
            ppg_native = extract_window(raw, channel_names=[ppg_channel_name], start_sample=ppg_start, sample_count=ppg_native_sample_count)[0]
            ppg_clean = clean_ppg_window(
                ppg_native,
                source_sfreq=sfreq,
                target_sfreq=ppg_clean_resample_hz,
                notch_freq_hz=float(config["cleaning"]["ppg"]["notch_freq_hz"]),
                l_freq_hz=float(config["cleaning"]["ppg"]["bandpass_low_hz"]),
                h_freq_hz=float(config["cleaning"]["ppg"]["bandpass_high_hz"]),
            )
            peaks = detect_ppg_peaks(
                ppg_clean,
                sfreq=ppg_clean_resample_hz,
                min_distance_seconds=float(config["quality"]["ppg_peak_min_distance_seconds"]),
                threshold_std=float(config["quality"]["ppg_peak_threshold_std"]),
            )
            peak_counts.append(len(peaks))
            clip_fraction = clipped_fraction(ppg_native)
            quality_flags, quality_score = window_quality_flags(
                eeg_event=eeg_event,
                eeg_clean=eeg_clean,
                ppg_native=ppg_native,
                ppg_clean=ppg_clean,
                peak_count=len(peaks),
                clip_fraction=clip_fraction,
                quality_config=quality_config,
            )
            quality_pass_count += int(quality_flags["window_quality_pass"])

            eeg_event_windows.append(eeg_event.astype(np.float32))
            eeg_clean_windows.append(eeg_clean.astype(np.float32))
            ppg_native_windows.append(ppg_native.astype(np.float32))
            ppg_clean_windows.append(ppg_clean.astype(np.float32))
            metadata_windows.append(
                {
                    "subject_id": subject_id,
                    "split": split,
                    "task": task,
                    "age": int(participant["age"]),
                    "sex": participant["sex"],
                    "hand": participant["hand"],
                    "rs_excluded": participant["RS_excluded"],
                    "behavior_excluded": participant["behavior_excluded"],
                    "source_dataset": config["dataset"]["dataset_id"],
                    "run_id": f"task-{task}",
                    "event_index": event["event_index"],
                    "trial_type": event["trial_type"],
                    "trial_family": trial_family(event["trial_type"]),
                    "event_value": event["event_value"],
                    "alignment_reference": "shared_brainvision_file_sample_column",
                    "preprocessing_branch": "eeg_event_native__eeg_clean_zero_phase_notch_resample__ppg_native__ppg_clean_zero_phase_notch_bandpass_resample",
                    "window_anchor": config["window"]["anchor"],
                    "eeg_event_window_start_seconds": event["onset_seconds"] + eeg_event_tmin,
                    "eeg_event_window_end_seconds": event["onset_seconds"] + eeg_event_tmax,
                    "ppg_window_start_seconds": event["onset_seconds"] + ppg_native_tmin,
                    "ppg_window_end_seconds": event["onset_seconds"] + ppg_native_tmax,
                    "eeg_event_native_sfreq_hz": sfreq,
                    "eeg_clean_sfreq_hz": eeg_clean_resample_hz,
                    "ppg_native_sfreq_hz": sfreq,
                    "ppg_clean_sfreq_hz": ppg_clean_resample_hz,
                    "alignment_residual_seconds": 0.0,
                    "ppg_peak_count": len(peaks),
                    "ppg_clip_fraction": clip_fraction,
                    "ppg_clean_std": float(np.std(ppg_clean)),
                    "ppg_rising_edge_slope_max": rising_edge_slope_max(ppg_clean, sfreq=ppg_clean_resample_hz),
                    "quality_flags": quality_flags,
                    "quality_score": quality_score,
                }
            )

        per_subject.append(
            {
                "subject_id": subject_id,
                "split": split,
                "candidate_event_count": len(valid_events),
                "paired_window_count": len(selected_events),
                "quality_pass_window_count": quality_pass_count,
                "rmse_seconds": 0.0,
                "max_abs_seconds": 0.0,
                "mean_ppg_peak_count": float(np.mean(peak_counts)) if peak_counts else 0.0,
            }
        )
        raw.close()

    runtime_sec = time.perf_counter() - start
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    eeg_event_tensor = np.stack(eeg_event_windows, axis=0)
    eeg_clean_tensor = np.stack(eeg_clean_windows, axis=0)
    ppg_native_tensor = np.stack(ppg_native_windows, axis=0)
    ppg_clean_tensor = np.stack(ppg_clean_windows, axis=0)

    for path in [dataset_path, metadata_path, metrics_path, summary_path]:
        ensure_parent(path)
    np.savez_compressed(
        dataset_path,
        eeg_event_windows=eeg_event_tensor,
        eeg_clean_windows=eeg_clean_tensor,
        ppg_native_windows=ppg_native_tensor,
        ppg_clean_windows=ppg_clean_tensor,
    )
    metadata_path.write_text(json.dumps({"windows": metadata_windows}, indent=2), encoding="utf-8")

    quality_pass_count = sum(1 for row in metadata_windows if row["quality_flags"]["window_quality_pass"])
    metrics = {
        "kind": "ds006848_phase2_window_metrics",
        "config_path": str(config_path).replace("\\", "/"),
        "task": task,
        "runtime_sec": runtime_sec,
        "peak_memory_mb": peak_memory_bytes / (1024 * 1024),
        "subject_count": len(per_subject),
        "train_subject_count": sum(1 for row in per_subject if row["split"] == "train"),
        "eval_subject_count": sum(1 for row in per_subject if row["split"] == "eval"),
        "paired_window_count": int(eeg_event_tensor.shape[0]),
        "quality_pass_window_count": quality_pass_count,
        "eeg_event_tensor_shape": list(eeg_event_tensor.shape),
        "eeg_clean_tensor_shape": list(eeg_clean_tensor.shape),
        "ppg_native_tensor_shape": list(ppg_native_tensor.shape),
        "ppg_clean_tensor_shape": list(ppg_clean_tensor.shape),
        "max_subject_rmse_seconds": max(row["rmse_seconds"] for row in per_subject),
        "max_subject_abs_seconds": max(row["max_abs_seconds"] for row in per_subject),
        "mean_ppg_peak_count": float(np.mean([row["ppg_peak_count"] for row in metadata_windows])) if metadata_windows else 0.0,
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
