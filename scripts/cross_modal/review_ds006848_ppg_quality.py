#!/usr/bin/env python3
"""Review morphology-grade raw PPG quality on a representative DS006848 verbalwm subset."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import time
import tomllib
import tracemalloc

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from build_ds006848_phase2_windows import (  # noqa: E402
    clean_ppg_window,
    clipped_fraction,
    extract_window,
    iter_subjects,
    read_tsv,
    sample_events,
)
from ppg_targets import derive_ppg_window_targets, detect_ppg_peaks  # noqa: E402

import mne  # noqa: E402
import numpy as np  # noqa: E402


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def current_tier_map(policy: dict) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for tier_name, subjects in policy["tiers"].items():
        for subject_id in subjects:
            mapping[subject_id] = tier_name
    return mapping


def descending_rank(values: list[float]) -> list[int]:
    order = sorted(range(len(values)), key=lambda idx: values[idx], reverse=True)
    ranks = [0] * len(values)
    for rank, index in enumerate(order, start=1):
        ranks[index] = rank
    return ranks


def quartile_thresholds(values: list[float]) -> tuple[float, float]:
    array = np.asarray(values, dtype=np.float64)
    return float(np.quantile(array, 0.25)), float(np.quantile(array, 0.75))


def build_report(metrics: dict, config_path: Path) -> str:
    top_subjects = metrics["top_subjects"]
    bottom_subjects = metrics["bottom_subjects"]
    lines = [
        "# DS006848 PPG Quality Review",
        "",
        f"Config: `{str(config_path).replace(chr(92), '/')}`",
        "",
        "## Overview",
        "",
        f"- subjects reviewed: {metrics['subject_count']}",
        f"- sampled windows: {metrics['sampled_window_count_total']}",
        f"- quality-pass windows: {metrics['quality_pass_window_count_total']}",
        f"- dominant-beat-valid windows: {metrics['dominant_beat_valid_window_count_total']}",
        f"- notch-valid windows: {metrics['notch_valid_window_count_total']}",
        "",
        "## Highest composite-quality subjects",
        "",
    ]
    for row in top_subjects:
        lines.append(
            f"- {row['subject_id']}: current_tier={row['current_policy_tier']}, quality_pass_rate={row['quality_pass_rate']:.3f}, dominant_beat_valid_rate={row['dominant_beat_valid_rate']:.3f}, median_clean_std={row['median_ppg_clean_std']:.6f}, median_amplitude_range={row['median_amplitude_range']:.6f}"
        )
    lines.extend(
        [
            "",
            "## Lowest composite-quality subjects",
            "",
        ]
    )
    for row in bottom_subjects:
        concern_text = ", ".join(row["concern_flags"]) if row["concern_flags"] else "none"
        lines.append(
            f"- {row['subject_id']}: current_tier={row['current_policy_tier']}, quality_pass_rate={row['quality_pass_rate']:.3f}, dominant_beat_valid_rate={row['dominant_beat_valid_rate']:.3f}, median_clean_std={row['median_ppg_clean_std']:.6f}, median_amplitude_range={row['median_amplitude_range']:.6f}, concerns={concern_text}"
        )
    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- This review uses task-verbalwm only, because that task spans the full 30-subject DS006848 cohort.",
            "- The subset intentionally mixes already-reviewed subjects with pending-review subjects to guide future cohort promotion decisions.",
            "- The metrics here describe waveform and morphology quality only; they do not replace the broader model-failure analysis.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Review DS006848 verbalwm PPG waveform quality on a broader subset.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_ppg_quality_review.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    if config["review"]["pipeline"] != "ds006848_ppg_quality_review":
        raise SystemExit(f"Unsupported pipeline: {config['review']['pipeline']}")

    dataset_root = Path(config["paths"]["dataset_root"])
    metrics_path = Path(config["paths"]["metrics"])
    report_path = Path(config["paths"]["report"])
    task = config["window"]["task"]
    subjects = iter_subjects(config)
    participants = {row["participant_id"]: row for row in read_tsv(dataset_root / "participants.tsv")}
    policy = json.loads(Path("configs/cross_modal/ds006848_subject_quality_policy.json").read_text(encoding="utf-8"))
    tier_map = current_tier_map(policy)

    ppg_native_tmin = float(config["window"]["ppg_native_tmin_seconds"])
    ppg_native_tmax = float(config["window"]["ppg_native_tmax_seconds"])
    ppg_clean_resample_hz = float(config["window"]["ppg_clean_resample_hz"])
    max_events_per_subject = int(config["window"]["max_events_per_subject"])
    exclude_trial_types = set(config["window"]["exclude_trial_types"])
    ppg_channel_name = config["window"]["ppg_channel_name"]

    tracemalloc.start()
    start = time.perf_counter()

    subject_rows: list[dict] = []
    sampled_window_total = 0
    quality_pass_total = 0
    dominant_valid_total = 0
    notch_valid_total = 0

    for subject_id in subjects:
        subject_root = dataset_root / subject_id
        channels = read_tsv(subject_root / "eeg" / f"{subject_id}_task-{task}_channels.tsv")
        if ppg_channel_name not in {row["name"] for row in channels}:
            raise ValueError(f"Missing PPG channel {ppg_channel_name} for {subject_id}.")
        events = read_tsv(subject_root / "eeg" / f"{subject_id}_task-{task}_events.tsv")
        raw = mne.io.read_raw_brainvision(
            subject_root / "eeg" / f"{subject_id}_task-{task}_eeg.vhdr",
            preload=False,
            verbose="ERROR",
        )
        sfreq = float(raw.info["sfreq"])
        ppg_native_start_offset = int(round(ppg_native_tmin * sfreq))
        ppg_native_sample_count = int(round((ppg_native_tmax - ppg_native_tmin) * sfreq))

        valid_events: list[dict] = []
        for index, row in enumerate(events):
            trial_type = row["trial_type"]
            if trial_type in exclude_trial_types:
                continue
            event_sample = int(float(row["sample"]))
            ppg_start = event_sample + ppg_native_start_offset
            ppg_stop = ppg_start + ppg_native_sample_count
            if ppg_start < 0 or ppg_stop > raw.n_times:
                continue
            valid_events.append(
                {
                    "event_index": index,
                    "trial_type": trial_type,
                    "event_sample": event_sample,
                }
            )
        selected_events = sample_events(valid_events, max_events=max_events_per_subject)

        peak_counts: list[int] = []
        clip_fractions: list[float] = []
        clean_stds: list[float] = []
        amplitude_ranges: list[float] = []
        rising_slopes: list[float] = []
        dominant_valid_count = 0
        notch_valid_count = 0
        quality_pass_count = 0

        for event in selected_events:
            ppg_start = event["event_sample"] + ppg_native_start_offset
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
            targets = derive_ppg_window_targets(
                ppg_clean,
                sfreq=ppg_clean_resample_hz,
                min_peak_distance_seconds=float(config["quality"]["ppg_peak_min_distance_seconds"]),
                peak_threshold_std=float(config["quality"]["ppg_peak_threshold_std"]),
                dominant_beat_min_rise_seconds=float(config["targets"]["dominant_beat_min_rise_seconds"]),
                dominant_beat_max_rise_seconds=float(config["targets"]["dominant_beat_max_rise_seconds"]),
                dominant_beat_min_width_seconds=float(config["targets"]["dominant_beat_min_width_seconds"]),
                dominant_beat_max_width_seconds=float(config["targets"]["dominant_beat_max_width_seconds"]),
                notch_min_delay_seconds=float(config["targets"]["notch_min_delay_seconds"]),
                notch_max_delay_seconds=float(config["targets"]["notch_max_delay_seconds"]),
                notch_min_rebound_fraction=float(config["targets"]["notch_min_rebound_fraction"]),
            )
            clip_fraction = clipped_fraction(ppg_native)
            clean_std = float(np.std(ppg_clean))
            peak_count = len(peaks)
            quality_pass = (
                peak_count >= int(config["quality"]["ppg_min_peak_count"])
                and peak_count <= int(config["quality"]["ppg_max_peak_count"])
                and clean_std >= float(config["quality"]["ppg_clean_min_std"])
                and clip_fraction <= float(config["quality"]["ppg_max_clip_fraction"])
            )

            peak_counts.append(peak_count)
            clip_fractions.append(clip_fraction)
            clean_stds.append(clean_std)
            amplitude_ranges.append(float(targets["amplitude_range"]))
            rising_slopes.append(float(targets["rising_edge_slope_max"]))
            dominant_valid_count += int(bool(targets["dominant_beat_valid"]))
            notch_valid_count += int(bool(targets["dominant_beat_notch_valid"]))
            quality_pass_count += int(quality_pass)

        raw.close()

        sampled_window_count = len(selected_events)
        sampled_window_total += sampled_window_count
        quality_pass_total += quality_pass_count
        dominant_valid_total += dominant_valid_count
        notch_valid_total += notch_valid_count

        subject_rows.append(
            {
                "subject_id": subject_id,
                "current_policy_tier": tier_map.get(subject_id, "unclassified"),
                "rs_excluded": participants[subject_id]["RS_excluded"],
                "candidate_event_count": len(valid_events),
                "sampled_window_count": sampled_window_count,
                "quality_pass_window_count": quality_pass_count,
                "quality_pass_rate": 0.0 if sampled_window_count == 0 else (quality_pass_count / sampled_window_count),
                "dominant_beat_valid_window_count": dominant_valid_count,
                "dominant_beat_valid_rate": 0.0 if sampled_window_count == 0 else (dominant_valid_count / sampled_window_count),
                "notch_valid_window_count": notch_valid_count,
                "notch_valid_rate": 0.0 if sampled_window_count == 0 else (notch_valid_count / sampled_window_count),
                "mean_ppg_peak_count": float(np.mean(peak_counts)) if peak_counts else 0.0,
                "median_ppg_clean_std": float(np.median(clean_stds)) if clean_stds else 0.0,
                "mean_ppg_clip_fraction": float(np.mean(clip_fractions)) if clip_fractions else 0.0,
                "median_amplitude_range": float(np.median(amplitude_ranges)) if amplitude_ranges else 0.0,
                "median_rising_edge_slope_max": float(np.median(rising_slopes)) if rising_slopes else 0.0,
            }
        )

    clean_std_q1, _ = quartile_thresholds([row["median_ppg_clean_std"] for row in subject_rows])
    amplitude_q1, _ = quartile_thresholds([row["median_amplitude_range"] for row in subject_rows])
    pass_rate_ranks = descending_rank([row["quality_pass_rate"] for row in subject_rows])
    dominant_rate_ranks = descending_rank([row["dominant_beat_valid_rate"] for row in subject_rows])
    clean_std_ranks = descending_rank([row["median_ppg_clean_std"] for row in subject_rows])
    amplitude_ranks = descending_rank([row["median_amplitude_range"] for row in subject_rows])

    for index, row in enumerate(subject_rows):
        composite_rank_score = float(
            np.mean(
                [
                    pass_rate_ranks[index],
                    dominant_rate_ranks[index],
                    clean_std_ranks[index],
                    amplitude_ranks[index],
                ]
            )
        )
        concern_flags: list[str] = []
        if row["quality_pass_rate"] < 0.9:
            concern_flags.append("quality_pass_rate_lt_0p90")
        if row["dominant_beat_valid_rate"] < 0.9:
            concern_flags.append("dominant_beat_valid_rate_lt_0p90")
        if row["median_ppg_clean_std"] <= clean_std_q1:
            concern_flags.append("median_ppg_clean_std_bottom_quartile")
        if row["median_amplitude_range"] <= amplitude_q1:
            concern_flags.append("median_amplitude_range_bottom_quartile")
        row["composite_quality_rank_score"] = composite_rank_score
        row["concern_flags"] = concern_flags

    subject_rows.sort(key=lambda row: (row["composite_quality_rank_score"], row["subject_id"]))

    runtime_sec = time.perf_counter() - start
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    metrics = {
        "kind": "ds006848_ppg_quality_review_metrics",
        "config_path": str(config_path).replace("\\", "/"),
        "task": task,
        "subject_count": len(subject_rows),
        "sampled_window_count_total": sampled_window_total,
        "quality_pass_window_count_total": quality_pass_total,
        "dominant_beat_valid_window_count_total": dominant_valid_total,
        "notch_valid_window_count_total": notch_valid_total,
        "clean_std_bottom_quartile_threshold": clean_std_q1,
        "amplitude_range_bottom_quartile_threshold": amplitude_q1,
        "top_subjects": subject_rows[:4],
        "bottom_subjects": subject_rows[-4:],
        "subjects": subject_rows,
        "runtime_sec": runtime_sec,
        "peak_memory_mb": peak_memory_bytes / (1024 * 1024),
    }

    for path in [metrics_path, report_path]:
        ensure_parent(path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    report_path.write_text(build_report(metrics=metrics, config_path=config_path), encoding="utf-8")

    print(f"Wrote PPG quality metrics to {metrics_path}")
    print(f"Wrote PPG quality report to {report_path}")
    print(f"Reviewed subjects: {len(subject_rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
