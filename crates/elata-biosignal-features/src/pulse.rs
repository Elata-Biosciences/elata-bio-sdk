//! Pulse-interval preparation: cleaning an inter-beat-interval (IBI) series
//! and turning it into a uniformly-sampled tachogram.
//!
//! NAMING. Elata's intervals come from a camera (rPPG), so they are
//! peak-to-peak (PP) intervals, not R-to-R intervals from an ECG. Everything
//! derived from them is *pulse*-rate variability (PRV), never heart-rate
//! variability — see [`crate::hrv`]. The field name `nn` survives only where
//! it is the literal name of the published algorithm (`nn_clean@1`) and of the
//! canonical metrics (MeanNN, SDNN); wherever a name is ours to choose, it
//! says pulse or PP.
//!
//! This module is the Rust replacement for the TypeScript
//! `packages/biosignal-analytics/src/pulse/ibi.ts` and is byte-for-byte
//! behaviour-compatible with it, so
//! `fixtures/pulse/hrv_time_domain.json` stays valid.

use crate::config::NnCleanConfig;
use serde::{Deserialize, Serialize};

/// Shortest physiologically plausible interval in ms (200 bpm).
pub const NN_MIN_MS: f64 = 300.0;
/// Longest physiologically plausible interval in ms (30 bpm).
pub const NN_MAX_MS: f64 = 2000.0;
/// Default deviation gate as a fraction of the in-range median.
pub const NN_MEDIAN_TOLERANCE: f64 = 0.3;

/// Outcome of [`clean_pp_intervals_ms`], with the rejection tally.
///
/// The tally is not decoration: `usable_fraction` is the honesty signal a
/// caller needs to decide whether a PRV number derived from these intervals
/// deserves to be shown at all.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CleanedIntervals {
    /// Kept intervals in ms, input order preserved.
    pub kept_ms: Vec<f64>,
    /// Intervals presented to the cleaner.
    pub input_count: usize,
    /// Rejected as non-finite or outside `[min_ms, max_ms]`.
    pub implausible_count: usize,
    /// Rejected as ectopic: in range, but further from the in-range median
    /// than `median_tolerance * median`.
    pub ectopic_count: usize,
    /// `kept / input` (0 for empty input).
    pub usable_fraction: f64,
}

/// Median of a slice (mean of the two central values for an even count).
///
/// Matches `numpy.median`. Non-finite values must be filtered out first; they
/// would otherwise poison the comparison sort.
pub(crate) fn median(values: &[f64]) -> f64 {
    if values.is_empty() {
        return f64::NAN;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).expect("non-finite value in median input"));
    let mid = sorted.len() / 2;
    if sorted.len().is_multiple_of(2) {
        (sorted[mid - 1] + sorted[mid]) / 2.0
    } else {
        sorted[mid]
    }
}

/// NN/PP-interval cleaning. `algorithm: nn_clean@1`.
///
/// Two stages, in order:
///
/// 1. **Implausible intervals.** Drop anything non-finite or outside
///    `[min_ms, max_ms]` — dropped beats, doubled detections and sensor
///    glitches. The surviving set defines the reference median.
/// 2. **Ectopic beats.** Drop in-range intervals more than
///    `median_tolerance * median` away from that median. An ectopic beat is a
///    short interval followed by a compensatory pause, and both halves of that
///    pair fall outside a ±30% band around the median, so both are removed.
///
/// Input order is preserved and no interpolation happens: successive-difference
/// metrics are computed over the kept sequence *as-is*, which is the same
/// convention as rppg-web's `computeRmssdMs` and NeuroKit2's default. That
/// convention matters — stitching the sequence back together would invent
/// differences across the removed beats.
pub fn clean_pp_intervals_ms(intervals_ms: &[f64], cfg: &NnCleanConfig) -> CleanedIntervals {
    let input_count = intervals_ms.len();
    let in_range: Vec<f64> = intervals_ms
        .iter()
        .copied()
        .filter(|v| v.is_finite() && *v >= cfg.min_ms && *v <= cfg.max_ms)
        .collect();
    let implausible_count = input_count - in_range.len();

    if in_range.is_empty() {
        return CleanedIntervals {
            kept_ms: Vec::new(),
            input_count,
            implausible_count,
            ectopic_count: 0,
            usable_fraction: 0.0,
        };
    }

    let center = median(&in_range);
    let tolerance = cfg.median_tolerance * center;
    let kept_ms: Vec<f64> = in_range
        .iter()
        .copied()
        .filter(|v| (*v - center).abs() <= tolerance)
        .collect();
    let ectopic_count = in_range.len() - kept_ms.len();
    let usable_fraction = if input_count > 0 {
        kept_ms.len() as f64 / input_count as f64
    } else {
        0.0
    };

    CleanedIntervals {
        kept_ms,
        input_count,
        implausible_count,
        ectopic_count,
        usable_fraction,
    }
}

/// A PP-interval series resampled onto a uniform time grid.
#[derive(Debug, Clone, PartialEq)]
pub struct Tachogram {
    /// Uniformly-spaced interval values in ms.
    pub values_ms: Vec<f64>,
    /// Grid rate in Hz.
    pub sample_rate_hz: f64,
    /// Span of the underlying beat series in seconds.
    pub duration_seconds: f64,
}

/// Uniformly-resampled NN tachogram. Part of `prv_frequency_domain@1`.
///
/// Interval `i` is timestamped at the beat that *terminates* it — i.e. at
/// `cumsum(intervals)[i] / 1000` seconds — so the series spans
/// `sum(intervals[1..]) / 1000` seconds. Resampling is **linear**
/// (`numpy.interp`), deliberately not cubic-spline: linear interpolation is
/// reproducible bit-for-bit between this crate and the Python oracle, and the
/// spline's extra smoothness would be invented information at the 4 Hz grid
/// this feeds.
///
/// Returns `None` for fewer than 2 intervals or a non-positive grid rate.
pub fn nn_tachogram(intervals_ms: &[f64], sample_rate_hz: f64) -> Option<Tachogram> {
    if intervals_ms.len() < 2 || !sample_rate_hz.is_finite() || sample_rate_hz <= 0.0 {
        return None;
    }
    let mut beat_times_s = Vec::with_capacity(intervals_ms.len());
    let mut cumulative = 0.0f64;
    for &interval in intervals_ms {
        cumulative += interval;
        beat_times_s.push(cumulative / 1000.0);
    }
    let start = beat_times_s[0];
    let duration_seconds = beat_times_s[beat_times_s.len() - 1] - start;
    if !duration_seconds.is_finite() || duration_seconds <= 0.0 {
        return None;
    }
    let point_count = (duration_seconds * sample_rate_hz).floor() as usize + 1;
    let mut values_ms = Vec::with_capacity(point_count);
    for k in 0..point_count {
        let t = start + k as f64 / sample_rate_hz;
        values_ms.push(interpolate_linear(&beat_times_s, intervals_ms, t));
    }
    Some(Tachogram {
        values_ms,
        sample_rate_hz,
        duration_seconds,
    })
}

/// `numpy.interp` for strictly increasing `xs`, clamping outside the range.
fn interpolate_linear(xs: &[f64], ys: &[f64], x: f64) -> f64 {
    if x <= xs[0] {
        return ys[0];
    }
    let last = xs.len() - 1;
    if x >= xs[last] {
        return ys[last];
    }
    // Binary search for the segment containing `x`.
    let mut low = 0usize;
    let mut high = last;
    while high - low > 1 {
        let mid = (low + high) / 2;
        if xs[mid] <= x {
            low = mid;
        } else {
            high = mid;
        }
    }
    let slope = (ys[high] - ys[low]) / (xs[high] - xs[low]);
    slope * (x - xs[low]) + ys[low]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> NnCleanConfig {
        NnCleanConfig::default()
    }

    #[test]
    fn median_matches_numpy_for_odd_and_even_counts() {
        assert_eq!(median(&[3.0, 1.0, 2.0]), 2.0);
        assert_eq!(median(&[4.0, 1.0, 3.0, 2.0]), 2.5);
        assert_eq!(median(&[7.0]), 7.0);
        assert!(median(&[]).is_nan());
    }

    #[test]
    fn cleaning_keeps_a_plausible_series_untouched() {
        let input = [800.0, 810.0, 790.0, 805.0];
        let out = clean_pp_intervals_ms(&input, &cfg());
        assert_eq!(out.kept_ms, input.to_vec());
        assert_eq!(out.implausible_count, 0);
        assert_eq!(out.ectopic_count, 0);
        assert_eq!(out.usable_fraction, 1.0);
    }

    #[test]
    fn cleaning_rejects_out_of_range_intervals() {
        // 150 ms and 2500 ms are outside [300, 2000].
        let out = clean_pp_intervals_ms(&[800.0, 150.0, 810.0, 2500.0, 790.0], &cfg());
        assert_eq!(out.kept_ms, vec![800.0, 810.0, 790.0]);
        assert_eq!(out.implausible_count, 2);
        assert_eq!(out.ectopic_count, 0);
        assert_eq!(out.input_count, 5);
    }

    #[test]
    fn cleaning_rejects_non_finite_intervals() {
        let out = clean_pp_intervals_ms(&[800.0, f64::NAN, 810.0, f64::INFINITY], &cfg());
        assert_eq!(out.kept_ms, vec![800.0, 810.0]);
        assert_eq!(out.implausible_count, 2);
    }

    #[test]
    fn cleaning_rejects_the_ectopic_pair() {
        // Median of the in-range set is ~800; a 400 ms ectopic beat and its
        // 1250 ms compensatory pause both fall outside +/-30%.
        let mut input = vec![800.0; 20];
        input[5] = 400.0;
        input[6] = 1250.0;
        let out = clean_pp_intervals_ms(&input, &cfg());
        assert_eq!(out.kept_ms.len(), 18);
        assert_eq!(out.ectopic_count, 2);
        assert_eq!(out.implausible_count, 0);
        assert!(out.kept_ms.iter().all(|v| *v == 800.0));
    }

    #[test]
    fn cleaning_preserves_input_order() {
        let out = clean_pp_intervals_ms(&[900.0, 700.0, 800.0, 850.0], &cfg());
        assert_eq!(out.kept_ms, vec![900.0, 700.0, 800.0, 850.0]);
    }

    #[test]
    fn cleaning_empty_and_all_rejected_inputs() {
        let empty = clean_pp_intervals_ms(&[], &cfg());
        assert!(empty.kept_ms.is_empty());
        assert_eq!(empty.usable_fraction, 0.0);
        assert_eq!(empty.input_count, 0);

        let all_bad = clean_pp_intervals_ms(&[100.0, 150.0, 2600.0], &cfg());
        assert!(all_bad.kept_ms.is_empty());
        assert_eq!(all_bad.implausible_count, 3);
        assert_eq!(all_bad.usable_fraction, 0.0);
    }

    #[test]
    fn tachogram_spans_the_beat_series_and_holds_a_constant_rate() {
        // 21 beats of exactly 800 ms => 16 s span from the first terminating
        // beat to the last, 4 Hz grid => 65 points, all exactly 800.
        let intervals = vec![800.0; 21];
        let tachogram = nn_tachogram(&intervals, 4.0).expect("tachogram");
        assert!((tachogram.duration_seconds - 16.0).abs() < 1e-12);
        assert_eq!(tachogram.values_ms.len(), 65);
        assert!(tachogram.values_ms.iter().all(|v| (v - 800.0).abs() < 1e-9));
    }

    #[test]
    fn tachogram_interpolates_linearly_between_beats() {
        // Beats terminate at 1.0 s and 2.0 s carrying 1000 and 2000 ms; the
        // 4 Hz grid point at 1.5 s must land exactly halfway.
        let tachogram = nn_tachogram(&[1000.0, 1000.0], 4.0).expect("tachogram");
        assert_eq!(tachogram.values_ms.len(), 5);
        assert!((tachogram.values_ms[0] - 1000.0).abs() < 1e-9);
        assert!((tachogram.values_ms[4] - 1000.0).abs() < 1e-9);

        let ramp = nn_tachogram(&[1000.0, 2000.0], 4.0).expect("tachogram");
        // Beat times 1.0 s and 3.0 s; grid 1.0, 1.25 .. 3.0 => 9 points.
        assert_eq!(ramp.values_ms.len(), 9);
        assert!((ramp.values_ms[0] - 1000.0).abs() < 1e-9);
        assert!((ramp.values_ms[4] - 1500.0).abs() < 1e-9);
        assert!((ramp.values_ms[8] - 2000.0).abs() < 1e-9);
    }

    #[test]
    fn tachogram_rejects_degenerate_inputs() {
        assert!(nn_tachogram(&[], 4.0).is_none());
        assert!(nn_tachogram(&[800.0], 4.0).is_none());
        assert!(nn_tachogram(&[800.0, 800.0], 0.0).is_none());
        assert!(nn_tachogram(&[800.0, 800.0], f64::NAN).is_none());
    }

    #[test]
    fn interpolate_linear_clamps_outside_the_grid() {
        let xs = [1.0, 2.0, 3.0];
        let ys = [10.0, 20.0, 30.0];
        assert_eq!(interpolate_linear(&xs, &ys, 0.0), 10.0);
        assert_eq!(interpolate_linear(&xs, &ys, 9.0), 30.0);
        assert!((interpolate_linear(&xs, &ys, 2.5) - 25.0).abs() < 1e-12);
    }

    #[test]
    fn custom_clean_config_is_honored() {
        let strict = NnCleanConfig {
            min_ms: 700.0,
            max_ms: 900.0,
            median_tolerance: 0.01,
        };
        let out = clean_pp_intervals_ms(&[800.0, 650.0, 805.0, 950.0], &strict);
        assert_eq!(out.kept_ms, vec![800.0, 805.0]);
        assert_eq!(out.implausible_count, 2);
    }
}
