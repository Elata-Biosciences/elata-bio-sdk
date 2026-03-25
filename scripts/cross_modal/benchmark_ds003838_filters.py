#!/usr/bin/env python3
"""Benchmark distortion for the DS003838 cleaned EEG and PPG Phase 2 paths."""

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


def eeg_cleaned_pipeline(data: np.ndarray, source_sfreq: int, target_sfreq: int, notch_freq_hz: float) -> np.ndarray:
    filtered = mne.filter.notch_filter(
        data,
        Fs=float(source_sfreq),
        freqs=[notch_freq_hz],
        method="iir",
        phase="zero",
        verbose="ERROR",
    )
    return resample_only(filtered, source_sfreq=source_sfreq, target_sfreq=target_sfreq)


def ppg_cleaned_pipeline(
    data: np.ndarray,
    *,
    source_sfreq: int,
    target_sfreq: int,
    notch_freq_hz: float,
    l_freq_hz: float,
    h_freq_hz: float,
) -> np.ndarray:
    filtered = mne.filter.notch_filter(
        data,
        Fs=float(source_sfreq),
        freqs=[notch_freq_hz],
        method="iir",
        phase="zero",
        verbose="ERROR",
    )
    filtered = mne.filter.filter_data(
        filtered,
        sfreq=float(source_sfreq),
        l_freq=l_freq_hz,
        h_freq=h_freq_hz,
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


def benchmark_frequency_rows(probe_freqs: list[float], pipeline, *, source_sfreq: int, target_sfreq: int, duration_seconds: float, notch_freq_hz: float) -> list[dict]:
    sample_count = int(round(source_sfreq * duration_seconds))
    times = np.arange(sample_count, dtype=np.float64) / source_sfreq
    rows: list[dict] = []
    for frequency_hz in probe_freqs:
        signal = np.sin(2.0 * np.pi * frequency_hz * times)[np.newaxis, :]
        baseline = resample_only(signal, source_sfreq=source_sfreq, target_sfreq=target_sfreq)[0]
        cleaned = pipeline(signal)[0]
        attenuation_db = 20.0 * math.log10(max(estimate_amplitude(cleaned), 1e-12) / max(estimate_amplitude(baseline), 1e-12))
        group_delay_seconds: float | None
        if abs(frequency_hz - notch_freq_hz) < 1e-9 and attenuation_db <= -20.0:
            group_delay_seconds = None
        else:
            group_delay_seconds = estimate_lag_seconds(baseline, cleaned, sfreq=target_sfreq)
        rows.append(
            {
                "frequency_hz": frequency_hz,
                "group_delay_seconds": group_delay_seconds,
                "attenuation_db_vs_resample_only": attenuation_db,
            }
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark distortion for the DS003838 cleaned EEG and PPG paths.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds003838_phase2_windows.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    metrics_path = Path(config["paths"]["benchmark_metrics"])
    report_path = Path(config["paths"]["benchmark_report"])

    eeg_source_sfreq = 1000
    eeg_target_sfreq = int(round(float(config["window"]["eeg_clean_resample_hz"])))
    eeg_notch = float(config["cleaning"]["eeg"]["notch_freq_hz"])
    eeg_duration = float(config["benchmark"]["eeg_duration_seconds"])
    eeg_probe_freqs = [float(value) for value in config["benchmark"]["eeg_probe_frequencies_hz"]]
    eeg_burst_freq = float(config["benchmark"]["eeg_transient_burst_frequency_hz"])
    eeg_burst_sigma = float(config["benchmark"]["eeg_transient_sigma_seconds"])

    ppg_source_sfreq = 1000
    ppg_target_sfreq = int(round(float(config["window"]["ppg_clean_resample_hz"])))
    ppg_notch = float(config["cleaning"]["ppg"]["notch_freq_hz"])
    ppg_duration = float(config["benchmark"]["ppg_duration_seconds"])
    ppg_probe_freqs = [float(value) for value in config["benchmark"]["ppg_probe_frequencies_hz"]]
    ppg_rise_seconds = float(config["benchmark"]["ppg_pulse_rise_seconds"])
    ppg_decay_seconds = float(config["benchmark"]["ppg_pulse_decay_seconds"])
    repeats = int(config["benchmark"]["compute_repeats"])

    eeg_pipeline = lambda data: eeg_cleaned_pipeline(data, source_sfreq=eeg_source_sfreq, target_sfreq=eeg_target_sfreq, notch_freq_hz=eeg_notch)
    ppg_pipeline = lambda data: ppg_cleaned_pipeline(
        data,
        source_sfreq=ppg_source_sfreq,
        target_sfreq=ppg_target_sfreq,
        notch_freq_hz=ppg_notch,
        l_freq_hz=float(config["cleaning"]["ppg"]["bandpass_low_hz"]),
        h_freq_hz=float(config["cleaning"]["ppg"]["bandpass_high_hz"]),
    )

    eeg_rows = benchmark_frequency_rows(
        eeg_probe_freqs,
        eeg_pipeline,
        source_sfreq=eeg_source_sfreq,
        target_sfreq=eeg_target_sfreq,
        duration_seconds=eeg_duration,
        notch_freq_hz=eeg_notch,
    )
    ppg_rows = benchmark_frequency_rows(
        ppg_probe_freqs,
        ppg_pipeline,
        source_sfreq=ppg_source_sfreq,
        target_sfreq=ppg_target_sfreq,
        duration_seconds=ppg_duration,
        notch_freq_hz=ppg_notch,
    )

    eeg_burst = gaussian_burst(eeg_source_sfreq, eeg_duration, eeg_burst_freq, eeg_burst_sigma)[np.newaxis, :]
    eeg_burst_baseline = resample_only(eeg_burst, source_sfreq=eeg_source_sfreq, target_sfreq=eeg_target_sfreq)[0]
    eeg_burst_clean = eeg_pipeline(eeg_burst)[0]
    eeg_transient_rmse = float(np.sqrt(np.mean((eeg_burst_clean - eeg_burst_baseline) ** 2)))

    ppg_pulse = pulse_template(ppg_source_sfreq, ppg_duration, ppg_rise_seconds, ppg_decay_seconds)[np.newaxis, :]
    ppg_pulse_baseline = resample_only(ppg_pulse, source_sfreq=ppg_source_sfreq, target_sfreq=ppg_target_sfreq)[0]
    ppg_pulse_clean = ppg_pipeline(ppg_pulse)[0]
    ppg_rise_time_error_seconds = rise_time_seconds(ppg_pulse_clean, ppg_target_sfreq) - rise_time_seconds(ppg_pulse_baseline, ppg_target_sfreq)
    ppg_waveform_rmse = float(np.sqrt(np.mean((ppg_pulse_clean - ppg_pulse_baseline) ** 2)))

    eeg_signal = np.random.default_rng(0).standard_normal((63, int(round(eeg_source_sfreq * eeg_duration))))
    eeg_total = 0.0
    for _ in range(repeats):
        start = time.perf_counter()
        _ = eeg_pipeline(eeg_signal)
        eeg_total += time.perf_counter() - start

    ppg_signal = np.random.default_rng(1).standard_normal((1, int(round(ppg_source_sfreq * ppg_duration))))
    ppg_total = 0.0
    for _ in range(repeats):
        start = time.perf_counter()
        _ = ppg_pipeline(ppg_signal)
        ppg_total += time.perf_counter() - start

    metrics = {
        "config_path": str(config_path).replace("\\", "/"),
        "eeg": {
            "cleaned_path": "zero_phase_iir_notch_60hz_plus_resample_1000_to_256",
            "frequency_rows": eeg_rows,
            "transient_burst_frequency_hz": eeg_burst_freq,
            "transient_rmse_vs_resample_only": eeg_transient_rmse,
            "average_cpu_ms_per_63_channel_window": (eeg_total / repeats) * 1000.0,
        },
        "ppg": {
            "cleaned_path": "zero_phase_iir_notch_60hz_plus_bandpass_0p5_20hz_plus_resample_1000_to_128",
            "frequency_rows": ppg_rows,
            "pulse_rise_time_error_seconds_vs_resample_only": ppg_rise_time_error_seconds,
            "pulse_waveform_rmse_vs_resample_only": ppg_waveform_rmse,
            "average_cpu_ms_per_window": (ppg_total / repeats) * 1000.0,
        },
    }

    lines = [
        "# DS003838 Phase 2 Filter Benchmark",
        "",
        f"- Config: `{str(config_path).replace(chr(92), '/')}`",
        "",
        "## EEG cleaned path",
        "",
        f"- Path: `{metrics['eeg']['cleaned_path']}`",
        "",
    ]
    for row in eeg_rows:
        group_delay_label = "n/a" if row["group_delay_seconds"] is None else f"{row['group_delay_seconds']:.6f}s"
        lines.append(
            f"- {row['frequency_hz']:.1f} Hz: group_delay={group_delay_label}, attenuation={row['attenuation_db_vs_resample_only']:.3f} dB"
        )
    lines.extend(
        [
            f"- EEG burst RMSE vs resample-only: `{eeg_transient_rmse:.6f}`",
            f"- EEG average CPU ms per 63-channel window: `{metrics['eeg']['average_cpu_ms_per_63_channel_window']:.3f}`",
            "",
            "## PPG cleaned path",
            "",
            f"- Path: `{metrics['ppg']['cleaned_path']}`",
            "",
        ]
    )
    for row in ppg_rows:
        group_delay_label = "n/a" if row["group_delay_seconds"] is None else f"{row['group_delay_seconds']:.6f}s"
        lines.append(
            f"- {row['frequency_hz']:.1f} Hz: group_delay={group_delay_label}, attenuation={row['attenuation_db_vs_resample_only']:.3f} dB"
        )
    lines.extend(
        [
            f"- PPG pulse rise-time error vs resample-only: `{ppg_rise_time_error_seconds:.6f}s`",
            f"- PPG pulse waveform RMSE vs resample-only: `{ppg_waveform_rmse:.6f}`",
            f"- PPG average CPU ms per window: `{metrics['ppg']['average_cpu_ms_per_window']:.3f}`",
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
