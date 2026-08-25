//! Property tests: invariants that must hold for *any* input, checked over
//! hundreds of pseudo-randomly generated series.
//!
//! Randomness comes from a deterministic SplitMix64 seeded per property, not
//! from a proptest dependency: the crate deliberately carries no dev
//! dependencies beyond serde, and a fixed seed makes a failure reproducible
//! from the test name alone. Each property prints the offending input on
//! failure, which is what a shrinker would have given us anyway for series
//! this small.

use elata_biosignal_features::{
    activation_epoch, clean_pp_intervals_ms, prv_frequency_domain, prv_time_domain,
    ActivationEpochConfig, NnCleanConfig, PrvFrequencyConfig, PrvTimeDomainConfig,
};

/// SplitMix64 — small, deterministic, and good enough for input generation.
struct Rng(u64);

impl Rng {
    fn new(seed: u64) -> Self {
        Self(seed)
    }

    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in `[0, 1)`.
    fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    /// Uniform in `[low, high)`.
    fn range(&mut self, low: f64, high: f64) -> f64 {
        low + self.unit() * (high - low)
    }

    fn below(&mut self, bound: usize) -> usize {
        (self.next_u64() % bound as u64) as usize
    }
}

/// A plausible PP-interval series, occasionally salted with the artefacts the
/// cleaner exists to remove.
fn arbitrary_intervals(rng: &mut Rng, count: usize) -> Vec<f64> {
    let mean = rng.range(500.0, 1200.0);
    let spread = rng.range(0.0, 60.0);
    (0..count)
        .map(|_| {
            let roll = rng.unit();
            if roll < 0.03 {
                rng.range(0.0, 300.0) // implausibly short
            } else if roll < 0.06 {
                rng.range(2000.0, 4000.0) // implausibly long
            } else {
                mean + rng.range(-spread, spread)
            }
        })
        .collect()
}

fn clean_cfg() -> NnCleanConfig {
    NnCleanConfig::default()
}

fn td_cfg() -> PrvTimeDomainConfig {
    PrvTimeDomainConfig::default()
}

const CASES: usize = 400;

// ------------------------------------------------------------------- PRV --

/// PRV describes the *spacing* of beats. Shifting every beat by a constant
/// delay — a camera pipeline latency, a clock offset — leaves the intervals
/// untouched, so every statistic must be bit-identical. This is the invariant
/// that catches an implementation accidentally depending on absolute time.
#[test]
fn prv_statistics_are_invariant_to_a_constant_time_shift() {
    let mut rng = Rng::new(0x00A1_1CE5_1234);
    for case in 0..CASES {
        let count = 3 + rng.below(60);
        let intervals = arbitrary_intervals(&mut rng, count);
        let shift_ms = rng.range(-5_000.0, 5_000.0);

        // Beat times shifted by a constant produce identical intervals.
        let mut beat_times = Vec::with_capacity(count + 1);
        let mut t = 0.0f64;
        beat_times.push(t);
        for &interval in &intervals {
            t += interval;
            beat_times.push(t);
        }
        let shifted: Vec<f64> = beat_times
            .iter()
            .map(|t| t + shift_ms)
            .collect::<Vec<f64>>()
            .windows(2)
            .map(|pair| pair[1] - pair[0])
            .collect();

        let base = prv_time_domain(&intervals, &clean_cfg(), &td_cfg());
        let moved = prv_time_domain(&shifted, &clean_cfg(), &td_cfg());
        assert_eq!(
            base.pp_interval_count, moved.pp_interval_count,
            "case {case}: shift changed the cleaned count"
        );
        for (name, a, b) in [
            ("meanNn", base.mean_nn_ms, moved.mean_nn_ms),
            ("sdnn", base.sdnn_ms, moved.sdnn_ms),
            ("rmssd", base.rmssd_ms, moved.rmssd_ms),
            ("sdsd", base.sdsd_ms, moved.sdsd_ms),
            ("sd1", base.sd1_ms, moved.sd1_ms),
            ("sd2", base.sd2_ms, moved.sd2_ms),
            ("pnn20", base.pnn20_percent, moved.pnn20_percent),
            ("pnn50", base.pnn50_percent, moved.pnn50_percent),
        ] {
            match (a, b) {
                (Some(a), Some(b)) => assert!(
                    (a - b).abs() <= 1e-9 * a.abs().max(1.0),
                    "case {case}: {name} moved under a constant shift ({a} vs {b})"
                ),
                (None, None) => {}
                _ => panic!("case {case}: {name} withholding changed under a constant shift"),
            }
        }
    }
}

/// Dispersion measures are square roots of sums of squares: they cannot be
/// negative, and they cannot be NaN for any finite input.
#[test]
fn prv_dispersion_metrics_are_non_negative_and_finite() {
    let mut rng = Rng::new(0x5DD1_5DD2);
    for case in 0..CASES {
        let count = rng.below(80);
        let intervals = arbitrary_intervals(&mut rng, count);
        let out = prv_time_domain(&intervals, &clean_cfg(), &td_cfg());
        for (name, value) in [
            ("sdnn", out.sdnn_ms),
            ("rmssd", out.rmssd_ms),
            ("sdsd", out.sdsd_ms),
            ("sd1", out.sd1_ms),
            ("sd2", out.sd2_ms),
        ] {
            if let Some(value) = value {
                assert!(
                    value.is_finite() && value >= 0.0,
                    "case {case}: {name} = {value} for {intervals:?}"
                );
            }
        }
        for (name, value) in [("pnn20", out.pnn20_percent), ("pnn50", out.pnn50_percent)] {
            if let Some(value) = value {
                assert!(
                    (0.0..=100.0).contains(&value),
                    "case {case}: {name} = {value} outside [0, 100]"
                );
            }
        }
    }
}

/// pNN20 counts every difference pNN50 counts, plus the ones between the two
/// thresholds, so it can never be the smaller of the pair.
#[test]
fn pnn20_always_dominates_pnn50() {
    let mut rng = Rng::new(0x9E11_2000);
    for case in 0..CASES {
        let count = 2 + rng.below(60);
        let intervals = arbitrary_intervals(&mut rng, count);
        let out = prv_time_domain(&intervals, &clean_cfg(), &td_cfg());
        if let (Some(short), Some(long)) = (out.pnn20_percent, out.pnn50_percent) {
            assert!(short >= long, "case {case}: pnn20 {short} < pnn50 {long}");
        }
    }
}

/// Scaling every interval by `k > 0` scales every millisecond-valued metric by
/// `k` (they are all homogeneous of degree 1) and leaves the unitless pNN
/// percentages alone in the limit. Only the ms metrics are asserted here; the
/// cleaner's median band is itself relative, so the same beats survive.
#[test]
fn prv_millisecond_metrics_scale_linearly_with_the_intervals() {
    let mut rng = Rng::new(0x5CA1_AB1E);
    for case in 0..CASES {
        // Keep the scaled series inside the physiologic range so cleaning
        // selects the same beats and the comparison stays meaningful.
        let count = 3 + rng.below(40);
        let mean = rng.range(700.0, 900.0);
        let intervals: Vec<f64> = (0..count).map(|_| mean + rng.range(-40.0, 40.0)).collect();
        let k = rng.range(0.8, 1.2);
        let scaled: Vec<f64> = intervals.iter().map(|v| v * k).collect();

        let base = prv_time_domain(&intervals, &clean_cfg(), &td_cfg());
        let big = prv_time_domain(&scaled, &clean_cfg(), &td_cfg());
        assert_eq!(base.pp_interval_count, big.pp_interval_count);
        for (name, a, b) in [
            ("meanNn", base.mean_nn_ms, big.mean_nn_ms),
            ("sdnn", base.sdnn_ms, big.sdnn_ms),
            ("rmssd", base.rmssd_ms, big.rmssd_ms),
            ("sd1", base.sd1_ms, big.sd1_ms),
        ] {
            if let (Some(a), Some(b)) = (a, b) {
                assert!(
                    (b - a * k).abs() <= 1e-6 * (a * k).abs().max(1.0),
                    "case {case}: {name} did not scale ({a} * {k} != {b})"
                );
            }
        }
    }
}

/// The cleaner may only ever remove: every kept interval came from the input,
/// is inside the physiologic range, and the tally adds up.
#[test]
fn cleaning_only_removes_and_the_tally_is_exact() {
    let mut rng = Rng::new(0x00C1_EA11);
    for case in 0..CASES {
        let count = rng.below(80);
        let intervals = arbitrary_intervals(&mut rng, count);
        let out = clean_pp_intervals_ms(&intervals, &clean_cfg());
        assert_eq!(out.input_count, intervals.len());
        assert_eq!(
            out.kept_ms.len() + out.implausible_count + out.ectopic_count,
            intervals.len(),
            "case {case}: tally does not add up"
        );
        assert!(out.kept_ms.len() <= intervals.len());
        for value in &out.kept_ms {
            assert!(
                *value >= NnCleanConfig::default().min_ms
                    && *value <= NnCleanConfig::default().max_ms,
                "case {case}: kept an implausible interval {value}"
            );
            assert!(
                intervals.iter().any(|v| v == value),
                "case {case}: invented an interval {value}"
            );
        }
        assert!((0.0..=1.0).contains(&out.usable_fraction));
    }
}

/// Cleaning is idempotent: re-cleaning an already-clean series is a no-op.
/// (The median of the kept set may shift, but no kept interval can then fall
/// outside a band centred on that new median — this pins that reasoning.)
#[test]
fn cleaning_is_idempotent() {
    let mut rng = Rng::new(0x1D3_9007);
    for case in 0..CASES {
        let count = rng.below(80);
        let intervals = arbitrary_intervals(&mut rng, count);
        let once = clean_pp_intervals_ms(&intervals, &clean_cfg());
        let twice = clean_pp_intervals_ms(&once.kept_ms, &clean_cfg());
        assert_eq!(
            once.kept_ms, twice.kept_ms,
            "case {case}: cleaning was not idempotent"
        );
    }
}

/// Band powers are integrals of a non-negative density: never negative, never
/// NaN. And a withheld band is never silently substituted with a number.
#[test]
fn prv_band_powers_are_non_negative_and_withholding_carries_a_reason() {
    let mut rng = Rng::new(0xBA47_D000);
    for case in 0..CASES {
        let count = rng.below(500);
        let intervals = arbitrary_intervals(&mut rng, count);
        let out = prv_frequency_domain(&intervals, &clean_cfg(), &PrvFrequencyConfig::default());
        for (name, value, reason) in [
            ("lf", out.lf_ms2, out.lf_withheld_reason),
            ("hf", out.hf_ms2, out.hf_withheld_reason),
            ("ratio", out.lf_hf_ratio, out.ratio_withheld_reason),
        ] {
            match value {
                Some(value) => {
                    assert!(
                        value.is_finite() && value >= 0.0,
                        "case {case}: {name} = {value}"
                    );
                    assert!(
                        reason.is_none(),
                        "case {case}: {name} reported AND withheld"
                    );
                }
                None => assert!(
                    reason.is_some(),
                    "case {case}: {name} withheld without a reason"
                ),
            }
        }
        assert!(out.duration_seconds >= 0.0);
    }
}

// ------------------------------------------------------- activation epoch --

/// A monotonically non-decreasing signal that clears the threshold rises, and
/// a rise rate is a rise over a positive span — it can never be negative.
#[test]
fn a_monotonically_rising_signal_has_a_non_negative_rise_rate() {
    let mut rng = Rng::new(0x215E_0001);
    for case in 0..CASES {
        let n = 200 + rng.below(200);
        let flat = 60 + rng.below(40);
        let step = rng.range(0.05, 2.0);
        let base = rng.range(-50.0, 50.0);
        let values: Vec<f64> = (0..n)
            .map(|i| {
                if i < flat {
                    base
                } else {
                    base + step * (i - flat + 1) as f64
                }
            })
            .collect();
        let (_, epoch, _) = activation_epoch(&values, 1.0, &ActivationEpochConfig::default());
        if let Some(epoch) = epoch {
            assert!(
                epoch.rise_rate_per_second >= 0.0 && epoch.rise_rate_per_second.is_finite(),
                "case {case}: rise rate {} for a rising ramp",
                epoch.rise_rate_per_second
            );
            assert!(
                epoch.peak_value >= base,
                "case {case}: peak below the baseline"
            );
            assert!(epoch.time_to_peak_seconds >= 0.0);
            assert!(epoch.area_above_baseline >= 0.0);
        }
    }
}

/// A signal that decays from its peak must report a recovery slope that is
/// negative (falling) or zero (a flat plateau) — never positive, which would
/// mean the "recovery" went the wrong way.
#[test]
fn a_decaying_signal_has_a_non_positive_recovery_slope() {
    let mut rng = Rng::new(0xDECA_1234);
    for case in 0..CASES {
        let base = rng.range(-20.0, 20.0);
        let amplitude = rng.range(5.0, 60.0);
        let rise_start = 80 + rng.below(30);
        let rise_len = 15 + rng.below(30);
        let decay_len = 30 + rng.below(200);
        let n = rise_start + rise_len + decay_len + 40;
        let values: Vec<f64> = (0..n)
            .map(|i| {
                if i < rise_start {
                    base
                } else if i < rise_start + rise_len {
                    base + amplitude * (i - rise_start + 1) as f64 / rise_len as f64
                } else {
                    let decayed = (i - rise_start - rise_len) as f64 / decay_len as f64;
                    base + amplitude * (1.0 - decayed).max(0.0)
                }
            })
            .collect();
        let (_, epoch, _) = activation_epoch(&values, 1.0, &ActivationEpochConfig::default());
        let Some(epoch) = epoch else { continue };
        let Some(recovery) = epoch.recovery else {
            continue;
        };
        assert!(
            recovery.recovery_slope_per_second <= 0.0
                && recovery.recovery_slope_per_second.is_finite(),
            "case {case}: recovery slope {} for a decaying signal",
            recovery.recovery_slope_per_second
        );
        // Half-recovery must never come after full recovery.
        if let (Some(half), Some(full)) = (
            recovery.time_to_half_recovery_seconds,
            recovery.time_to_baseline_seconds,
        ) {
            assert!(
                half <= full,
                "case {case}: half recovery {half} after full recovery {full}"
            );
        }
        // A completed recovery must have a time; an incomplete one must not.
        assert_eq!(
            recovery.recovery_completed,
            recovery.time_to_baseline_seconds.is_some(),
            "case {case}: recoveryCompleted contradicts timeToBaseline"
        );
    }
}

/// Structural invariants that must hold for any series at all, including
/// noise, constants and pathological shapes.
#[test]
fn activation_epoch_output_is_internally_consistent_for_any_series() {
    let mut rng = Rng::new(0x5721_1CE0);
    for case in 0..CASES {
        let n = rng.below(400);
        let shape = rng.below(4);
        let base = rng.range(-100.0, 100.0);
        let values: Vec<f64> = (0..n)
            .map(|i| match shape {
                0 => base,
                1 => base + rng.range(-5.0, 5.0),
                2 => base + (i as f64 / 10.0).sin() * rng.range(0.0, 30.0),
                _ => base + rng.range(-1.0, 1.0) + if i > n / 2 { 25.0 } else { 0.0 },
            })
            .collect();
        let rate = rng.range(0.1, 10.0);
        let (baseline, epoch, withheld) =
            activation_epoch(&values, rate, &ActivationEpochConfig::default());

        // Exactly one of epoch / withheld reason is set.
        assert_eq!(
            epoch.is_none(),
            withheld.is_some(),
            "case {case}: epoch and withheldReason disagree"
        );
        if let Some(baseline) = baseline {
            assert!(baseline.scale >= 0.0, "case {case}: negative robust scale");
            assert!(
                baseline.activation_threshold >= baseline.level,
                "case {case}: threshold below the baseline level"
            );
            assert!(baseline.sample_count >= 2);
        }
        let Some(epoch) = epoch else { continue };
        assert!(
            epoch.end_seconds >= epoch.start_seconds,
            "case {case}: epoch ends before it starts"
        );
        assert!(
            epoch.peak_seconds >= epoch.start_seconds && epoch.peak_seconds <= epoch.end_seconds,
            "case {case}: peak outside the epoch"
        );
        assert!(epoch.time_to_peak_seconds >= 0.0);
        assert!(
            epoch.duration_seconds >= 0.0 && epoch.duration_seconds.is_finite(),
            "case {case}: bad duration"
        );
        assert!(
            epoch.rise_rate_per_second.is_finite(),
            "case {case}: non-finite rise rate"
        );
        assert!(
            epoch.area_above_baseline.is_finite() && epoch.area_above_baseline >= 0.0,
            "case {case}: area {} above a baseline the epoch is above by definition",
            epoch.area_above_baseline
        );
        // Exactly one of recovery / recoveryWithheldReason is set.
        assert_eq!(
            epoch.recovery.is_none(),
            epoch.recovery_withheld_reason.is_some(),
            "case {case}: recovery and its withheld reason disagree"
        );
        if let Some(recovery) = epoch.recovery {
            assert!(recovery.observed_seconds >= 0.0);
            assert!(
                recovery.half_recovery_target >= recovery.baseline_return_target,
                "case {case}: half target below the baseline-return target"
            );
            for time in [
                recovery.time_to_half_recovery_seconds,
                recovery.time_to_baseline_seconds,
            ]
            .into_iter()
            .flatten()
            {
                assert!(
                    time > 0.0 && time <= recovery.observed_seconds + 1e-9,
                    "case {case}: recovery time {time} outside the observed window"
                );
            }
        }
    }
}

/// Adding a constant offset to every sample shifts the baseline, the threshold
/// and the peak by that constant, and leaves every *rate*, *time* and *area*
/// untouched — the detector must key off shape, not absolute level.
#[test]
fn activation_epoch_is_equivariant_under_a_constant_level_shift() {
    let mut rng = Rng::new(0x0FF5_E700);
    for case in 0..CASES {
        let n = 250 + rng.below(150);
        let rise_start = 80 + rng.below(30);
        let amplitude = rng.range(5.0, 50.0);
        let values: Vec<f64> = (0..n)
            .map(|i| {
                if i < rise_start {
                    0.0
                } else if i < rise_start + 60 {
                    amplitude
                } else {
                    0.0
                }
            })
            .collect();
        let offset = rng.range(-500.0, 500.0);
        let shifted: Vec<f64> = values.iter().map(|v| v + offset).collect();

        let cfg = ActivationEpochConfig::default();
        let (base_baseline, base_epoch, _) = activation_epoch(&values, 1.0, &cfg);
        let (shift_baseline, shift_epoch, _) = activation_epoch(&shifted, 1.0, &cfg);
        let (Some(a), Some(b)) = (base_epoch, shift_epoch) else {
            continue;
        };
        let scale = amplitude.abs().max(1.0);
        assert!(
            (b.peak_value - (a.peak_value + offset)).abs() <= 1e-9 * offset.abs().max(scale),
            "case {case}: peak did not shift with the level"
        );
        assert_eq!(
            a.start_seconds, b.start_seconds,
            "case {case}: onset moved under a constant offset"
        );
        assert!(
            (a.rise_rate_per_second - b.rise_rate_per_second).abs() <= 1e-9 * scale,
            "case {case}: rise rate moved under a constant offset"
        );
        assert!(
            (a.area_above_baseline - b.area_above_baseline).abs() <= 1e-6 * scale,
            "case {case}: area moved under a constant offset"
        );
        let (Some(a), Some(b)) = (base_baseline, shift_baseline) else {
            continue;
        };
        assert!((b.level - (a.level + offset)).abs() <= 1e-9 * offset.abs().max(scale));
        assert!((a.scale - b.scale).abs() <= 1e-9 * scale);
    }
}
