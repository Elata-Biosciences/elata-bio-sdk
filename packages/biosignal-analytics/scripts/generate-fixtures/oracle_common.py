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


PNN_SHORT_THRESHOLD_MS = 20.0
PNN_LONG_THRESHOLD_MS = 50.0


def prv_time_domain(ibis_ms) -> dict:
    """prv_time_domain@1 — time-domain PULSE-rate variability over the cleaned
    NN/PP sequence.

    Superset of hrv_time_domain@1: meanNN/SDNN/RMSSD are the identical
    arithmetic (so fixtures/pulse/hrv_time_domain.json stays authoritative for
    those three), extended with SDSD, pNN20, pNN50 and the Poincare
    descriptors. Named PRV because the Elata pipeline derives these intervals
    from a camera (rPPG); the intervals are peak-to-peak, not R-to-R, so the
    values are pulse-rate variability even though the formulas are the ones
    NeuroKit2 uses for HRV.

    Canonical formulas (NeuroKit2 `hrv_time` / `hrv_nonlinear`):
      meanNN  = mean(nn)                                  [>= 1 interval]
      SDNN    = std(nn, ddof=1)                           [>= 2 intervals]
      RMSSD   = sqrt(mean(diff(nn)^2))                    [>= 2 intervals]
      SDSD    = std(diff(nn), ddof=1)                     [>= 3 intervals]
      pNN20   = 100 * count(|diff| > 20 ms) / n_diffs     [>= 2 intervals]
      pNN50   = 100 * count(|diff| > 50 ms) / n_diffs     [>= 2 intervals]
      SD1     = sqrt(0.5 * SDSD^2)                        [>= 3 intervals]
      SD2     = sqrt(max(2*SDNN^2 - 0.5*SDSD^2, 0))       [>= 3 intervals]

    SDSD/SD1/SD2 need ddof=1 over the successive differences, hence the
    3-interval floor (2 intervals yield a single difference and an undefined
    sample standard deviation). The SD2 radicand is clamped at 0: it is
    non-negative analytically but can go slightly negative in floating point
    when SDNN and SDSD are both dominated by the same successive differences.
    """
    original = np.asarray(ibis_ms, dtype=np.float64)
    cleaned = np.asarray(clean_nn_intervals_ms(ibis_ms), dtype=np.float64)
    count = int(cleaned.size)
    usable_fraction = float(count / original.size) if original.size else 0.0

    mean_nn = float(np.mean(cleaned)) if count >= 1 else None
    sdnn = float(np.std(cleaned, ddof=1)) if count >= 2 else None
    rmssd = None
    sdsd = None
    pnn20 = None
    pnn50 = None
    sd1 = None
    sd2 = None
    if count >= 2:
        diffs = np.diff(cleaned)
        rmssd = float(np.sqrt(np.mean(diffs * diffs)))
        n_diffs = int(diffs.size)
        pnn20 = float(
            100.0 * np.sum(np.abs(diffs) > PNN_SHORT_THRESHOLD_MS) / n_diffs
        )
        pnn50 = float(
            100.0 * np.sum(np.abs(diffs) > PNN_LONG_THRESHOLD_MS) / n_diffs
        )
    if count >= 3:
        diffs = np.diff(cleaned)
        sdsd = float(np.std(diffs, ddof=1))
        sd1 = float(np.sqrt(0.5 * sdsd * sdsd))
        sd2 = float(np.sqrt(max(2.0 * sdnn * sdnn - 0.5 * sdsd * sdsd, 0.0)))

    mean_rate = (
        float(60000.0 / mean_nn) if (mean_nn is not None and mean_nn > 0.0) else None
    )
    return {
        "cleanedNnMs": [float(v) for v in cleaned],
        "ppIntervalCount": count,
        "usableIntervalFraction": usable_fraction,
        "meanNnMs": mean_nn,
        "meanPulseRateBpm": mean_rate,
        "sdnnMs": sdnn,
        "rmssdMs": rmssd,
        "sdsdMs": sdsd,
        "pnn20Percent": pnn20,
        "pnn50Percent": pnn50,
        "sd1Ms": sd1,
        "sd2Ms": sd2,
    }


PRV_RESAMPLE_HZ = 4.0
PRV_LF_BAND_HZ = (0.04, 0.15)
PRV_HF_BAND_HZ = (0.15, 0.40)
PRV_SEGMENT_SECONDS = 120.0
PRV_OVERLAP_RATIO = 0.5
PRV_MIN_INTERVALS = 20
PRV_MIN_LF_DURATION_S = 120.0
PRV_MIN_HF_DURATION_S = 60.0
PRV_MIN_CYCLES_IN_SEGMENT = 2.0


def prv_tachogram(cleaned_ms, resample_hz=PRV_RESAMPLE_HZ):
    """Uniformly-resampled NN tachogram used by prv_frequency_domain@1.

    Interval i is timestamped at the beat that TERMINATES it, i.e. at
    `cumsum(nn)[i] / 1000` seconds; the series therefore spans
    `t[-1] - t[0] = sum(nn[1:]) / 1000` seconds. Resampling is LINEAR
    (`np.interp`) rather than cubic-spline so the Rust implementation can be
    reproduced exactly; the grid is `t[0] + k / resample_hz` for
    `k = 0 .. floor(duration * resample_hz)`.
    """
    nn = np.asarray(cleaned_ms, dtype=np.float64)
    beat_times_s = np.cumsum(nn) / 1000.0
    duration_s = float(beat_times_s[-1] - beat_times_s[0])
    n = int(np.floor(duration_s * resample_hz)) + 1
    grid = beat_times_s[0] + np.arange(n, dtype=np.float64) / resample_hz
    values = np.interp(grid, beat_times_s, nn)
    return grid, values, duration_s


def prv_frequency_domain(
    ibis_ms,
    resample_hz=PRV_RESAMPLE_HZ,
    lf_band_hz=PRV_LF_BAND_HZ,
    hf_band_hz=PRV_HF_BAND_HZ,
    segment_seconds=PRV_SEGMENT_SECONDS,
    overlap_ratio=PRV_OVERLAP_RATIO,
    min_intervals=PRV_MIN_INTERVALS,
    min_lf_duration_s=PRV_MIN_LF_DURATION_S,
    min_hf_duration_s=PRV_MIN_HF_DURATION_S,
    min_cycles_in_segment=PRV_MIN_CYCLES_IN_SEGMENT,
) -> dict:
    """prv_frequency_domain@1 — LF / HF / LF:HF over the NN tachogram, with
    explicit window-length gating.

    A band is WITHHELD (null, with a reason) rather than reported when the
    record cannot resolve it:
      - fewer than `min_intervals` cleaned intervals        -> tooFewIntervals
      - tachogram shorter than the band's minimum duration  -> recordingTooShort
      - the Welch segment actually used spans fewer than
        `min_cycles_in_segment` cycles of the band's low
        edge                                                -> segmentTooShort
    LF:HF is withheld whenever either band is withheld, or when HF power is 0.

    Spectrum: welch_psd@1 parameters on the resampled tachogram (periodic
    hann, constant detrend, one-sided density, nfft = next_pow2(nperseg),
    nperseg = clamp(round(segment_seconds * resample_hz), 2, n)). Band power
    is rectangular integration with right-exclusive edges (the eeg_band_power@2
    convention), so LF and HF never share a bin. Units are ms^2.
    """
    cleaned = np.asarray(clean_nn_intervals_ms(ibis_ms), dtype=np.float64)
    count = int(cleaned.size)
    base = {
        "ppIntervalCount": count,
        "durationSeconds": 0.0,
        "resampleHz": float(resample_hz),
        "segmentSeconds": None,
        "lfMs2": None,
        "hfMs2": None,
        "lfHfRatio": None,
        "lfWithheldReason": None,
        "hfWithheldReason": None,
        "ratioWithheldReason": None,
    }
    if count < min_intervals:
        base["lfWithheldReason"] = "tooFewIntervals"
        base["hfWithheldReason"] = "tooFewIntervals"
        base["ratioWithheldReason"] = "tooFewIntervals"
        return base

    grid, values, duration_s = prv_tachogram(cleaned, resample_hz)
    values = np.asarray(f32(values), dtype=np.float64)
    nperseg = int(round(segment_seconds * resample_hz))
    nperseg = max(2, min(nperseg, int(values.size)))
    noverlap = int(np.floor(nperseg * overlap_ratio))
    nfft = next_pow2(nperseg)
    freqs, psd = scipy.signal.welch(
        values,
        fs=resample_hz,
        window="hann",
        nperseg=nperseg,
        noverlap=noverlap,
        nfft=nfft,
        detrend="constant",
        return_onesided=True,
        scaling="density",
        average="mean",
    )
    df = float(freqs[1] - freqs[0])
    segment_s = nperseg / float(resample_hz)
    base["durationSeconds"] = duration_s
    base["segmentSeconds"] = segment_s

    def band(low_high, min_duration_s):
        low, high = low_high
        if duration_s < min_duration_s:
            return None, "recordingTooShort"
        if segment_s * low < min_cycles_in_segment:
            return None, "segmentTooShort"
        mask = (freqs >= low) & (freqs < high)
        return float(np.sum(psd[mask]) * df), None

    lf, lf_reason = band(lf_band_hz, min_lf_duration_s)
    hf, hf_reason = band(hf_band_hz, min_hf_duration_s)
    base["lfMs2"] = lf
    base["lfWithheldReason"] = lf_reason
    base["hfMs2"] = hf
    base["hfWithheldReason"] = hf_reason
    if lf is None:
        base["ratioWithheldReason"] = lf_reason
    elif hf is None:
        base["ratioWithheldReason"] = hf_reason
    elif not hf > 0.0:
        base["ratioWithheldReason"] = "hfPowerZero"
    else:
        base["lfHfRatio"] = float(lf / hf)
    return base


ACTIVATION_BASELINE_WINDOW_SECONDS = 60.0
ACTIVATION_MIN_BASELINE_SECONDS = 20.0
ACTIVATION_K = 2.0
ACTIVATION_MIN_ABSOLUTE_RISE = 0.0
ACTIVATION_MIN_SUSTAINED_SECONDS = 10.0
ACTIVATION_MIN_RECOVERY_SECONDS = 10.0
ACTIVATION_RECOVERY_FRACTION = 0.10


def activation_epoch(
    values,
    sample_rate_hz,
    baseline_window_seconds=ACTIVATION_BASELINE_WINDOW_SECONDS,
    min_baseline_seconds=ACTIVATION_MIN_BASELINE_SECONDS,
    activation_k=ACTIVATION_K,
    min_absolute_rise=ACTIVATION_MIN_ABSOLUTE_RISE,
    min_sustained_seconds=ACTIVATION_MIN_SUSTAINED_SECONDS,
    min_recovery_seconds=ACTIVATION_MIN_RECOVERY_SECONDS,
    recovery_fraction=ACTIVATION_RECOVERY_FRACTION,
) -> dict:
    """activation_epoch@1 — the single sustained activation in a session, with
    its pre-epoch baseline and post-epoch recovery.

    Sample k is at time `k / sample_rate_hz` seconds.

    1. BASELINE. The leading `baseline_window_seconds` of the recording
       (samples with `t < baseline_window_seconds`) is the baseline window. It
       must span at least `min_baseline_seconds` and hold at least 2 samples,
       else the whole result is withheld (`baselineTooShort`).
       `level = median(baseline)`, `scale = 1.4826 * MAD(baseline)` — the
       robust_stats@1 pair, chosen so a single artefact in the baseline cannot
       move the threshold.
    2. THRESHOLD. `threshold = level + max(activation_k * scale,
       min_absolute_rise)`.
    3. ONSET. Scanning from the first sample after the baseline window, find
       the first contiguous run of samples with `value > threshold` that lasts
       at least `min_sustained_seconds` (run duration measured as
       `(lastIdx - firstIdx) / fs`). That run is the epoch. If no run
       qualifies the result is withheld (`noQualifyingActivation`). Only the
       FIRST qualifying run is reported — this is a session-level "did the
       stimulus land" epoch, not a general event detector.
    4. EPOCH METRICS. Peak = max value in the run (first index on ties);
       `timeToPeak = tPeak - tStart`; `areaAboveBaseline` = trapezoidal
       integral of `(value - level)` over the run (value-units x seconds);
       `riseRate = (peak - level) / (tPeak - tPreOnset)` where `tPreOnset` is
       the last sample before onset (always one sample period before onset, so
       the denominator is never 0 and the rate is strictly positive).
    5. RECOVERY. Measured from the PEAK. Requires at least
       `min_recovery_seconds` of recording after the peak, else the recovery
       block alone is withheld (`postEpochWindowTooShort`) while the epoch
       metrics stand. `halfTarget = level + 0.5 * (peak - level)`;
       `baselineTarget = level + recovery_fraction * (peak - level)`.
       `timeToHalfRecovery` / `timeToBaseline` are the delays from the peak to
       the first sample at or below each target, or null when never reached.
       `recoveryCompleted` is true iff `timeToBaseline` is non-null.
       `recoverySlope = (value[endIdx] - peak) / (t[endIdx] - tPeak)` where
       `endIdx` is the baseline-return sample when recovery completed and the
       last sample of the recording otherwise; it is <= 0 for any signal that
       decays from its peak.
    """
    x = np.asarray(values, dtype=np.float64)
    n = int(x.size)
    dt = 1.0 / float(sample_rate_hz)
    out = {
        "sampleRateHz": float(sample_rate_hz),
        "sampleCount": n,
        "durationSeconds": float(n * dt) if n else 0.0,
        "baseline": None,
        "epoch": None,
        "withheldReason": None,
    }
    if n < 2 or not np.all(np.isfinite(x)):
        out["withheldReason"] = "insufficientSamples"
        return out

    baseline_count = int(np.floor(baseline_window_seconds * sample_rate_hz))
    baseline_count = min(baseline_count, n)
    baseline_span = (baseline_count - 1) * dt if baseline_count >= 1 else 0.0
    if baseline_count < 2 or baseline_span < min_baseline_seconds:
        out["withheldReason"] = "baselineTooShort"
        return out

    baseline_values = x[:baseline_count]
    level = float(np.median(baseline_values))
    mad = float(np.median(np.abs(baseline_values - level)))
    scale = MAD_SCALE * mad
    threshold = level + max(activation_k * scale, min_absolute_rise)
    out["baseline"] = {
        "startSeconds": 0.0,
        "endSeconds": float(baseline_span),
        "sampleCount": baseline_count,
        "level": level,
        "scale": scale,
        "activationThreshold": threshold,
    }

    above = x > threshold
    start_idx = None
    idx = baseline_count
    epoch = None
    while idx < n:
        if not above[idx]:
            idx += 1
            continue
        start_idx = idx
        end_idx = idx
        while end_idx + 1 < n and above[end_idx + 1]:
            end_idx += 1
        if (end_idx - start_idx) * dt >= min_sustained_seconds:
            epoch = (start_idx, end_idx)
            break
        idx = end_idx + 1
    if epoch is None:
        out["withheldReason"] = "noQualifyingActivation"
        return out

    start_idx, end_idx = epoch
    run = x[start_idx : end_idx + 1]
    peak_offset = int(np.argmax(run))
    peak_idx = start_idx + peak_offset
    peak_value = float(x[peak_idx])
    t_start = start_idx * dt
    t_end = end_idx * dt
    t_peak = peak_idx * dt
    area = float(np.trapezoid(run - level, dx=dt))
    rise_span = t_peak - (start_idx - 1) * dt
    rise_rate = float((peak_value - level) / rise_span)

    recovery = None
    recovery_withheld = None
    observed = (n - 1 - peak_idx) * dt
    if observed < min_recovery_seconds:
        recovery_withheld = "postEpochWindowTooShort"
    else:
        amplitude = peak_value - level
        half_target = level + 0.5 * amplitude
        baseline_target = level + recovery_fraction * amplitude
        tail = x[peak_idx + 1 :]
        half_hits = np.nonzero(tail <= half_target)[0]
        base_hits = np.nonzero(tail <= baseline_target)[0]
        t_half = float((int(half_hits[0]) + 1) * dt) if half_hits.size else None
        t_base = float((int(base_hits[0]) + 1) * dt) if base_hits.size else None
        if base_hits.size:
            end_recovery_idx = peak_idx + 1 + int(base_hits[0])
        else:
            end_recovery_idx = n - 1
        span = (end_recovery_idx - peak_idx) * dt
        slope = float((x[end_recovery_idx] - peak_value) / span) if span > 0.0 else 0.0
        residual = (
            float((x[n - 1] - level) / amplitude) if amplitude > 0.0 else 0.0
        )
        recovery = {
            "observedSeconds": float(observed),
            "halfRecoveryTarget": half_target,
            "baselineReturnTarget": baseline_target,
            "timeToHalfRecoverySeconds": t_half,
            "timeToBaselineSeconds": t_base,
            "recoveryCompleted": bool(base_hits.size > 0),
            "recoverySlopePerSecond": slope,
            "residualFraction": residual,
        }

    out["epoch"] = {
        "startSeconds": float(t_start),
        "endSeconds": float(t_end),
        "durationSeconds": float(t_end - t_start),
        "sampleCount": int(end_idx - start_idx + 1),
        "peakValue": peak_value,
        "peakSeconds": float(t_peak),
        "timeToPeakSeconds": float(t_peak - t_start),
        "riseRatePerSecond": rise_rate,
        "areaAboveBaseline": area,
        "recovery": recovery,
        "recoveryWithheldReason": recovery_withheld,
    }
    return out


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
