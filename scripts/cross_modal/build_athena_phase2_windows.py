#!/usr/bin/env python3
"""Build a transport-level Athena Phase 2 smoke artifact from standardized session exports."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import sys
import time
import tomllib
import tracemalloc

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from manifest_contract import normalize_dataset_path  # noqa: E402
from ppg_targets import detect_ppg_peaks, rising_edge_slope_max  # noqa: E402

import numpy as np  # noqa: E402


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def iter_subjects(config: dict) -> list[str]:
    train = list(config["subjects"]["train"])
    eval_subjects = list(config["subjects"]["eval"])
    return train + [subject for subject in eval_subjects if subject not in train]


def split_for_subject(config: dict, subject_id: str) -> str:
    return "eval" if subject_id in set(config["subjects"]["eval"]) else "train"


def read_timeseries_csv(path: Path) -> tuple[np.ndarray, np.ndarray, list[str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = list(reader.fieldnames or [])
        if not fieldnames or fieldnames[0] != "timestamp":
            raise ValueError(f"{path} must start with a `timestamp` column.")
        channel_names = fieldnames[1:]
        timestamps: list[float] = []
        rows: list[list[float]] = []
        for row in reader:
            timestamps.append(float(row["timestamp"]))
            rows.append([float(row[name]) for name in channel_names])
    if not timestamps:
        raise ValueError(f"{path} does not contain any rows.")
    values = np.asarray(rows, dtype=np.float32).T
    return np.asarray(timestamps, dtype=np.float64), values, channel_names


def max_timestamp_step_jitter_seconds(timestamps: np.ndarray) -> float:
    if timestamps.size < 3:
        return 0.0
    deltas = np.diff(timestamps)
    median_delta = float(np.median(deltas))
    return float(np.max(np.abs(deltas - median_delta)))


def estimated_sampling_rate_hz(timestamps: np.ndarray) -> float | None:
    if timestamps.size < 2:
        return None
    median_delta = float(np.median(np.diff(timestamps)))
    if median_delta <= 0.0:
        return None
    return 1.0 / median_delta


def shared_overlap(streams: list[np.ndarray]) -> tuple[float, float]:
    start = max(float(stream[0]) for stream in streams)
    stop = min(float(stream[-1]) for stream in streams)
    if stop <= start:
        raise ValueError(f"Shared overlap is not positive: start={start:.6f}, stop={stop:.6f}")
    return start, stop


def interpolation_grid(start: float, stop: float, target_samples: int) -> np.ndarray:
    if target_samples <= 1:
        return np.asarray([start], dtype=np.float64)
    return np.linspace(start, stop, num=target_samples, dtype=np.float64)


def interpolate_rows(
    timestamps: np.ndarray,
    values: np.ndarray,
    *,
    start: float,
    stop: float,
    target_samples: int,
) -> np.ndarray:
    target_grid = interpolation_grid(start, stop, target_samples)
    out = np.empty((values.shape[0], target_samples), dtype=np.float32)
    for row_index in range(values.shape[0]):
        out[row_index] = np.interp(target_grid, timestamps, values[row_index]).astype(np.float32)
    return out


def moving_average_rows(values: np.ndarray, width: int) -> np.ndarray:
    if width <= 1:
        return values.astype(np.float32, copy=True)
    kernel = np.ones(width, dtype=np.float32) / float(width)
    out = np.empty_like(values, dtype=np.float32)
    for row_index in range(values.shape[0]):
        out[row_index] = np.convolve(values[row_index], kernel, mode="same").astype(np.float32)
    return out


def moving_average_signal(values: np.ndarray, width: int) -> np.ndarray:
    if width <= 1:
        return values.astype(np.float32, copy=True)
    kernel = np.ones(width, dtype=np.float32) / float(width)
    return np.convolve(values, kernel, mode="same").astype(np.float32)


def feature_dim_or_zero(block: dict) -> int:
    value = block.get("feature_dim")
    return 0 if value is None else int(value)


def normalize_rows(values: np.ndarray) -> np.ndarray:
    centered = values - np.mean(values, axis=1, keepdims=True)
    return centered.astype(np.float32)


def normalize_signal(values: np.ndarray) -> np.ndarray:
    return (values - float(np.mean(values))).astype(np.float32)


def window_quality_flags(
    *,
    record: dict,
    overlap_duration_seconds: float,
    max_step_jitter_seconds: float,
    eeg_event: np.ndarray,
    eeg_clean: np.ndarray,
    optics: np.ndarray,
    ppg_native: np.ndarray,
    ppg_clean: np.ndarray,
    peak_count: int,
    quality_config: dict,
) -> tuple[dict, float]:
    ppg_std = float(np.std(ppg_clean))
    fnirs_block = record["modalities"]["fnirs"]
    ppg_block = record["modalities"]["ppg"]
    flags = {
        "shared_clock_ok": record.get("timestamp_source") == str(quality_config["expected_timestamp_source"]),
        "shared_overlap_ok": overlap_duration_seconds >= float(quality_config["min_overlap_seconds"]),
        "timestamp_jitter_ok": max_step_jitter_seconds <= float(quality_config["max_timestamp_step_jitter_seconds"]),
        "eeg_event_has_nan": bool(np.isnan(eeg_event).any()),
        "eeg_clean_has_nan": bool(np.isnan(eeg_clean).any()),
        "optics_has_nan": bool(np.isnan(optics).any()),
        "ppg_native_has_nan": bool(np.isnan(ppg_native).any()),
        "ppg_clean_has_nan": bool(np.isnan(ppg_clean).any()),
        "ppg_clean_std_ok": ppg_std >= float(quality_config["ppg_clean_min_std"]),
        "ppg_peak_count_ok": bool(
            peak_count >= int(quality_config["ppg_min_peak_count"])
            and peak_count <= int(quality_config["ppg_max_peak_count"])
        ),
        "fnirs_processing_confirmed": fnirs_block.get("processing_status") == "confirmed_internal_pipeline",
        "ppg_mapping_confirmed": ppg_block.get("mapping_status") == "confirmed_internal_mapping",
    }
    score = 1.0
    if not flags["shared_overlap_ok"]:
        score -= 0.35
    if not flags["timestamp_jitter_ok"]:
        score -= 0.2
    if not flags["ppg_clean_std_ok"]:
        score -= 0.2
    if not flags["ppg_peak_count_ok"]:
        score -= 0.25
    if (
        flags["eeg_event_has_nan"]
        or flags["eeg_clean_has_nan"]
        or flags["optics_has_nan"]
        or flags["ppg_native_has_nan"]
        or flags["ppg_clean_has_nan"]
    ):
        score = 0.0
    flags["window_quality_pass"] = bool(
        flags["shared_clock_ok"]
        and flags["shared_overlap_ok"]
        and flags["timestamp_jitter_ok"]
        and flags["ppg_clean_std_ok"]
        and flags["ppg_peak_count_ok"]
        and not flags["eeg_event_has_nan"]
        and not flags["eeg_clean_has_nan"]
        and not flags["optics_has_nan"]
        and not flags["ppg_native_has_nan"]
        and not flags["ppg_clean_has_nan"]
    )
    return flags, max(0.0, score)


def build_summary(metrics: dict, config_path: Path) -> str:
    lines = [
        "# Athena Phase 2 Windowing Smoke Summary",
        "",
        f"Config: `{normalize_dataset_path(config_path)}`",
        "",
        "## Overview",
        "",
        f"- sessions processed: {metrics['session_count']}",
        f"- train subjects: {metrics['train_subject_count']}",
        f"- eval subjects: {metrics['eval_subject_count']}",
        f"- paired windows: {metrics['paired_window_count']}",
        f"- quality-pass windows: {metrics['quality_pass_window_count']}",
        f"- inherited Athena Phase 1 blockers: {metrics['prepare_blocker_count']}",
        f"- eeg event tensor shape: {metrics['eeg_event_tensor_shape']}",
        f"- eeg clean tensor shape: {metrics['eeg_clean_tensor_shape']}",
        f"- optics transport tensor shape: {metrics['optics_tensor_shape']}",
        f"- ppg native tensor shape: {metrics['ppg_native_tensor_shape']}",
        f"- ppg clean tensor shape: {metrics['ppg_clean_tensor_shape']}",
        f"- minimum shared overlap (s): {metrics['min_shared_overlap_seconds']:.6f}",
        f"- maximum timestamp-step jitter (s): {metrics['max_timestamp_step_jitter_seconds']:.6f}",
        f"- mean PPG peak count per window: {metrics['mean_ppg_peak_count']:.3f}",
        "",
        "## Notes",
        "",
        "- This is a transport-level Athena smoke artifact built from the standardized session-export contract, not a canonical Athena fNIRS/HbO/HbR dataset.",
        "- The optics branch is intentionally preserved as `optics_transport_windows` because the internal fNIRS processing path is still unconfirmed.",
        "- The fixture now contains short synthetic captures so the repo can exercise timestamp alignment, tensor shaping, and QC logic before real internal recordings are mounted.",
        "- This artifact is suitable for Athena Phase 2 contract validation and lightweight encoder smoke work, but not for claims about held-out physiology.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Athena Phase 2 transport-level smoke windows.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/athena_phase2_fixture.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    if config["builder"]["pipeline"] != "athena_internal_phase2_smoke":
        raise SystemExit(f"Unsupported pipeline: {config['builder']['pipeline']}")

    prepare_metrics_path = Path(config["inputs"]["prepare_metrics"])
    prepare_manifest_path = Path(config["inputs"]["prepare_manifest"])
    prepare_metrics = load_json(prepare_metrics_path)
    _ = load_json(prepare_manifest_path)

    selected_subjects = iter_subjects(config)
    sessions = [
        record for record in prepare_metrics["sessions"] if record["subject_id"] in set(selected_subjects)
    ]
    if not sessions:
        raise SystemExit("No Athena sessions matched the configured subjects.")

    dataset_path = Path(config["paths"]["dataset"])
    metadata_path = Path(config["paths"]["metadata"])
    metrics_path = Path(config["paths"]["metrics"])
    summary_path = Path(config["paths"]["summary"])

    eeg_event_windows: list[np.ndarray] = []
    eeg_clean_windows: list[np.ndarray] = []
    optics_windows: list[np.ndarray] = []
    ppg_native_windows: list[np.ndarray] = []
    ppg_clean_windows: list[np.ndarray] = []
    metadata_windows: list[dict] = []
    per_session: list[dict] = []

    tracemalloc.start()
    start_time = time.perf_counter()

    for record in sessions:
        split = split_for_subject(config, record["subject_id"])
        eeg_block = record["modalities"]["eeg"]
        fnirs_block = record["modalities"]["fnirs"]
        ppg_block = record["modalities"]["ppg"]

        eeg_timestamps, eeg_values, eeg_channel_names = read_timeseries_csv(Path(eeg_block["path"]))
        optics_timestamps, optics_values, optics_channel_names = read_timeseries_csv(Path(fnirs_block["path"]))
        ppg_timestamps, ppg_values, ppg_channel_names = read_timeseries_csv(Path(ppg_block["path"]))

        if eeg_values.shape[0] != feature_dim_or_zero(eeg_block):
            raise ValueError(f"Unexpected EEG feature_dim for {record['session_id']}: {eeg_values.shape[0]}")
        if optics_values.shape[0] != feature_dim_or_zero(fnirs_block):
            raise ValueError(f"Unexpected optics feature_dim for {record['session_id']}: {optics_values.shape[0]}")
        if ppg_values.shape[0] != feature_dim_or_zero(ppg_block):
            raise ValueError(f"Unexpected PPG feature_dim for {record['session_id']}: {ppg_values.shape[0]}")

        overlap_start, overlap_stop = shared_overlap([eeg_timestamps, optics_timestamps, ppg_timestamps])
        overlap_duration_seconds = overlap_stop - overlap_start
        max_step_jitter_seconds = max(
            max_timestamp_step_jitter_seconds(eeg_timestamps),
            max_timestamp_step_jitter_seconds(optics_timestamps),
            max_timestamp_step_jitter_seconds(ppg_timestamps),
        )

        eeg_event = interpolate_rows(
            eeg_timestamps,
            eeg_values,
            start=overlap_start,
            stop=overlap_stop,
            target_samples=int(config["window"]["eeg_event_target_samples"]),
        )
        eeg_clean = interpolate_rows(
            eeg_timestamps,
            moving_average_rows(normalize_rows(eeg_values), width=int(config["cleaning"]["eeg"]["moving_average_width"])),
            start=overlap_start,
            stop=overlap_stop,
            target_samples=int(config["window"]["eeg_clean_target_samples"]),
        )
        optics = interpolate_rows(
            optics_timestamps,
            optics_values,
            start=overlap_start,
            stop=overlap_stop,
            target_samples=int(config["window"]["optics_target_samples"]),
        )
        ppg_native = interpolate_rows(
            ppg_timestamps,
            ppg_values,
            start=overlap_start,
            stop=overlap_stop,
            target_samples=int(config["window"]["ppg_native_target_samples"]),
        )[0]
        ppg_clean_source = moving_average_signal(
            normalize_signal(ppg_values[0]),
            width=int(config["cleaning"]["ppg"]["moving_average_width"]),
        )[np.newaxis, :]
        ppg_clean = interpolate_rows(
            ppg_timestamps,
            ppg_clean_source,
            start=overlap_start,
            stop=overlap_stop,
            target_samples=int(config["window"]["ppg_clean_target_samples"]),
        )[0]
        ppg_clean_rate_hz = int(config["window"]["ppg_clean_target_samples"]) / overlap_duration_seconds
        peaks = detect_ppg_peaks(
            ppg_clean,
            sfreq=ppg_clean_rate_hz,
            min_distance_seconds=float(config["quality"]["ppg_peak_min_distance_seconds"]),
            threshold_std=float(config["quality"]["ppg_peak_threshold_std"]),
        )

        quality_flags, quality_score = window_quality_flags(
            record=record,
            overlap_duration_seconds=overlap_duration_seconds,
            max_step_jitter_seconds=max_step_jitter_seconds,
            eeg_event=eeg_event,
            eeg_clean=eeg_clean,
            optics=optics,
            ppg_native=ppg_native,
            ppg_clean=ppg_clean,
            peak_count=len(peaks),
            quality_config=config["quality"],
        )

        eeg_event_windows.append(eeg_event.astype(np.float32))
        eeg_clean_windows.append(eeg_clean.astype(np.float32))
        optics_windows.append(optics.astype(np.float32))
        ppg_native_windows.append(ppg_native.astype(np.float32))
        ppg_clean_windows.append(ppg_clean.astype(np.float32))

        metadata_windows.append(
            {
                "subject_id": record["subject_id"],
                "session_id": record["session_id"],
                "split": split,
                "protocol": record["protocol"],
                "task_label": record["task_label"],
                "source_dataset": config["dataset"]["dataset_id"],
                "window_anchor": config["window"]["anchor"],
                "phase2_mode": "athena_transport_smoke_only",
                "timestamp_source": record["timestamp_source"],
                "start_time_utc": record.get("start_time_utc"),
                "shift_metadata": record.get("shift_metadata", {}),
                "alignment_reference": "shared_overlap_timestamp_grid",
                "preprocessing_branch": "eeg_event_interp__eeg_clean_centered_smooth_interp__optics_transport_interp__ppg_native_interp__ppg_clean_centered_smooth_interp",
                "shared_overlap_start_seconds": overlap_start,
                "shared_overlap_end_seconds": overlap_stop,
                "shared_overlap_duration_seconds": overlap_duration_seconds,
                "eeg_channel_names": eeg_channel_names,
                "optics_channel_names": optics_channel_names,
                "ppg_channel_names": ppg_channel_names,
                "eeg_declared_sfreq_hz": eeg_block.get("sampling_rate_hz"),
                "eeg_estimated_sfreq_hz": estimated_sampling_rate_hz(eeg_timestamps),
                "optics_declared_sfreq_hz": fnirs_block.get("sampling_rate_hz"),
                "optics_estimated_sfreq_hz": estimated_sampling_rate_hz(optics_timestamps),
                "ppg_declared_sfreq_hz": ppg_block.get("sampling_rate_hz"),
                "ppg_estimated_sfreq_hz": estimated_sampling_rate_hz(ppg_timestamps),
                "fnirs_transport_signal": fnirs_block.get("transport_signal", "unknown"),
                "fnirs_processing_status": fnirs_block.get("processing_status", "unknown"),
                "ppg_mapping_status": ppg_block.get("mapping_status", "unknown"),
                "ppg_peak_count": len(peaks),
                "ppg_clean_std": float(np.std(ppg_clean)),
                "ppg_rising_edge_slope_max": rising_edge_slope_max(ppg_clean, sfreq=ppg_clean_rate_hz),
                "quality_flags": quality_flags,
                "quality_score": quality_score,
            }
        )
        per_session.append(
            {
                "subject_id": record["subject_id"],
                "session_id": record["session_id"],
                "split": split,
                "protocol": record["protocol"],
                "task_label": record["task_label"],
                "shared_overlap_seconds": overlap_duration_seconds,
                "max_timestamp_step_jitter_seconds": max_step_jitter_seconds,
                "ppg_peak_count": len(peaks),
                "ppg_clean_std": float(np.std(ppg_clean)),
                "window_quality_pass": quality_flags["window_quality_pass"],
            }
        )

    runtime_sec = time.perf_counter() - start_time
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    eeg_event_tensor = np.stack(eeg_event_windows, axis=0)
    eeg_clean_tensor = np.stack(eeg_clean_windows, axis=0)
    optics_tensor = np.stack(optics_windows, axis=0)
    ppg_native_tensor = np.stack(ppg_native_windows, axis=0)
    ppg_clean_tensor = np.stack(ppg_clean_windows, axis=0)

    for path in [dataset_path, metadata_path, metrics_path, summary_path]:
        ensure_parent(path)

    np.savez_compressed(
        dataset_path,
        eeg_event_windows=eeg_event_tensor,
        eeg_clean_windows=eeg_clean_tensor,
        optics_transport_windows=optics_tensor,
        ppg_native_windows=ppg_native_tensor,
        ppg_clean_windows=ppg_clean_tensor,
    )
    metadata_path.write_text(json.dumps({"windows": metadata_windows}, indent=2), encoding="utf-8")

    quality_pass_count = sum(1 for row in metadata_windows if row["quality_flags"]["window_quality_pass"])
    metrics = {
        "kind": "athena_internal_phase2_smoke_metrics",
        "config_path": normalize_dataset_path(config_path),
        "prepare_metrics_path": normalize_dataset_path(prepare_metrics_path),
        "prepare_manifest_path": normalize_dataset_path(prepare_manifest_path),
        "runtime_sec": runtime_sec,
        "peak_memory_mb": peak_memory_bytes / (1024 * 1024),
        "subject_count": len(sorted({row["subject_id"] for row in metadata_windows})),
        "session_count": len(per_session),
        "train_subject_count": len({row["subject_id"] for row in metadata_windows if row["split"] == "train"}),
        "eval_subject_count": len({row["subject_id"] for row in metadata_windows if row["split"] == "eval"}),
        "paired_window_count": int(eeg_event_tensor.shape[0]),
        "quality_pass_window_count": quality_pass_count,
        "prepare_blocker_count": len(prepare_metrics.get("blockers", [])),
        "eeg_event_tensor_shape": list(eeg_event_tensor.shape),
        "eeg_clean_tensor_shape": list(eeg_clean_tensor.shape),
        "optics_tensor_shape": list(optics_tensor.shape),
        "ppg_native_tensor_shape": list(ppg_native_tensor.shape),
        "ppg_clean_tensor_shape": list(ppg_clean_tensor.shape),
        "min_shared_overlap_seconds": min(row["shared_overlap_seconds"] for row in per_session),
        "max_timestamp_step_jitter_seconds": max(row["max_timestamp_step_jitter_seconds"] for row in per_session),
        "mean_ppg_peak_count": float(np.mean([row["ppg_peak_count"] for row in per_session])) if per_session else 0.0,
        "per_session": per_session,
    }
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    summary_path.write_text(build_summary(metrics=metrics, config_path=config_path), encoding="utf-8")

    print(f"Wrote Athena Phase 2 dataset to {dataset_path}")
    print(f"Wrote Athena Phase 2 metadata to {metadata_path}")
    print(f"Wrote Athena Phase 2 metrics to {metrics_path}")
    print(f"Wrote Athena Phase 2 summary to {summary_path}")
    print(f"Paired windows: {eeg_event_tensor.shape[0]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
