#!/usr/bin/env python3
"""Shared PPG target derivation helpers for cross-modal experiments."""

from __future__ import annotations

from typing import Any

import numpy as np


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


def rising_edge_slope_max(signal: np.ndarray, sfreq: float) -> float:
    if signal.size < 2:
        return 0.0
    return float(np.max(np.diff(signal)) * sfreq)


def amplitude_range(signal: np.ndarray, lo_percentile: float = 5.0, hi_percentile: float = 95.0) -> float:
    return float(np.percentile(signal, hi_percentile) - np.percentile(signal, lo_percentile))


def _argmin_index(signal: np.ndarray, start: int, stop: int) -> int | None:
    if stop <= start:
        return None
    segment = signal[start:stop]
    if segment.size == 0:
        return None
    return start + int(np.argmin(segment))


def _detect_notch_index(
    signal: np.ndarray,
    *,
    peak_index: int,
    right_trough_index: int,
    sfreq: float,
    min_delay_seconds: float,
    max_delay_seconds: float,
    min_rebound_fraction: float,
) -> int | None:
    derivative = np.diff(signal)
    search_start = peak_index + max(2, int(round(min_delay_seconds * sfreq)))
    search_stop = min(
        right_trough_index - 2,
        peak_index + int(round(max_delay_seconds * sfreq)),
    )
    if search_stop <= search_start:
        return None
    for index in range(search_start, search_stop + 1):
        if derivative[index - 1] < 0.0 <= derivative[index]:
            valley_value = float(signal[index])
            peak_value = float(signal[peak_index])
            drop = peak_value - valley_value
            if drop <= 0.0:
                continue
            rebound_stop = min(right_trough_index, index + int(round(0.2 * sfreq)))
            if rebound_stop <= index + 1:
                continue
            rebound = float(np.max(signal[index:rebound_stop])) - valley_value
            if rebound >= (min_rebound_fraction * drop):
                return index
    return None


def derive_ppg_window_targets(
    signal: np.ndarray,
    *,
    sfreq: float,
    min_peak_distance_seconds: float,
    peak_threshold_std: float,
    dominant_beat_min_rise_seconds: float,
    dominant_beat_max_rise_seconds: float,
    dominant_beat_min_width_seconds: float,
    dominant_beat_max_width_seconds: float,
    notch_min_delay_seconds: float,
    notch_max_delay_seconds: float,
    notch_min_rebound_fraction: float,
) -> dict[str, Any]:
    peaks = detect_ppg_peaks(
        signal,
        sfreq=sfreq,
        min_distance_seconds=min_peak_distance_seconds,
        threshold_std=peak_threshold_std,
    )
    window_duration_seconds = signal.size / sfreq
    if len(peaks) >= 2:
        mean_ibi_seconds = float(np.mean(np.diff(peaks)) / sfreq)
    else:
        mean_ibi_seconds = window_duration_seconds

    result: dict[str, Any] = {
        "ppg_peak_count": len(peaks),
        "mean_ibi_seconds": mean_ibi_seconds,
        "amplitude_range": amplitude_range(signal),
        "rising_edge_slope_max": rising_edge_slope_max(signal, sfreq=sfreq),
        "dominant_beat_amplitude": 0.0,
        "dominant_beat_rise_time_seconds": 0.0,
        "dominant_beat_width_seconds": 0.0,
        "dominant_beat_fall_time_seconds": 0.0,
        "dominant_beat_peak_time_seconds": 0.0,
        "dominant_beat_notch_delay_seconds": 0.0,
        "dominant_beat_valid": False,
        "dominant_beat_notch_valid": False,
    }

    best_beat: dict[str, float | int] | None = None
    for peak_position, peak_index in enumerate(peaks):
        previous_peak = peaks[peak_position - 1] if peak_position > 0 else None
        next_peak = peaks[peak_position + 1] if (peak_position + 1) < len(peaks) else None
        left_search_start = 0 if previous_peak is None else previous_peak
        right_search_stop = signal.size if next_peak is None else next_peak
        left_trough_index = _argmin_index(signal, left_search_start, peak_index)
        right_trough_index = _argmin_index(signal, peak_index + 1, right_search_stop)
        if left_trough_index is None or right_trough_index is None:
            continue
        if left_trough_index >= peak_index or right_trough_index <= peak_index:
            continue

        amplitude = float(signal[peak_index] - signal[left_trough_index])
        rise_time_seconds = float((peak_index - left_trough_index) / sfreq)
        width_seconds = float((right_trough_index - left_trough_index) / sfreq)
        fall_time_seconds = float((right_trough_index - peak_index) / sfreq)
        is_valid = (
            amplitude > 0.0
            and dominant_beat_min_rise_seconds <= rise_time_seconds <= dominant_beat_max_rise_seconds
            and dominant_beat_min_width_seconds <= width_seconds <= dominant_beat_max_width_seconds
        )
        if not is_valid:
            continue

        notch_index = _detect_notch_index(
            signal,
            peak_index=peak_index,
            right_trough_index=right_trough_index,
            sfreq=sfreq,
            min_delay_seconds=notch_min_delay_seconds,
            max_delay_seconds=notch_max_delay_seconds,
            min_rebound_fraction=notch_min_rebound_fraction,
        )
        beat = {
            "amplitude": amplitude,
            "rise_time_seconds": rise_time_seconds,
            "width_seconds": width_seconds,
            "fall_time_seconds": fall_time_seconds,
            "peak_time_seconds": float(peak_index / sfreq),
            "notch_delay_seconds": 0.0 if notch_index is None else float((notch_index - peak_index) / sfreq),
            "notch_valid": notch_index is not None,
        }
        if best_beat is None or float(beat["amplitude"]) > float(best_beat["amplitude"]):
            best_beat = beat

    if best_beat is None:
        return result

    result.update(
        {
            "dominant_beat_amplitude": float(best_beat["amplitude"]),
            "dominant_beat_rise_time_seconds": float(best_beat["rise_time_seconds"]),
            "dominant_beat_width_seconds": float(best_beat["width_seconds"]),
            "dominant_beat_fall_time_seconds": float(best_beat["fall_time_seconds"]),
            "dominant_beat_peak_time_seconds": float(best_beat["peak_time_seconds"]),
            "dominant_beat_notch_delay_seconds": float(best_beat["notch_delay_seconds"]),
            "dominant_beat_valid": True,
            "dominant_beat_notch_valid": bool(best_beat["notch_valid"]),
        }
    )
    return result
