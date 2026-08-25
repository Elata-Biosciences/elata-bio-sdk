//! Sustained-activation epoch detection with pre-epoch baseline and
//! post-epoch recovery. `algorithm: activation_epoch@1`.
//!
//! # What this measures
//!
//! Given one scalar physiological index sampled uniformly across a session
//! (an arousal index, a band-power ratio, a pulse-rate trace — anything where
//! "up" means activated), this finds the single sustained rise above resting
//! baseline, then characterizes how fast it rose, how much it accumulated, and
//! how it came back down. The recovery half is the missing input for the
//! downstream Recovery score, so the contract below is normative: consumers
//! read these fields, and a field that is `None` means **the recording could
//! not support that number**, never "zero" and never "no effect".
//!
//! # Output contract
//!
//! [`ActivationEpochResultV1`] has three nesting levels, each independently
//! withholdable:
//!
//! 1. **`baseline`** — `None` only when the whole result is withheld.
//! 2. **`epoch`** — `None` when no activation qualifies. `withheld_reason`
//!    then says why. All epoch metrics are non-optional *within* the struct:
//!    if the epoch exists, every one of them is defined.
//! 3. **`epoch.recovery`** — `None`, with `epoch.recovery_withheld_reason`
//!    set, when the recording stops less than `min_recovery_seconds` after the
//!    peak. Inside it, `time_to_half_recovery_seconds` and
//!    `time_to_baseline_seconds` are individually `None` when the signal never
//!    reached those targets before the recording ended, and
//!    `recovery_completed` is the explicit flag for that case.
//!
//! Whole-result withholding reasons ([`ActivationWithheldReason`]):
//!
//! | reason | when |
//! |---|---|
//! | `insufficientSamples` | fewer than 2 samples, non-finite values, or a non-positive sample rate |
//! | `baselineTooShort` | the leading baseline window spans less than `min_baseline_seconds` or holds under 2 samples |
//! | `noQualifyingActivation` | no above-threshold run lasts `min_sustained_seconds` |
//!
//! # Algorithm
//!
//! Sample `k` sits at `k / sample_rate_hz` seconds.
//!
//! 1. **Baseline.** The leading `baseline_window_seconds` of the recording.
//!    `level = median`, `scale = 1.4826 * MAD` — the robust pair, so a single
//!    artefact in the baseline cannot move the threshold the way a mean and
//!    standard deviation would.
//! 2. **Threshold.** `level + max(activation_k * scale, min_absolute_rise)`.
//! 3. **Onset.** Scanning forward from the end of the baseline window, the
//!    first contiguous run of samples strictly above the threshold that lasts
//!    at least `min_sustained_seconds` (measured `(last - first) / fs`). Only
//!    the **first** qualifying run is reported: this is a session-level "did
//!    the stimulus land" epoch, not a general-purpose event detector.
//! 4. **Epoch metrics.** Peak is the maximum in the run (earliest index on
//!    ties). `time_to_peak_seconds` runs from epoch start.
//!    `area_above_baseline` is the trapezoid rule over `(value - level)`
//!    across the run. `rise_rate_per_second` divides the peak's rise above
//!    baseline by the span from the **last pre-onset sample** to the peak —
//!    not from onset, because an epoch that peaks on its very first sample
//!    would otherwise divide by zero. That span is always at least one sample
//!    period, so the rate is finite and strictly positive.
//! 5. **Recovery.** Measured from the **peak**, not from epoch end (epoch end
//!    is a threshold crossing, which is itself part of the recovery).
//!    `half_recovery_target = level + 0.5 * amplitude` and
//!    `baseline_return_target = level + recovery_fraction * amplitude`, where
//!    `amplitude = peak - level`. The two times are delays from the peak to
//!    the first sample at or below each target. `recovery_slope_per_second`
//!    runs from the peak to the baseline-return sample when recovery
//!    completed, and to the last sample of the recording otherwise; it is
//!    ≤ 0 for any signal that decays from its peak.

use crate::config::ActivationEpochConfig;
use crate::pulse::median;
use serde::{Deserialize, Serialize};

/// Consistency-scaling constant turning a MAD into a standard-deviation-like
/// scale for normally distributed data (`robust_stats@1`).
pub const MAD_SCALE: f64 = 1.4826;

/// Why an activation epoch (or its recovery block) was withheld.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActivationWithheldReason {
    /// Fewer than 2 samples, a non-finite sample, or a non-positive rate.
    InsufficientSamples,
    /// The leading baseline window is too short to characterize rest.
    BaselineTooShort,
    /// No above-threshold run lasted `min_sustained_seconds`.
    NoQualifyingActivation,
    /// The recording stops less than `min_recovery_seconds` after the peak,
    /// so no recovery metric is observable. Applies to the recovery block
    /// only — the epoch metrics still stand.
    PostEpochWindowTooShort,
}

/// The pre-epoch baseline the epoch is measured against.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActivationBaseline {
    pub start_seconds: f64,
    /// Time of the last baseline sample.
    pub end_seconds: f64,
    pub sample_count: usize,
    /// Median of the baseline window (the resting level).
    pub level: f64,
    /// `1.4826 * MAD` of the baseline window.
    pub scale: f64,
    /// `level + max(activation_k * scale, min_absolute_rise)`.
    pub activation_threshold: f64,
}

/// Post-epoch recovery, measured from the peak.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActivationRecovery {
    /// Recording time available after the peak.
    pub observed_seconds: f64,
    /// `level + 0.5 * (peak - level)`.
    pub half_recovery_target: f64,
    /// `level + recovery_fraction * (peak - level)`.
    pub baseline_return_target: f64,
    /// Delay from peak to the first sample at or below the half target;
    /// `None` when the signal never got there before the recording ended.
    pub time_to_half_recovery_seconds: Option<f64>,
    /// Delay from peak to the first sample at or below the baseline target;
    /// `None` when recovery did not complete.
    pub time_to_baseline_seconds: Option<f64>,
    /// True iff `time_to_baseline_seconds` is `Some`.
    pub recovery_completed: bool,
    /// Slope from the peak to the recovery end (signal units per second).
    /// Negative for a decaying signal, 0 for a flat plateau.
    pub recovery_slope_per_second: f64,
    /// `(last sample - level) / amplitude`: how much of the activation was
    /// still present when the recording stopped. 0 means fully back.
    pub residual_fraction: f64,
}

/// The detected activation epoch.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActivationEpochMetrics {
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub duration_seconds: f64,
    pub sample_count: usize,
    pub peak_value: f64,
    pub peak_seconds: f64,
    /// `peak_seconds - start_seconds`; 0 when the epoch peaks on its first
    /// sample.
    pub time_to_peak_seconds: f64,
    /// `(peak - level)` divided by the span from the last pre-onset sample to
    /// the peak. Always finite and strictly positive.
    pub rise_rate_per_second: f64,
    /// Trapezoidal integral of `(value - level)` over the epoch, in signal
    /// units × seconds.
    pub area_above_baseline: f64,
    pub recovery: Option<ActivationRecovery>,
    /// Set iff `recovery` is `None`.
    pub recovery_withheld_reason: Option<ActivationWithheldReason>,
}

/// Detect the sustained activation epoch in a uniformly-sampled index.
/// `algorithm: activation_epoch@1`. See the module docs for the contract.
pub fn activation_epoch(
    values: &[f64],
    sample_rate_hz: f64,
    cfg: &ActivationEpochConfig,
) -> (
    Option<ActivationBaseline>,
    Option<ActivationEpochMetrics>,
    Option<ActivationWithheldReason>,
) {
    let n = values.len();
    if n < 2
        || !sample_rate_hz.is_finite()
        || sample_rate_hz <= 0.0
        || values.iter().any(|v| !v.is_finite())
    {
        return (
            None,
            None,
            Some(ActivationWithheldReason::InsufficientSamples),
        );
    }
    let dt = 1.0 / sample_rate_hz;

    // --- 1. Baseline -----------------------------------------------------
    let baseline_count = ((cfg.baseline_window_seconds * sample_rate_hz).floor() as usize).min(n);
    let baseline_span = if baseline_count >= 1 {
        (baseline_count - 1) as f64 * dt
    } else {
        0.0
    };
    if baseline_count < 2 || baseline_span < cfg.min_baseline_seconds {
        return (None, None, Some(ActivationWithheldReason::BaselineTooShort));
    }
    let baseline_values = &values[..baseline_count];
    let level = median(baseline_values);
    let deviations: Vec<f64> = baseline_values.iter().map(|v| (v - level).abs()).collect();
    let scale = MAD_SCALE * median(&deviations);
    let activation_threshold = level + (cfg.activation_k * scale).max(cfg.min_absolute_rise);
    let baseline = ActivationBaseline {
        start_seconds: 0.0,
        end_seconds: baseline_span,
        sample_count: baseline_count,
        level,
        scale,
        activation_threshold,
    };

    // --- 2. Onset: the first sustained above-threshold run ----------------
    let mut epoch_bounds: Option<(usize, usize)> = None;
    let mut idx = baseline_count;
    while idx < n {
        if values[idx] <= activation_threshold {
            idx += 1;
            continue;
        }
        let start = idx;
        let mut end = idx;
        while end + 1 < n && values[end + 1] > activation_threshold {
            end += 1;
        }
        if (end - start) as f64 * dt >= cfg.min_sustained_seconds {
            epoch_bounds = Some((start, end));
            break;
        }
        idx = end + 1;
    }
    let Some((start_idx, end_idx)) = epoch_bounds else {
        return (
            Some(baseline),
            None,
            Some(ActivationWithheldReason::NoQualifyingActivation),
        );
    };

    // --- 3. Epoch metrics -------------------------------------------------
    let run = &values[start_idx..=end_idx];
    let mut peak_offset = 0usize;
    for (offset, &value) in run.iter().enumerate() {
        if value > run[peak_offset] {
            peak_offset = offset;
        }
    }
    let peak_idx = start_idx + peak_offset;
    let peak_value = values[peak_idx];
    let start_seconds = start_idx as f64 * dt;
    let end_seconds = end_idx as f64 * dt;
    let peak_seconds = peak_idx as f64 * dt;

    // Trapezoid rule over (value - level), matching numpy.trapezoid.
    let mut area_above_baseline = 0.0f64;
    for pair in run.windows(2) {
        area_above_baseline += ((pair[0] - level) + (pair[1] - level)) / 2.0 * dt;
    }

    // Rise measured from the last pre-onset sample, so the span is never 0.
    let pre_onset_seconds = (start_idx as f64 - 1.0) * dt;
    let rise_rate_per_second = (peak_value - level) / (peak_seconds - pre_onset_seconds);

    // --- 4. Recovery ------------------------------------------------------
    let observed_seconds = (n - 1 - peak_idx) as f64 * dt;
    let (recovery, recovery_withheld_reason) = if observed_seconds < cfg.min_recovery_seconds {
        (
            None,
            Some(ActivationWithheldReason::PostEpochWindowTooShort),
        )
    } else {
        let amplitude = peak_value - level;
        let half_recovery_target = level + 0.5 * amplitude;
        let baseline_return_target = level + cfg.recovery_fraction * amplitude;
        let first_at_or_below =
            |target: f64| -> Option<usize> { (peak_idx + 1..n).find(|&i| values[i] <= target) };
        let half_idx = first_at_or_below(half_recovery_target);
        let baseline_idx = first_at_or_below(baseline_return_target);
        let recovery_end_idx = baseline_idx.unwrap_or(n - 1);
        let span = (recovery_end_idx - peak_idx) as f64 * dt;
        let recovery_slope_per_second = if span > 0.0 {
            (values[recovery_end_idx] - peak_value) / span
        } else {
            0.0
        };
        let residual_fraction = if amplitude > 0.0 {
            (values[n - 1] - level) / amplitude
        } else {
            0.0
        };
        (
            Some(ActivationRecovery {
                observed_seconds,
                half_recovery_target,
                baseline_return_target,
                time_to_half_recovery_seconds: half_idx.map(|i| (i - peak_idx) as f64 * dt),
                time_to_baseline_seconds: baseline_idx.map(|i| (i - peak_idx) as f64 * dt),
                recovery_completed: baseline_idx.is_some(),
                recovery_slope_per_second,
                residual_fraction,
            }),
            None,
        )
    };

    (
        Some(baseline),
        Some(ActivationEpochMetrics {
            start_seconds,
            end_seconds,
            duration_seconds: end_seconds - start_seconds,
            sample_count: end_idx - start_idx + 1,
            peak_value,
            peak_seconds,
            time_to_peak_seconds: peak_seconds - start_seconds,
            rise_rate_per_second,
            area_above_baseline,
            recovery,
            recovery_withheld_reason,
        }),
        None,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> ActivationEpochConfig {
        ActivationEpochConfig::default()
    }

    /// The closed-form case: flat baseline 10.0, +1.0/s rise from t=100 to a
    /// peak of 50.0 at t=140, plateau to t=180, -0.25/s decay to 10.0 at
    /// t=340, flat to t=399. Every metric below is worked out by hand in
    /// `gen_activation_fixtures.py`.
    fn trapezoid() -> Vec<f64> {
        (0..400)
            .map(|t| {
                let t = t as f64;
                if t <= 100.0 {
                    10.0
                } else if t <= 140.0 {
                    10.0 + (t - 100.0)
                } else if t <= 180.0 {
                    50.0
                } else if t <= 340.0 {
                    50.0 - 0.25 * (t - 180.0)
                } else {
                    10.0
                }
            })
            .collect()
    }

    #[test]
    fn trapezoid_matches_the_closed_form_solution() {
        let (baseline, epoch, withheld) = activation_epoch(&trapezoid(), 1.0, &cfg());
        assert_eq!(withheld, None);
        let baseline = baseline.expect("baseline");
        assert_eq!(baseline.level, 10.0);
        assert_eq!(baseline.scale, 0.0);
        assert_eq!(baseline.activation_threshold, 10.0);
        assert_eq!(baseline.sample_count, 60);
        assert_eq!(baseline.end_seconds, 59.0);

        let epoch = epoch.expect("epoch");
        assert_eq!(epoch.start_seconds, 101.0);
        assert_eq!(epoch.end_seconds, 339.0);
        assert_eq!(epoch.peak_value, 50.0);
        assert_eq!(epoch.peak_seconds, 140.0);
        assert_eq!(epoch.time_to_peak_seconds, 39.0);
        // (50 - 10) / (140 - 100)
        assert!((epoch.rise_rate_per_second - 1.0).abs() < 1e-12);
        assert!((epoch.area_above_baseline - 5599.375).abs() < 1e-9);

        let recovery = epoch.recovery.expect("recovery");
        assert_eq!(recovery.half_recovery_target, 30.0);
        assert_eq!(recovery.baseline_return_target, 14.0);
        assert_eq!(recovery.time_to_half_recovery_seconds, Some(120.0));
        assert_eq!(recovery.time_to_baseline_seconds, Some(184.0));
        assert!(recovery.recovery_completed);
        assert!((recovery.recovery_slope_per_second - (-36.0 / 184.0)).abs() < 1e-12);
        assert_eq!(recovery.residual_fraction, 0.0);
        assert_eq!(epoch.recovery_withheld_reason, None);
    }

    #[test]
    fn a_flat_recording_yields_no_activation() {
        let (baseline, epoch, withheld) = activation_epoch(&vec![10.0; 400], 1.0, &cfg());
        assert!(baseline.is_some());
        assert!(epoch.is_none());
        assert_eq!(
            withheld,
            Some(ActivationWithheldReason::NoQualifyingActivation)
        );
    }

    #[test]
    fn a_brief_spike_is_rejected_by_the_sustain_floor() {
        let mut values = vec![10.0; 400];
        // 5 s excursion, under the 10 s sustain floor.
        for value in values.iter_mut().take(205).skip(200) {
            *value = 40.0;
        }
        let (_, epoch, withheld) = activation_epoch(&values, 1.0, &cfg());
        assert!(epoch.is_none());
        assert_eq!(
            withheld,
            Some(ActivationWithheldReason::NoQualifyingActivation)
        );

        // Widen it past the floor and the same shape now qualifies.
        for value in values.iter_mut().take(230).skip(200) {
            *value = 40.0;
        }
        let (_, epoch, withheld) = activation_epoch(&values, 1.0, &cfg());
        assert_eq!(withheld, None);
        assert_eq!(epoch.expect("epoch").start_seconds, 200.0);
    }

    #[test]
    fn only_the_first_qualifying_activation_is_reported() {
        let values: Vec<f64> = (0..400)
            .map(|t| match t {
                100..=139 => 30.0,
                250..=319 => 45.0,
                _ => 10.0,
            })
            .collect();
        let (_, epoch, _) = activation_epoch(&values, 1.0, &cfg());
        let epoch = epoch.expect("epoch");
        assert_eq!(epoch.start_seconds, 100.0);
        assert_eq!(epoch.end_seconds, 139.0);
        // The larger, later 45.0 excursion must NOT become the peak.
        assert_eq!(epoch.peak_value, 30.0);
        // Peaks on its first sample: time-to-peak is 0 and the rise rate is
        // still finite, measured over the one pre-onset sample period.
        assert_eq!(epoch.time_to_peak_seconds, 0.0);
        assert!((epoch.rise_rate_per_second - 20.0).abs() < 1e-12);
    }

    #[test]
    fn baseline_too_short_withholds_everything() {
        let (baseline, epoch, withheld) = activation_epoch(&[10.0; 15], 1.0, &cfg());
        assert!(baseline.is_none());
        assert!(epoch.is_none());
        assert_eq!(withheld, Some(ActivationWithheldReason::BaselineTooShort));
    }

    #[test]
    fn degenerate_inputs_withhold_rather_than_guess() {
        for (values, rate) in [
            (vec![], 1.0),
            (vec![10.0], 1.0),
            (vec![10.0; 400], 0.0),
            (vec![10.0; 400], -1.0),
            (vec![10.0; 400], f64::NAN),
        ] {
            let (_, _, withheld) = activation_epoch(&values, rate, &cfg());
            assert_eq!(
                withheld,
                Some(ActivationWithheldReason::InsufficientSamples)
            );
        }
        let mut with_nan = vec![10.0; 400];
        with_nan[7] = f64::NAN;
        let (_, _, withheld) = activation_epoch(&with_nan, 1.0, &cfg());
        assert_eq!(
            withheld,
            Some(ActivationWithheldReason::InsufficientSamples)
        );
    }

    #[test]
    fn a_peak_at_the_recording_end_withholds_only_the_recovery_block() {
        // Rises to a peak 4 s before the recording stops.
        let values: Vec<f64> = (0..155)
            .map(|t| {
                let t = t as f64;
                if t <= 100.0 {
                    10.0
                } else if t <= 150.0 {
                    10.0 + 0.8 * (t - 100.0)
                } else {
                    50.0
                }
            })
            .collect();
        let (_, epoch, withheld) = activation_epoch(&values, 1.0, &cfg());
        assert_eq!(withheld, None, "the epoch itself is still reportable");
        let epoch = epoch.expect("epoch");
        assert_eq!(epoch.peak_seconds, 150.0);
        assert!(epoch.recovery.is_none());
        assert_eq!(
            epoch.recovery_withheld_reason,
            Some(ActivationWithheldReason::PostEpochWindowTooShort)
        );
    }

    #[test]
    fn a_plateau_that_never_comes_down_reports_incomplete_recovery() {
        let values: Vec<f64> = (0..200)
            .map(|t| {
                let t = t as f64;
                if t <= 100.0 {
                    10.0
                } else if t <= 140.0 {
                    10.0 + (t - 100.0)
                } else {
                    50.0
                }
            })
            .collect();
        let (_, epoch, _) = activation_epoch(&values, 1.0, &cfg());
        let recovery = epoch.expect("epoch").recovery.expect("recovery observable");
        assert!(!recovery.recovery_completed);
        assert_eq!(recovery.time_to_baseline_seconds, None);
        assert_eq!(recovery.time_to_half_recovery_seconds, None);
        // Flat plateau: the slope is exactly 0, not negative and not withheld.
        assert_eq!(recovery.recovery_slope_per_second, 0.0);
        assert_eq!(recovery.residual_fraction, 1.0);
    }

    #[test]
    fn the_robust_baseline_ignores_a_single_artefact() {
        // One enormous outlier in the baseline must not raise the threshold.
        let mut clean = vec![10.0; 400];
        let mut with_artefact = clean.clone();
        with_artefact[30] = 5000.0;
        for values in [&mut clean, &mut with_artefact] {
            for value in values.iter_mut().take(200).skip(150) {
                *value = 40.0;
            }
        }
        let (base_a, epoch_a, _) = activation_epoch(&clean, 1.0, &cfg());
        let (base_b, epoch_b, _) = activation_epoch(&with_artefact, 1.0, &cfg());
        assert_eq!(
            base_a.unwrap().activation_threshold,
            base_b.unwrap().activation_threshold
        );
        assert_eq!(
            epoch_a.unwrap().start_seconds,
            epoch_b.unwrap().start_seconds
        );
    }

    #[test]
    fn the_sample_rate_scales_every_time_metric() {
        // The same shape at 2 Hz must halve every duration.
        let values = trapezoid();
        let (_, slow, _) = activation_epoch(&values, 1.0, &cfg());
        let fast_cfg = ActivationEpochConfig {
            baseline_window_seconds: 30.0,
            min_baseline_seconds: 10.0,
            min_sustained_seconds: 5.0,
            min_recovery_seconds: 5.0,
            ..cfg()
        };
        let (_, fast, _) = activation_epoch(&values, 2.0, &fast_cfg);
        let slow = slow.expect("slow epoch");
        let fast = fast.expect("fast epoch");
        assert!((fast.start_seconds - slow.start_seconds / 2.0).abs() < 1e-9);
        assert!((fast.time_to_peak_seconds - slow.time_to_peak_seconds / 2.0).abs() < 1e-9);
        // Rate doubles, area halves (same samples, half the time span).
        assert!((fast.rise_rate_per_second - slow.rise_rate_per_second * 2.0).abs() < 1e-9);
        assert!((fast.area_above_baseline - slow.area_above_baseline / 2.0).abs() < 1e-6);
    }

    #[test]
    fn min_absolute_rise_floors_the_threshold_on_a_degenerate_baseline() {
        // A flat baseline has scale 0, so without a floor any excursion at all
        // trips the detector; the floor is how a caller demands a real rise.
        let mut values = vec![10.0; 400];
        for value in values.iter_mut().take(250).skip(150) {
            *value = 10.5;
        }
        let (_, epoch, _) = activation_epoch(&values, 1.0, &cfg());
        assert!(epoch.is_some(), "no floor: the 0.5 rise qualifies");

        let floored = ActivationEpochConfig {
            min_absolute_rise: 2.0,
            ..cfg()
        };
        let (_, epoch, withheld) = activation_epoch(&values, 1.0, &floored);
        assert!(epoch.is_none());
        assert_eq!(
            withheld,
            Some(ActivationWithheldReason::NoQualifyingActivation)
        );
    }

    #[test]
    fn withheld_reasons_serialize_as_camel_case_strings() {
        assert_eq!(
            serde_json::to_string(&ActivationWithheldReason::NoQualifyingActivation).unwrap(),
            "\"noQualifyingActivation\""
        );
        assert_eq!(
            serde_json::to_string(&ActivationWithheldReason::PostEpochWindowTooShort).unwrap(),
            "\"postEpochWindowTooShort\""
        );
    }
}
