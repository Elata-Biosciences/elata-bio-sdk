"""Shared oracle helpers mirroring the exact algorithm definitions implemented
in crates/elata-biosignal-features and packages/biosignal-analytics/src.

Every function here IS the normative reference for its algorithm@version: the
Rust/TS implementations must match these within the tolerances recorded in
fixtures/manifest.json.
"""

from __future__ import annotations

import json
import pathlib

import numpy as np
import scipy.signal

FIXTURES_DIR = pathlib.Path(__file__).resolve().parents[2] / "fixtures"


def next_pow2(n: int) -> int:
    p = 1
    while p < n:
        p *= 2
    return p


def welch_psd(samples_f32: np.ndarray, sample_rate_hz: float):
    """welch_psd@1: scipy-compatible Welch (hann, 50% overlap, constant
    detrend, one-sided density, mean averaging, nfft = next_pow2(nperseg))."""
    x = np.asarray(samples_f32, dtype=np.float64)
    nperseg = int(round(4.0 * sample_rate_hz))
    nperseg = max(2, min(nperseg, x.size))
    noverlap = int(np.floor(nperseg * 0.5))
    nfft = next_pow2(nperseg)
    freqs, psd = scipy.signal.welch(
        x,
        fs=sample_rate_hz,
        window="hann",
        nperseg=nperseg,
        noverlap=noverlap,
        nfft=nfft,
        detrend="constant",
        return_onesided=True,
        scaling="density",
        average="mean",
    )
    return freqs, psd


BANDS = {
    "delta": (0.5, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 13.0),
    "beta": (13.0, 30.0),
    "gamma": (30.0, 50.0),
}

LOG_POWER_FLOOR = 1e-12


def band_powers_from_psd(freqs: np.ndarray, psd: np.ndarray) -> dict:
    """eeg_band_power@2: rectangular integration, right-exclusive edges."""
    df = float(freqs[1] - freqs[0])
    abs_powers = {}
    for name, (low, high) in BANDS.items():
        mask = (freqs >= low) & (freqs < high)
        abs_powers[name] = float(np.sum(psd[mask]) * df)
    total = sum(abs_powers.values())
    rel = {
        name: (value / total if total > 0.0 else 0.0)
        for name, value in abs_powers.items()
    }
    log = {
        name: float(np.log10(max(value, LOG_POWER_FLOOR)))
        for name, value in abs_powers.items()
    }
    return {"abs": abs_powers, "rel": rel, "log": log}


def spectral_entropy(psd: np.ndarray) -> float:
    """spectral_entropy@1: Shannon over positive-bin fractions / ln(nBins)."""
    psd = np.asarray(psd, dtype=np.float64)
    if psd.size < 2:
        return 0.0
    positive = psd[psd > 0.0]
    total = float(np.sum(positive))
    if total <= 0.0:
        return 0.0
    p = positive / total
    return float(-np.sum(p * np.log(p)) / np.log(psd.size))


def dominant_frequency(freqs: np.ndarray, psd: np.ndarray, low=1.0, high=40.0):
    """dominant_frequency@1: argmax over inclusive [low, high]."""
    mask = (freqs >= low) & (freqs <= high)
    if not np.any(mask):
        return None
    banded = psd[mask]
    return float(freqs[mask][int(np.argmax(banded))])


def alpha_peak(
    freqs: np.ndarray,
    psd: np.ndarray,
    search=(7.0, 14.0),
    min_prominence_ratio=0.15,
    min_peak_to_spectrum_max_ratio=1e-4,
):
    """alpha_peak@2: strict local maxima within the inclusive band, scipy
    prominence within the band slice, height floor vs full-spectrum max,
    prominence gate vs peak height; highest qualifying peak wins."""
    mask = (freqs >= search[0]) & (freqs <= search[1])
    band = psd[mask]
    band_freqs = freqs[mask]
    if band.size < 3:
        return None
    spectrum_max = float(np.max(psd)) if psd.size else 0.0
    height_floor = min_peak_to_spectrum_max_ratio * spectrum_max
    peaks, _ = scipy.signal.find_peaks(band)
    if peaks.size == 0:
        return None
    prominences = scipy.signal.peak_prominences(band, peaks)[0]
    best = None
    for idx, prominence in zip(peaks, prominences):
        height = float(band[idx])
        if height < height_floor:
            continue
        if prominence < min_prominence_ratio * height:
            continue
        if best is None or height > best[1]:
            best = (idx, height)
    if best is None:
        return None
    return float(band_freqs[best[0]])


def hjorth(samples_f32: np.ndarray) -> dict:
    """hjorth@1: population variances (ddof=0) of x, dx, ddx."""
    x = np.asarray(samples_f32, dtype=np.float64)
    if x.size < 3:
        return {"activity": 0.0, "mobility": 0.0, "complexity": 0.0}
    dx = np.diff(x)
    ddx = np.diff(dx)
    var_x = float(np.var(x))
    var_dx = float(np.var(dx))
    var_ddx = float(np.var(ddx))
    mobility = float(np.sqrt(var_dx / var_x)) if var_x > 0.0 else 0.0
    mobility_dx = float(np.sqrt(var_ddx / var_dx)) if var_dx > 0.0 else 0.0
    complexity = mobility_dx / mobility if mobility > 0.0 else 0.0
    return {"activity": var_x, "mobility": mobility, "complexity": complexity}


def window_stats(samples_f32: np.ndarray) -> dict:
    """window_stats@1: mean/rms/population variance/std/ptp."""
    x = np.asarray(samples_f32, dtype=np.float64)
    if x.size == 0:
        return {"mean": 0.0, "rms": 0.0, "variance": 0.0, "std": 0.0, "ptp": 0.0}
    return {
        "mean": float(np.mean(x)),
        "rms": float(np.sqrt(np.mean(x * x))),
        "variance": float(np.var(x)),
        "std": float(np.std(x)),
        "ptp": float(np.ptp(x)),
    }


def quality_flags(
    samples_f32: np.ndarray,
    freqs: np.ndarray,
    psd: np.ndarray,
    clip_uv=500.0,
    flatline_eps_uv=0.01,
    extreme_amplitude_uv=150.0,
    line_noise_hz=(50.0, 60.0),
    line_noise_half_width_hz=1.0,
    max_clipped_fraction=0.05,
    max_flatline_fraction=0.2,
    max_extreme_fraction=0.1,
    max_line_noise_ratio=0.5,
) -> dict:
    """eeg_quality_flags@1 with the default QualityConfig thresholds."""
    x = np.asarray(samples_f32, dtype=np.float64)
    n = x.size
    if n == 0:
        flatline, clipped, extreme = 1.0, 0.0, 0.0
    else:
        clipped = float(np.mean(np.abs(x) >= clip_uv))
        extreme = float(np.mean(np.abs(x) >= extreme_amplitude_uv))
        if n < 2:
            flatline = 1.0
        else:
            flatline = float(np.mean(np.abs(np.diff(x)) < flatline_eps_uv))
    total_power = float(np.sum(psd))
    if total_power > 0.0:
        near = np.zeros(freqs.shape, dtype=bool)
        for mains in line_noise_hz:
            near |= np.abs(freqs - mains) <= line_noise_half_width_hz
        line_ratio = float(np.sum(psd[near]) / total_power)
    else:
        line_ratio = 0.0
    usable = bool(
        clipped < max_clipped_fraction
        and flatline < max_flatline_fraction
        and extreme < max_extreme_fraction
        and line_ratio < max_line_noise_ratio
    )
    return {
        "flatlineFraction": flatline,
        "clippedFraction": clipped,
        "extremeAmplitudeFraction": extreme,
        "lineNoiseRatio": line_ratio,
        "usable": usable,
    }


NN_MIN_MS = 300.0
NN_MAX_MS = 2000.0
NN_MEDIAN_TOLERANCE = 0.3


def clean_nn_intervals_ms(ibis_ms) -> list:
    """nn_clean@1: physiologic range filter [300, 2000] ms, then drop
    intervals deviating from the median of the in-range set by more than 30%.
    """
    ibis = np.asarray(ibis_ms, dtype=np.float64)
    in_range = ibis[(ibis >= NN_MIN_MS) & (ibis <= NN_MAX_MS)]
    if in_range.size == 0:
        return []
    median = float(np.median(in_range))
    kept = in_range[np.abs(in_range - median) <= NN_MEDIAN_TOLERANCE * median]
    return [float(v) for v in kept]


def hrv_time_domain(ibis_ms) -> dict:
    """hrv_time_domain@1 over the cleaned NN sequence (order preserved;
    successive diffs computed over the cleaned array as-is).

    meanNn: mean; sdnn: sample std (ddof=1), null for <2 intervals;
    rmssd: sqrt(mean(successive diff^2)), null for <2 intervals.
    """
    original = np.asarray(ibis_ms, dtype=np.float64)
    cleaned = np.asarray(clean_nn_intervals_ms(ibis_ms), dtype=np.float64)
    count = int(cleaned.size)
    usable_fraction = float(count / original.size) if original.size else 0.0
    mean_nn = float(np.mean(cleaned)) if count >= 1 else None
    sdnn = float(np.std(cleaned, ddof=1)) if count >= 2 else None
    if count >= 2:
        diffs = np.diff(cleaned)
        rmssd = float(np.sqrt(np.mean(diffs * diffs)))
    else:
        rmssd = None
    return {
        "cleanedNnMs": [float(v) for v in cleaned],
        "ibiCount": count,
        "usableIbiFraction": usable_fraction,
        "meanNnMs": mean_nn,
        "sdnnMs": sdnn,
        "rmssdMs": rmssd,
    }


def summary_stats(values) -> dict:
    """summary_stats@1: numpy-linear percentiles, sample std/variance (ddof=1,
    null for <2 values), cv = std/|mean| (null when undefined)."""
    x = np.asarray(values, dtype=np.float64)
    n = int(x.size)
    if n == 0:
        return {
            "count": 0,
            "mean": None,
            "median": None,
            "min": None,
            "max": None,
            "std": None,
            "variance": None,
            "p5": None,
            "p25": None,
            "p50": None,
            "p75": None,
            "p95": None,
            "iqr": None,
            "cv": None,
        }
    mean = float(np.mean(x))
    std = float(np.std(x, ddof=1)) if n >= 2 else None
    variance = float(np.var(x, ddof=1)) if n >= 2 else None
    p = {q: float(np.percentile(x, q)) for q in (5, 25, 50, 75, 95)}
    cv = (std / abs(mean)) if (std is not None and mean != 0.0) else None
    return {
        "count": n,
        "mean": mean,
        "median": float(np.median(x)),
        "min": float(np.min(x)),
        "max": float(np.max(x)),
        "std": std,
        "variance": variance,
        "p5": p[5],
        "p25": p[25],
        "p50": p[50],
        "p75": p[75],
        "p95": p[95],
        "iqr": p[75] - p[25],
        "cv": cv,
    }


MAD_SCALE = 1.4826
ROBUST_Z_CLAMP = 3.0


def robust_stats(values) -> dict:
    """robust_stats@1: median, MAD, scaled MAD (1.4826 * MAD)."""
    x = np.asarray(values, dtype=np.float64)
    if x.size == 0:
        return {"median": None, "mad": None, "madScaled": None}
    median = float(np.median(x))
    mad = float(np.median(np.abs(x - median)))
    return {"median": median, "mad": mad, "madScaled": MAD_SCALE * mad}


def robust_z(value: float, median: float, mad: float) -> float:
    """robust_z@1: (value - median) / (1.4826 * MAD), clamped to +/-3;
    0 when the scaled MAD is not positive."""
    scaled = MAD_SCALE * mad
    if not scaled > 0.0:
        return 0.0
    z = (value - median) / scaled
    return float(np.clip(z, -ROBUST_Z_CLAMP, ROBUST_Z_CLAMP))


def f32(values) -> np.ndarray:
    """Quantize to float32 (the wire/runtime sample dtype)."""
    return np.asarray(values, dtype=np.float32)


def to_jsonable(obj):
    if isinstance(obj, np.ndarray):
        return [to_jsonable(v) for v in obj.tolist()]
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    return obj


def write_fixture(relative_path: str, payload: dict) -> None:
    path = FIXTURES_DIR / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as handle:
        json.dump(to_jsonable(payload), handle, indent=1)
        handle.write("\n")
    print(f"wrote {path}")
