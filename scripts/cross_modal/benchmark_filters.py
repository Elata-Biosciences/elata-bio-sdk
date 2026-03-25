#!/usr/bin/env python3
"""Benchmark distortion for the current DS004514 cleaned EEG path."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import time
import tomllib

import mne
import numpy as np


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def resample_only(data: np.ndarray, source_sfreq: int, target_sfreq: int) -> np.ndarray:
    common_divisor = math.gcd(source_sfreq, target_sfreq)
    return mne.filter.resample(
        data,
        up=target_sfreq // common_divisor,
        down=source_sfreq // common_divisor,
        axis=-1,
        verbose="ERROR",
    )


def cleaned_pipeline(data: np.ndarray, source_sfreq: int, target_sfreq: int, notch_freq_hz: float) -> np.ndarray:
    filtered = mne.filter.notch_filter(
        data,
        Fs=float(source_sfreq),
        freqs=[notch_freq_hz],
        method="iir",
        phase="zero",
        verbose="ERROR",
    )
    return resample_only(filtered, source_sfreq=source_sfreq, target_sfreq=target_sfreq)


def estimate_amplitude(signal: np.ndarray) -> float:
    centered = signal - np.mean(signal)
    return float(np.sqrt(np.mean(centered**2)))


def estimate_lag_seconds(reference: np.ndarray, candidate: np.ndarray, sfreq: int) -> float:
    ref = reference - np.mean(reference)
    cand = candidate - np.mean(candidate)
    corr = np.correlate(cand, ref, mode="full")
    lag_samples = int(np.argmax(corr) - (len(ref) - 1))
    return lag_samples / sfreq


def gaussian_burst(sfreq: int, duration_seconds: float, frequency_hz: float, sigma_seconds: float) -> np.ndarray:
    times = np.arange(int(round(sfreq * duration_seconds)), dtype=np.float64) / sfreq
    center = duration_seconds / 2.0
    envelope = np.exp(-0.5 * ((times - center) / sigma_seconds) ** 2)
    return envelope * np.sin(2.0 * np.pi * frequency_hz * times)


def pulse_template(sfreq: int, duration_seconds: float, rise_seconds: float, decay_seconds: float) -> np.ndarray:
    times = np.arange(int(round(sfreq * duration_seconds)), dtype=np.float64) / sfreq
    pulse = np.zeros_like(times)
    rise_mask = times <= rise_seconds
    pulse[rise_mask] = times[rise_mask] / max(rise_seconds, 1e-9)
    decay_mask = ~rise_mask
    pulse[decay_mask] = np.exp(-(times[decay_mask] - rise_seconds) / max(decay_seconds, 1e-9))
    return pulse


def rise_time_seconds(signal: np.ndarray, sfreq: int) -> float:
    peak = float(np.max(signal))
    if peak <= 1e-9:
        return 0.0
    lo = 0.1 * peak
    hi = 0.9 * peak
    lo_idx = int(np.argmax(signal >= lo))
    hi_idx = int(np.argmax(signal >= hi))
    return max(0.0, (hi_idx - lo_idx) / sfreq)


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark distortion for the DS004514 cleaned EEG path.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds004514_phase2_windows.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    source_sfreq = 2048
    target_sfreq = int(round(float(config["window"]["eeg_clean_resample_hz"])))
    notch_freq_hz = float(config["cleaning"]["eeg"]["notch_freq_hz"])
    duration_seconds = float(config["benchmark"]["duration_seconds"])
    probe_freqs = [float(value) for value in config["benchmark"]["probe_frequencies_hz"]]
    burst_freq_hz = float(config["benchmark"]["transient_burst_frequency_hz"])
    sigma_seconds = float(config["benchmark"]["transient_sigma_seconds"])
    rise_seconds = float(config["benchmark"]["pulse_rise_seconds"])
    decay_seconds = float(config["benchmark"]["pulse_decay_seconds"])
    repeats = int(config["benchmark"]["compute_repeats"])
    metrics_path = Path(config["paths"]["benchmark_metrics"])
    report_path = Path(config["paths"]["benchmark_report"])

    sample_count = int(round(source_sfreq * duration_seconds))
    times = np.arange(sample_count, dtype=np.float64) / source_sfreq

    frequency_rows: list[dict] = []
    for frequency_hz in probe_freqs:
        signal = np.sin(2.0 * np.pi * frequency_hz * times)[np.newaxis, :]
        baseline = resample_only(signal, source_sfreq=source_sfreq, target_sfreq=target_sfreq)[0]
        cleaned = cleaned_pipeline(signal, source_sfreq=source_sfreq, target_sfreq=target_sfreq, notch_freq_hz=notch_freq_hz)[0]
        attenuation_db = 20.0 * math.log10(max(estimate_amplitude(cleaned), 1e-12) / max(estimate_amplitude(baseline), 1e-12))
        group_delay_seconds: float | None
        if abs(frequency_hz - notch_freq_hz) < 1e-9 and attenuation_db <= -20.0:
            group_delay_seconds = None
        else:
            group_delay_seconds = estimate_lag_seconds(baseline, cleaned, sfreq=target_sfreq)
        frequency_rows.append(
            {
                "frequency_hz": frequency_hz,
                "group_delay_seconds": group_delay_seconds,
                "attenuation_db_vs_resample_only": attenuation_db,
            }
        )

    burst = gaussian_burst(source_sfreq, duration_seconds, burst_freq_hz, sigma_seconds)[np.newaxis, :]
    burst_baseline = resample_only(burst, source_sfreq=source_sfreq, target_sfreq=target_sfreq)[0]
    burst_clean = cleaned_pipeline(burst, source_sfreq=source_sfreq, target_sfreq=target_sfreq, notch_freq_hz=notch_freq_hz)[0]
    transient_rmse = float(np.sqrt(np.mean((burst_clean - burst_baseline) ** 2)))

    pulse = pulse_template(source_sfreq, duration_seconds, rise_seconds, decay_seconds)[np.newaxis, :]
    pulse_baseline = resample_only(pulse, source_sfreq=source_sfreq, target_sfreq=target_sfreq)[0]
    pulse_clean = cleaned_pipeline(pulse, source_sfreq=source_sfreq, target_sfreq=target_sfreq, notch_freq_hz=notch_freq_hz)[0]
    rise_time_error_seconds = rise_time_seconds(pulse_clean, target_sfreq) - rise_time_seconds(pulse_baseline, target_sfreq)
    waveform_rmse = float(np.sqrt(np.mean((pulse_clean - pulse_baseline) ** 2)))

    benchmark_signal = np.random.default_rng(0).standard_normal((64, sample_count))
    notch_total = 0.0
    resample_total = 0.0
    combined_total = 0.0
    for _ in range(repeats):
        start = time.perf_counter()
        filtered = mne.filter.notch_filter(
            benchmark_signal,
            Fs=float(source_sfreq),
            freqs=[notch_freq_hz],
            method="iir",
            phase="zero",
            verbose="ERROR",
        )
        notch_total += time.perf_counter() - start

        start = time.perf_counter()
        _ = resample_only(benchmark_signal, source_sfreq=source_sfreq, target_sfreq=target_sfreq)
        resample_total += time.perf_counter() - start

        start = time.perf_counter()
        _ = resample_only(filtered, source_sfreq=source_sfreq, target_sfreq=target_sfreq)
        combined_total += time.perf_counter() - start

    metrics = {
        "config_path": str(config_path).replace("\\", "/"),
        "cleaned_path": "zero_phase_iir_notch_60hz_plus_resample_2048_to_256",
        "frequency_rows": frequency_rows,
        "transient_burst_frequency_hz": burst_freq_hz,
        "transient_rmse_vs_resample_only": transient_rmse,
        "pulse_rise_time_error_seconds_vs_resample_only": rise_time_error_seconds,
        "pulse_waveform_rmse_vs_resample_only": waveform_rmse,
        "average_notch_cpu_ms_per_window": (notch_total / repeats) * 1000.0,
        "average_resample_cpu_ms_per_window": (resample_total / repeats) * 1000.0,
        "average_combined_cpu_ms_per_window": ((notch_total + combined_total) / repeats) * 1000.0,
    }

    lines = [
        "# DS004514 Phase 2 Filter Benchmark",
        "",
        f"- Config: `{str(config_path).replace(chr(92), '/')}`",
        f"- Cleaned path: `{metrics['cleaned_path']}`",
        "",
        "## Frequency probes",
        "",
    ]
    for row in frequency_rows:
        group_delay_label = "n/a" if row["group_delay_seconds"] is None else f"{row['group_delay_seconds']:.6f}s"
        lines.append(
            "- "
            f"{row['frequency_hz']:.1f} Hz: "
            f"group_delay={group_delay_label}, "
            f"attenuation={row['attenuation_db_vs_resample_only']:.3f} dB"
        )
    lines.extend(
        [
            "",
            "## Transients",
            "",
            f"- Burst RMSE vs resample-only: `{transient_rmse:.6f}`",
            f"- Pulse rise-time error vs resample-only: `{rise_time_error_seconds:.6f}s`",
            f"- Pulse waveform RMSE vs resample-only: `{waveform_rmse:.6f}`",
            "",
            "## Compute",
            "",
            f"- Average notch CPU ms per 64-channel window: `{metrics['average_notch_cpu_ms_per_window']:.3f}`",
            f"- Average resample CPU ms per 64-channel window: `{metrics['average_resample_cpu_ms_per_window']:.3f}`",
            f"- Average combined CPU ms per 64-channel window: `{metrics['average_combined_cpu_ms_per_window']:.3f}`",
            "",
        ]
    )

    for path in [metrics_path, report_path]:
        ensure_parent(path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    report_path.write_text("\n".join(lines), encoding="utf-8")

    print(f"Wrote filter benchmark metrics to {metrics_path}")
    print(f"Wrote filter benchmark report to {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
