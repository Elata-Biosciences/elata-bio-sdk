//! Pulse-rate-variability (PRV) statistics over a cleaned PP-interval series.
//!
//! NAMING — this is a scientific-honesty requirement, not a style preference.
//! Elata derives its intervals from a camera (rPPG). Those are peak-to-peak
//! intervals in a peripheral pulse wave, not R-to-R intervals in an ECG, and
//! they carry pulse-transit-time jitter that a cardiac trace does not. The
//! statistics are therefore **pulse-rate variability (PRV)**, and every type,
//! metric id and doc string in this module says so. PRV tracks HRV closely at
//! rest and diverges under sympathetic load, so reporting these numbers as
//! "HRV" would be a claim the sensor cannot support.
//!
//! The file is named `hrv.rs` because the *formulas* are the canonical HRV
//! ones (NeuroKit2 `hrv_time` / `hrv_nonlinear`); the field names `meanNN`,
//! `SDNN`, `RMSSD`, `SDSD` are likewise the literal published metric names and
//! are kept verbatim so the numbers stay comparable with the literature.
//!
//! This module is the Rust replacement for the TypeScript
//! `packages/biosignal-analytics/src/pulse/hrv.ts`; `prv_time_domain@1` is a
//! strict superset of the `hrv_time_domain@1` it replaces, computing meanNN,
//! SDNN and RMSSD with identical arithmetic so
//! `fixtures/pulse/hrv_time_domain.json` still passes.

use crate::config::{NnCleanConfig, PrvFrequencyConfig, PrvTimeDomainConfig, WelchConfig};
use crate::pulse::{clean_pp_intervals_ms, nn_tachogram};
use crate::spectral::welch_psd;
use serde::{Deserialize, Serialize};

/// Time-domain PRV. `algorithm: prv_time_domain@1`.
///
/// Every metric is `Option` and is `None` — withheld — when the cleaned series
/// is too short to define it. The minimum interval counts are:
///
/// | metric | minimum cleaned intervals | why |
/// |---|---|---|
/// | `mean_nn_ms`, `mean_pulse_rate_bpm` | 1 | a mean needs one value |
/// | `sdnn_ms` | 2 | sample standard deviation (ddof = 1) |
/// | `rmssd_ms`, `pnn20_percent`, `pnn50_percent` | 2 | one successive difference |
/// | `sdsd_ms`, `sd1_ms`, `sd2_ms` | 3 | ddof = 1 *over the differences* |
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrvTimeDomain {
    /// Cleaned PP intervals actually used.
    pub pp_interval_count: usize,
    /// Cleaned / input interval count (0 for empty input).
    pub usable_interval_fraction: f64,
    /// Mean PP interval in ms (the HRV literature's MeanNN).
    pub mean_nn_ms: Option<f64>,
    /// Mean pulse rate in bpm, `60000 / meanNN`.
    pub mean_pulse_rate_bpm: Option<f64>,
    /// Sample standard deviation of the intervals, ddof = 1 (SDNN).
    pub sdnn_ms: Option<f64>,
    /// Root mean square of successive differences (RMSSD).
    pub rmssd_ms: Option<f64>,
    /// Sample standard deviation of successive differences, ddof = 1 (SDSD).
    pub sdsd_ms: Option<f64>,
    /// Percent of successive differences exceeding the short threshold (20 ms).
    pub pnn20_percent: Option<f64>,
    /// Percent of successive differences exceeding the long threshold (50 ms).
    pub pnn50_percent: Option<f64>,
    /// Poincaré short-axis dispersion, `sqrt(0.5 * SDSD^2)`.
    pub sd1_ms: Option<f64>,
    /// Poincaré long-axis dispersion, `sqrt(2*SDNN^2 - 0.5*SDSD^2)`.
    pub sd2_ms: Option<f64>,
}

/// Sample standard deviation (ddof = 1); `None` for fewer than 2 values.
fn sample_std(values: &[f64]) -> Option<f64> {
    if values.len() < 2 {
        return None;
    }
    let n = values.len() as f64;
    let mean = values.iter().sum::<f64>() / n;
    let mut acc = 0.0f64;
    for &value in values {
        let delta = value - mean;
        acc += delta * delta;
    }
    Some((acc / (n - 1.0)).sqrt())
}

/// Time-domain PRV over an already-cleaned interval series.
/// `algorithm: prv_time_domain@1`.
///
/// Successive differences are taken over the cleaned sequence **as-is**: the
/// cleaner removes intervals without stitching the gap, so a difference is
/// never invented across a removed beat.
///
/// `sd2_ms` clamps its radicand at 0. `2*SDNN² - 0.5*SDSD²` is non-negative
/// analytically, but a series whose variance is dominated by beat-to-beat
/// alternation (SDSD ≈ 2·SDNN) drives it to zero and floating point can carry
/// it slightly below; reporting `NaN` there would be worse than reporting the
/// true limit of 0.
pub fn prv_time_domain_from_cleaned(
    cleaned_ms: &[f64],
    input_count: usize,
    cfg: &PrvTimeDomainConfig,
) -> PrvTimeDomain {
    let count = cleaned_ms.len();
    let usable_interval_fraction = if input_count > 0 {
        count as f64 / input_count as f64
    } else {
        0.0
    };

    let mean_nn_ms = if count >= 1 {
        Some(cleaned_ms.iter().sum::<f64>() / count as f64)
    } else {
        None
    };
    let mean_pulse_rate_bpm = mean_nn_ms
        .filter(|mean| *mean > 0.0)
        .map(|mean| 60_000.0 / mean);
    let sdnn_ms = sample_std(cleaned_ms);

    let diffs: Vec<f64> = cleaned_ms
        .windows(2)
        .map(|pair| pair[1] - pair[0])
        .collect();
    let (rmssd_ms, pnn20_percent, pnn50_percent) = if diffs.is_empty() {
        (None, None, None)
    } else {
        let n = diffs.len() as f64;
        let rmssd = (diffs.iter().map(|d| d * d).sum::<f64>() / n).sqrt();
        let count_above = |threshold: f64| {
            100.0 * diffs.iter().filter(|d| d.abs() > threshold).count() as f64 / n
        };
        (
            Some(rmssd),
            Some(count_above(cfg.pnn_short_threshold_ms)),
            Some(count_above(cfg.pnn_long_threshold_ms)),
        )
    };

    let sdsd_ms = sample_std(&diffs);
    let (sd1_ms, sd2_ms) = match (sdsd_ms, sdnn_ms) {
        (Some(sdsd), Some(sdnn)) => (
            Some((0.5 * sdsd * sdsd).sqrt()),
            Some((2.0 * sdnn * sdnn - 0.5 * sdsd * sdsd).max(0.0).sqrt()),
        ),
        _ => (None, None),
    };

    PrvTimeDomain {
        pp_interval_count: count,
        usable_interval_fraction,
        mean_nn_ms,
        mean_pulse_rate_bpm,
        sdnn_ms,
        rmssd_ms,
        sdsd_ms,
        pnn20_percent,
        pnn50_percent,
        sd1_ms,
        sd2_ms,
    }
}

/// Clean an interval series and compute time-domain PRV in one step.
pub fn prv_time_domain(
    intervals_ms: &[f64],
    clean_cfg: &NnCleanConfig,
    cfg: &PrvTimeDomainConfig,
) -> PrvTimeDomain {
    let cleaned = clean_pp_intervals_ms(intervals_ms, clean_cfg);
    prv_time_domain_from_cleaned(&cleaned.kept_ms, cleaned.input_count, cfg)
}

/// Why a frequency-domain PRV band was withheld rather than reported.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PrvWithheldReason {
    /// Fewer cleaned intervals than `min_intervals`.
    TooFewIntervals,
    /// The tachogram is shorter than the band's minimum duration.
    RecordingTooShort,
    /// The Welch segment actually used spans fewer than
    /// `min_cycles_in_segment` cycles of the band's low edge.
    SegmentTooShort,
    /// HF power is zero, so the LF:HF ratio would divide by zero.
    HfPowerZero,
}

/// Frequency-domain PRV. `algorithm: prv_frequency_domain@1`.
///
/// A band is either a number or `None` **with a reason** — never a number the
/// window could not support. See [`prv_frequency_domain`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrvFrequencyDomain {
    /// Cleaned PP intervals actually used.
    pub pp_interval_count: usize,
    /// Span of the tachogram in seconds (0 when no tachogram was built).
    pub duration_seconds: f64,
    /// Grid rate the tachogram was resampled onto.
    pub resample_hz: f64,
    /// Welch segment length actually used, in seconds (`None` when no
    /// spectrum was computed).
    pub segment_seconds: Option<f64>,
    /// Low-frequency power in ms².
    pub lf_ms2: Option<f64>,
    /// High-frequency power in ms².
    pub hf_ms2: Option<f64>,
    /// LF:HF ratio (dimensionless).
    pub lf_hf_ratio: Option<f64>,
    pub lf_withheld_reason: Option<PrvWithheldReason>,
    pub hf_withheld_reason: Option<PrvWithheldReason>,
    pub ratio_withheld_reason: Option<PrvWithheldReason>,
}

impl PrvFrequencyDomain {
    fn all_withheld(count: usize, resample_hz: f64, reason: PrvWithheldReason) -> Self {
        Self {
            pp_interval_count: count,
            duration_seconds: 0.0,
            resample_hz,
            segment_seconds: None,
            lf_ms2: None,
            hf_ms2: None,
            lf_hf_ratio: None,
            lf_withheld_reason: Some(reason),
            hf_withheld_reason: Some(reason),
            ratio_withheld_reason: Some(reason),
        }
    }
}

/// Frequency-domain PRV over an already-cleaned interval series.
/// `algorithm: prv_frequency_domain@1`.
///
/// Pipeline: linear-resample the tachogram onto `resample_hz`, quantize to f32
/// (the runtime sample dtype, so native and WASM agree exactly), run
/// `welch_psd@1` over it, and integrate each band rectangularly with
/// right-exclusive edges — the `eeg_band_power@2` convention, so LF and HF can
/// never share a bin. Units are ms².
///
/// # Withholding
///
/// This is the part that matters. A 30-second recording cannot resolve a
/// 0.04 Hz oscillation: it contains barely one cycle, and any "LF power" the
/// FFT reports there is the detrending residual, not physiology. So a band is
/// withheld — `None`, with a [`PrvWithheldReason`] — when:
///
/// - the cleaned series holds fewer than `min_intervals` intervals
///   ([`PrvWithheldReason::TooFewIntervals`]);
/// - the tachogram is shorter than `min_lf_duration_seconds` /
///   `min_hf_duration_seconds` — 120 s and 60 s by default, the Task Force
///   short-term minima ([`PrvWithheldReason::RecordingTooShort`]);
/// - the Welch segment actually used spans fewer than `min_cycles_in_segment`
///   cycles of the band's low edge ([`PrvWithheldReason::SegmentTooShort`]).
///
/// LF:HF is withheld whenever either band is, and when HF power is exactly
/// zero. A withheld band is never substituted with 0.
pub fn prv_frequency_domain_from_cleaned(
    cleaned_ms: &[f64],
    cfg: &PrvFrequencyConfig,
) -> PrvFrequencyDomain {
    let count = cleaned_ms.len();
    if count < cfg.min_intervals {
        return PrvFrequencyDomain::all_withheld(
            count,
            cfg.resample_hz,
            PrvWithheldReason::TooFewIntervals,
        );
    }
    let Some(tachogram) = nn_tachogram(cleaned_ms, cfg.resample_hz) else {
        return PrvFrequencyDomain::all_withheld(
            count,
            cfg.resample_hz,
            PrvWithheldReason::TooFewIntervals,
        );
    };

    let samples: Vec<f32> = tachogram.values_ms.iter().map(|v| *v as f32).collect();
    let welch = WelchConfig {
        segment_seconds: cfg.segment_seconds,
        overlap_ratio: cfg.overlap_ratio,
        window: "hann".to_string(),
        detrend: "constant".to_string(),
    };
    let psd = welch_psd(&samples, cfg.resample_hz, &welch);
    let df = psd.df();

    // Mirror welch_psd's own nperseg clamp so the reported segment length is
    // the one the spectrum was actually built from.
    let nperseg =
        ((cfg.segment_seconds * cfg.resample_hz).round() as usize).clamp(2, samples.len().max(2));
    let segment_seconds = nperseg as f64 / cfg.resample_hz;
    let duration_seconds = tachogram.duration_seconds;

    let integrate = |band: [f64; 2]| -> f64 {
        let [low, high] = band;
        let sum: f64 = psd
            .freqs_hz
            .iter()
            .zip(psd.psd.iter())
            .filter(|(&freq, _)| freq >= low && freq < high)
            .map(|(_, &power)| power)
            .sum();
        sum * df
    };
    let band = |band: [f64; 2], min_duration: f64| -> (Option<f64>, Option<PrvWithheldReason>) {
        if duration_seconds < min_duration {
            return (None, Some(PrvWithheldReason::RecordingTooShort));
        }
        if segment_seconds * band[0] < cfg.min_cycles_in_segment {
            return (None, Some(PrvWithheldReason::SegmentTooShort));
        }
        (Some(integrate(band)), None)
    };

    let (lf_ms2, lf_withheld_reason) = band(cfg.lf_band_hz, cfg.min_lf_duration_seconds);
    let (hf_ms2, hf_withheld_reason) = band(cfg.hf_band_hz, cfg.min_hf_duration_seconds);
    let (lf_hf_ratio, ratio_withheld_reason) = match (lf_ms2, hf_ms2) {
        (None, _) => (None, lf_withheld_reason),
        (_, None) => (None, hf_withheld_reason),
        (Some(lf), Some(hf)) if hf > 0.0 => (Some(lf / hf), None),
        _ => (None, Some(PrvWithheldReason::HfPowerZero)),
    };

    PrvFrequencyDomain {
        pp_interval_count: count,
        duration_seconds,
        resample_hz: cfg.resample_hz,
        segment_seconds: Some(segment_seconds),
        lf_ms2,
        hf_ms2,
        lf_hf_ratio,
        lf_withheld_reason,
        hf_withheld_reason,
        ratio_withheld_reason,
    }
}

/// Clean an interval series and compute frequency-domain PRV in one step.
pub fn prv_frequency_domain(
    intervals_ms: &[f64],
    clean_cfg: &NnCleanConfig,
    cfg: &PrvFrequencyConfig,
) -> PrvFrequencyDomain {
    let cleaned = clean_pp_intervals_ms(intervals_ms, clean_cfg);
    prv_frequency_domain_from_cleaned(&cleaned.kept_ms, cfg)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    fn td(intervals: &[f64]) -> PrvTimeDomain {
        prv_time_domain(
            intervals,
            &NnCleanConfig::default(),
            &PrvTimeDomainConfig::default(),
        )
    }

    #[test]
    fn sample_std_matches_the_ddof_one_formula() {
        // values 1,2,3,4: mean 2.5, sum sq dev 5, /3 = 1.666..., sqrt.
        let value = sample_std(&[1.0, 2.0, 3.0, 4.0]).unwrap();
        assert!((value - (5.0f64 / 3.0).sqrt()).abs() < 1e-12);
        assert_eq!(sample_std(&[7.0]), None);
        assert_eq!(sample_std(&[]), None);
        assert_eq!(sample_std(&[5.0, 5.0]), Some(0.0));
    }

    #[test]
    fn mean_nn_and_pulse_rate_are_reciprocal() {
        let out = td(&[800.0, 800.0, 800.0]);
        assert_eq!(out.mean_nn_ms, Some(800.0));
        assert_eq!(out.mean_pulse_rate_bpm, Some(75.0));
    }

    #[test]
    fn metronomic_series_has_zero_variability() {
        let out = td(&[800.0; 12]);
        assert_eq!(out.sdnn_ms, Some(0.0));
        assert_eq!(out.rmssd_ms, Some(0.0));
        assert_eq!(out.sdsd_ms, Some(0.0));
        assert_eq!(out.pnn20_percent, Some(0.0));
        assert_eq!(out.pnn50_percent, Some(0.0));
        assert_eq!(out.sd1_ms, Some(0.0));
        // SD2 = sqrt(2*0 - 0) = 0 for a perfectly flat series.
        assert_eq!(out.sd2_ms, Some(0.0));
    }

    #[test]
    fn known_small_case_matches_hand_computed_values() {
        // 800, 850, 810: diffs +50, -40.
        let out = td(&[800.0, 850.0, 810.0]);
        assert!((out.mean_nn_ms.unwrap() - 820.0).abs() < 1e-12);
        // sample std of {800,850,810}: sum sq dev = 400+900+100 = 1400, /2.
        assert!((out.sdnn_ms.unwrap() - 700.0f64.sqrt()).abs() < 1e-12);
        // rmssd = sqrt((2500 + 1600)/2) = sqrt(2050).
        assert!((out.rmssd_ms.unwrap() - 2050.0f64.sqrt()).abs() < 1e-12);
        // sdsd = sample std of {50, -40} = sqrt(((45)^2 + (45)^2)/1) = 45*sqrt(2).
        assert!((out.sdsd_ms.unwrap() - 45.0 * 2.0f64.sqrt()).abs() < 1e-12);
        // sd1 = sqrt(0.5 * sdsd^2) = 45.
        assert!((out.sd1_ms.unwrap() - 45.0).abs() < 1e-12);
        // pNN20: both |diffs| exceed 20 -> 100%; pNN50: neither exceeds 50.
        assert_eq!(out.pnn20_percent, Some(100.0));
        assert_eq!(out.pnn50_percent, Some(0.0));
    }

    #[test]
    fn pnn_thresholds_are_strict_inequalities() {
        // Differences of exactly 20 and exactly 50 must NOT be counted.
        let out = td(&[800.0, 820.0, 870.0]);
        assert_eq!(out.pnn20_percent, Some(50.0)); // only the +50 exceeds 20
        assert_eq!(out.pnn50_percent, Some(0.0)); // +50 is not > 50
    }

    #[test]
    fn short_series_withhold_the_metrics_they_cannot_define() {
        let two = td(&[800.0, 850.0]);
        assert!(two.sdnn_ms.is_some());
        assert!(two.rmssd_ms.is_some());
        assert!(two.pnn20_percent.is_some());
        // One difference cannot support a ddof=1 standard deviation.
        assert_eq!(two.sdsd_ms, None);
        assert_eq!(two.sd1_ms, None);
        assert_eq!(two.sd2_ms, None);

        let one = td(&[800.0]);
        assert_eq!(one.mean_nn_ms, Some(800.0));
        assert_eq!(one.sdnn_ms, None);
        assert_eq!(one.rmssd_ms, None);
        assert_eq!(one.pnn50_percent, None);

        let none = td(&[]);
        assert_eq!(none.pp_interval_count, 0);
        assert_eq!(none.mean_nn_ms, None);
        assert_eq!(none.usable_interval_fraction, 0.0);
    }

    #[test]
    fn cleaning_is_applied_before_the_statistics() {
        // The 2500 ms dropout must not reach meanNN.
        let out = td(&[800.0, 800.0, 2500.0, 800.0]);
        assert_eq!(out.pp_interval_count, 3);
        assert_eq!(out.mean_nn_ms, Some(800.0));
        assert!((out.usable_interval_fraction - 0.75).abs() < 1e-12);
    }

    #[test]
    fn sd2_radicand_is_clamped_rather_than_returning_nan() {
        // Strict alternation drives 2*SDNN^2 - 0.5*SDSD^2 negative.
        let alternating: Vec<f64> = (0..21)
            .map(|i| if i % 2 == 0 { 770.0 } else { 890.0 })
            .collect();
        let out = td(&alternating);
        let sd2 = out.sd2_ms.expect("sd2 present");
        assert!(sd2.is_finite() && sd2 >= 0.0, "sd2 {sd2}");
        assert_eq!(sd2, 0.0);
    }

    /// Beat-driven synthetic tachogram: interval sampled at the beat that
    /// starts it, so modulation lands at real elapsed time.
    fn modulated(duration_s: f64, mean_ms: f64, amp_ms: f64, hz: f64) -> Vec<f64> {
        let mut out = Vec::new();
        let mut t = 0.0f64;
        while t < duration_s {
            let nn = mean_ms + amp_ms * (2.0 * PI * hz * t).sin();
            out.push(nn);
            t += nn / 1000.0;
        }
        out
    }

    fn fd(intervals: &[f64], cfg: &PrvFrequencyConfig) -> PrvFrequencyDomain {
        prv_frequency_domain(intervals, &NnCleanConfig::default(), cfg)
    }

    #[test]
    fn lf_modulation_lands_in_the_lf_band() {
        let cfg = PrvFrequencyConfig::default();
        let out = fd(&modulated(300.0, 850.0, 40.0, 0.10), &cfg);
        let lf = out.lf_ms2.expect("lf present");
        let hf = out.hf_ms2.expect("hf present");
        assert!(lf > hf * 5.0, "lf {lf} hf {hf}");
        assert!(out.lf_hf_ratio.unwrap() > 5.0);
        assert_eq!(out.lf_withheld_reason, None);
    }

    #[test]
    fn hf_modulation_lands_in_the_hf_band() {
        let cfg = PrvFrequencyConfig::default();
        let out = fd(&modulated(300.0, 850.0, 40.0, 0.25), &cfg);
        let lf = out.lf_ms2.expect("lf present");
        let hf = out.hf_ms2.expect("hf present");
        assert!(hf > lf * 5.0, "lf {lf} hf {hf}");
        assert!(out.lf_hf_ratio.unwrap() < 0.2);
    }

    #[test]
    fn a_ninety_second_window_withholds_lf_but_reports_hf() {
        let cfg = PrvFrequencyConfig::default();
        let out = fd(&modulated(90.0, 800.0, 30.0, 0.25), &cfg);
        assert_eq!(out.lf_ms2, None);
        assert_eq!(
            out.lf_withheld_reason,
            Some(PrvWithheldReason::RecordingTooShort)
        );
        assert!(out.hf_ms2.is_some());
        assert_eq!(out.hf_withheld_reason, None);
        // Without LF there is no ratio to report, and it is NOT zeroed.
        assert_eq!(out.lf_hf_ratio, None);
        assert_eq!(
            out.ratio_withheld_reason,
            Some(PrvWithheldReason::RecordingTooShort)
        );
    }

    #[test]
    fn a_forty_second_window_withholds_both_bands() {
        let cfg = PrvFrequencyConfig::default();
        let out = fd(&modulated(40.0, 800.0, 30.0, 0.25), &cfg);
        assert_eq!(out.lf_ms2, None);
        assert_eq!(out.hf_ms2, None);
        assert_eq!(
            out.hf_withheld_reason,
            Some(PrvWithheldReason::RecordingTooShort)
        );
    }

    #[test]
    fn too_few_intervals_withholds_everything() {
        let cfg = PrvFrequencyConfig::default();
        let out = fd(&[800.0; 10], &cfg);
        assert_eq!(out.pp_interval_count, 10);
        assert_eq!(
            out.lf_withheld_reason,
            Some(PrvWithheldReason::TooFewIntervals)
        );
        assert_eq!(out.segment_seconds, None);
        assert_eq!(out.duration_seconds, 0.0);

        let empty = fd(&[], &cfg);
        assert_eq!(empty.pp_interval_count, 0);
        assert_eq!(
            empty.hf_withheld_reason,
            Some(PrvWithheldReason::TooFewIntervals)
        );
    }

    #[test]
    fn a_short_welch_segment_withholds_the_band_it_cannot_resolve() {
        // A 20 s segment holds only 0.8 cycles of 0.04 Hz, so LF is withheld
        // even though the recording itself is long enough.
        let cfg = PrvFrequencyConfig {
            segment_seconds: 20.0,
            ..PrvFrequencyConfig::default()
        };
        let out = fd(&modulated(300.0, 850.0, 40.0, 0.10), &cfg);
        assert_eq!(
            out.lf_withheld_reason,
            Some(PrvWithheldReason::SegmentTooShort)
        );
        // 20 s still holds 3 cycles of 0.15 Hz, so HF survives.
        assert_eq!(out.hf_withheld_reason, None);
        assert!((out.segment_seconds.unwrap() - 20.0).abs() < 1e-12);
    }

    #[test]
    fn a_metronomic_series_has_no_hf_power_so_the_ratio_is_withheld() {
        // A perfectly constant tachogram detrends to exactly zero, so both
        // bands are 0 and the ratio is 0/0 — withheld, not NaN, not 0.
        let cfg = PrvFrequencyConfig::default();
        let out = fd(&vec![800.0; 400], &cfg);
        assert_eq!(out.lf_ms2, Some(0.0));
        assert_eq!(out.hf_ms2, Some(0.0));
        assert_eq!(out.lf_hf_ratio, None);
        assert_eq!(
            out.ratio_withheld_reason,
            Some(PrvWithheldReason::HfPowerZero)
        );
    }

    #[test]
    fn withheld_reasons_serialize_as_camel_case_strings() {
        let json = serde_json::to_string(&PrvWithheldReason::RecordingTooShort).unwrap();
        assert_eq!(json, "\"recordingTooShort\"");
        let json = serde_json::to_string(&PrvWithheldReason::TooFewIntervals).unwrap();
        assert_eq!(json, "\"tooFewIntervals\"");
    }
}
