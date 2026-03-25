#!/usr/bin/env python3
"""Build a pilot Phase 2 paired EEG-PPG window dataset from DS003838."""

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

from eeglab_hdf5 import channel_index_map, open_set_file, read_scalar, read_time_slice  # noqa: E402

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


def matched_events(
    eeg_events: list[dict[str, str]],
    ecg_events: list[dict[str, str]],
    *,
    exclude_trial_types: set[str],
    max_events_per_subject: int,
) -> tuple[list[dict], dict]:
    if len(eeg_events) != len(ecg_events):
        raise ValueError(f"Mismatched event row counts: EEG={len(eeg_events)} ECG={len(ecg_events)}")

    matched_rows: list[dict] = []
    residuals: list[float] = []
    for index, (eeg_row, ecg_row) in enumerate(zip(eeg_events, ecg_events)):
        if eeg_row["trial_type"] != ecg_row["trial_type"] or eeg_row["value"] != ecg_row["value"]:
            raise ValueError(f"Event mismatch at row {index}: EEG={eeg_row['trial_type']} ECG={ecg_row['trial_type']}")
        residual = float(ecg_row["onset"]) - float(eeg_row["onset"])
        residuals.append(residual)
        if eeg_row["trial_type"] in exclude_trial_types:
            continue
        matched_rows.append(
            {
                "event_index": index,
                "trial_type": eeg_row["trial_type"],
                "event_value": eeg_row["value"],
                "stim_file": eeg_row.get("stim_file", "n/a"),
                "eeg_onset_seconds": float(eeg_row["onset"]),
                "ecg_onset_seconds": float(ecg_row["onset"]),
                "alignment_residual_seconds": residual,
            }
        )

    sampled = sample_events(matched_rows, max_events=max_events_per_subject)
    rmse = math.sqrt(sum(value * value for value in residuals) / max(len(residuals), 1))
    max_abs = max(abs(value) for value in residuals) if residuals else 0.0
    return sampled, {
        "rmse_seconds": rmse,
        "max_abs_seconds": max_abs,
    }


def extract_window(data_file, onset_seconds: float, tmin: float, tmax: float, channel_indices: list[int]) -> np.ndarray:
    sfreq = read_scalar(data_file, "srate")
    start = int(round((onset_seconds + tmin) * sfreq))
    sample_count = int(round((tmax - tmin) * sfreq))
    stop = start + sample_count
    return read_time_slice(data_file, start_sample=start, stop_sample=stop, channel_indices=channel_indices)


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


def detect_ppg_peaks(signal: np.ndarray, sfreq: float, min_distance_seconds: float, threshold_std: float) -> list[int]:
    centered = signal - float(np.median(signal))
    scale = float(np.std(centered))
    if scale <= 1e-9:
        return []
    threshold = threshold_std * scale
    candidates = np.where(
        (centered[1:-1] > centered[:-2])
        & (centered[1:-1] >= centered[2:])
        & (centered[1:-1] >= threshold)
    )[0] + 1
    min_distance = max(1, int(round(min_distance_seconds * sfreq)))
    selected: list[int] = []
    for candidate in candidates.tolist():
        if not selected or (candidate - selected[-1]) >= min_distance:
            selected.append(candidate)
            continue
        if centered[candidate] > centered[selected[-1]]:
            selected[-1] = candidate
    return selected


def clipped_fraction(signal: np.ndarray) -> float:
    lo = float(np.min(signal))
    hi = float(np.max(signal))
    span = hi - lo
    if span <= 1e-9:
        return 1.0
    tolerance = span * 1e-4
    clipped = (np.abs(signal - lo) <= tolerance) | (np.abs(signal - hi) <= tolerance)
    return float(np.mean(clipped))


def rising_edge_slope_max(signal: np.ndarray, sfreq: float) -> float:
    if signal.size < 2:
        return 0.0
    return float(np.max(np.diff(signal)) * sfreq)


def window_quality_flags(
    *,
    eeg_event: np.ndarray,
    eeg_clean: np.ndarray,
    ppg_native: np.ndarray,
    ppg_clean: np.ndarray,
    alignment: dict,
    residual_seconds: float,
    peak_count: int,
    clip_fraction: float,
    quality_config: dict,
) -> tuple[dict, float]:
    ppg_std = float(np.std(ppg_clean))
    flags = {
        "alignment_rmse_ok": bool(alignment["rmse_seconds"] <= float(quality_config["max_alignment_rmse_seconds"])),
        "alignment_residual_ok": bool(abs(residual_seconds) <= float(quality_config["max_alignment_abs_seconds"])),
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
    if not flags["alignment_residual_ok"]:
        score -= 0.2
    if not flags["ppg_peak_count_ok"]:
        score -= 0.3
    if not flags["ppg_std_ok"]:
        score -= 0.3
    if not flags["ppg_clip_ok"]:
        score -= 0.2
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
    lines = [
        "# DS003838 Phase 2 Windowing Summary",
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
        f"- ppg native tensor shape: {metrics['ppg_native_tensor_shape']}",
        f"- ppg clean tensor shape: {metrics['ppg_clean_tensor_shape']}",
        f"- max alignment abs residual (s): {metrics['max_subject_abs_seconds']:.6f}",
        f"- mean PPG peak count per window: {metrics['mean_ppg_peak_count']:.3f}",
        "",
        "## Notes",
        "",
        "- This pilot Phase 2 artifact uses matched DS003838 task-memory EEG and cardiovascular event tables.",
        "- The PPG target is extracted from the cardiovascular container rather than a dedicated BIDS ppg/ subtree.",
        "- The raw/native PPG view stays at 1000 Hz to preserve morphology; the cleaned PPG view is a separate mild denoising branch.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build pilot Phase 2 paired EEG-PPG windows from DS003838.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds003838_phase2_windows.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    if config["builder"]["pipeline"] != "ds003838_eeg_ppg_phase2":
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
    eeg_channel_count = int(config["window"]["eeg_channel_count"])
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
        eeg_events = read_tsv(subject_root / "eeg" / f"{subject_id}_task-{task}_events.tsv")
        ecg_events = read_tsv(subject_root / "ecg" / f"{subject_id}_task-{task}_events.tsv")
        matched, alignment = matched_events(
            eeg_events=eeg_events,
            ecg_events=ecg_events,
            exclude_trial_types=exclude_trial_types,
            max_events_per_subject=max_events_per_subject,
        )

        with open_set_file(subject_root / "eeg" / f"{subject_id}_task-{task}_eeg.set") as eeg_file:
            with open_set_file(subject_root / "ecg" / f"{subject_id}_task-{task}_ecg.set") as ecg_file:
                eeg_sfreq = read_scalar(eeg_file, "srate")
                ecg_sfreq = read_scalar(ecg_file, "srate")
                eeg_channel_indices = list(range(eeg_channel_count))
                ppg_index = channel_index_map(ecg_file)[ppg_channel_name]
                peak_counts: list[int] = []
                quality_pass_count = 0

                for matched_event in matched:
                    eeg_event = extract_window(
                        eeg_file,
                        onset_seconds=matched_event["eeg_onset_seconds"],
                        tmin=eeg_event_tmin,
                        tmax=eeg_event_tmax,
                        channel_indices=eeg_channel_indices,
                    )
                    eeg_clean = clean_eeg_window(
                        eeg_event,
                        source_sfreq=eeg_sfreq,
                        target_sfreq=eeg_clean_resample_hz,
                        notch_freq_hz=float(config["cleaning"]["eeg"]["notch_freq_hz"]),
                    )
                    ppg_native = extract_window(
                        ecg_file,
                        onset_seconds=matched_event["ecg_onset_seconds"],
                        tmin=ppg_native_tmin,
                        tmax=ppg_native_tmax,
                        channel_indices=[ppg_index],
                    )[0]
                    ppg_clean = clean_ppg_window(
                        ppg_native,
                        source_sfreq=ecg_sfreq,
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
                        alignment=alignment,
                        residual_seconds=matched_event["alignment_residual_seconds"],
                        peak_count=len(peaks),
                        clip_fraction=clip_fraction,
                        quality_config=quality_config,
                    )
                    quality_pass_count += int(quality_flags["window_quality_pass"])

                    eeg_event_windows.append(eeg_event)
                    eeg_clean_windows.append(eeg_clean)
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
                            "eye": participant["eye"],
                            "source_dataset": config["dataset"]["dataset_id"],
                            "run_id": f"task-{task}",
                            "event_index": matched_event["event_index"],
                            "trial_type": matched_event["trial_type"],
                            "event_value": matched_event["event_value"],
                            "stim_file": matched_event["stim_file"],
                            "alignment_reference": "matched_event_tables_direct",
                            "preprocessing_branch": "eeg_event_native__eeg_clean_zero_phase_notch_resample__ppg_native__ppg_clean_zero_phase_notch_bandpass_resample",
                            "window_anchor": config["window"]["anchor"],
                            "eeg_event_window_start_seconds": matched_event["eeg_onset_seconds"] + eeg_event_tmin,
                            "eeg_event_window_end_seconds": matched_event["eeg_onset_seconds"] + eeg_event_tmax,
                            "ppg_window_start_seconds": matched_event["ecg_onset_seconds"] + ppg_native_tmin,
                            "ppg_window_end_seconds": matched_event["ecg_onset_seconds"] + ppg_native_tmax,
                            "eeg_event_native_sfreq_hz": eeg_sfreq,
                            "eeg_clean_sfreq_hz": eeg_clean_resample_hz,
                            "ppg_native_sfreq_hz": ecg_sfreq,
                            "ppg_clean_sfreq_hz": ppg_clean_resample_hz,
                            "alignment_residual_seconds": matched_event["alignment_residual_seconds"],
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
                        "paired_window_count": len(matched),
                        "quality_pass_window_count": quality_pass_count,
                        "rmse_seconds": alignment["rmse_seconds"],
                        "max_abs_seconds": alignment["max_abs_seconds"],
                        "mean_ppg_peak_count": float(np.mean(peak_counts)) if peak_counts else 0.0,
                    }
                )

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
        "kind": "ds003838_phase2_window_metrics",
        "config_path": str(config_path).replace("\\", "/"),
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
