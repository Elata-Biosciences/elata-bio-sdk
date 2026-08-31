//! Parity for the pulse (PRV) and activation-epoch algorithms against the
//! Python-oracle golden fixtures in `packages/biosignal-analytics/fixtures/`.
//!
//! Three fixtures are covered:
//!
//! - `pulse/hrv_time_domain.json` — the fixture the retired TypeScript
//!   implementation was pinned against. Running the *new* Rust
//!   `prv_time_domain@1` against it is the migration proof: the rename and the
//!   added metrics changed no shared arithmetic.
//! - `pulse/prv_time_domain.json` — the extension (SDSD, pNN20, pNN50, SD1,
//!   SD2), oracle = the canonical numpy formulas.
//! - `pulse/prv_frequency_domain.json` — LF/HF/ratio, oracle =
//!   `scipy.signal.welch` over an `np.interp` tachogram.
//! - `activation/activation_epoch.json` — oracle = the numpy reference, plus a
//!   closed-form `analytic` block asserted independently.

use elata_biosignal_features::{
    activation_epoch, prv_frequency_domain, prv_time_domain, ActivationEpochConfig,
    ActivationWithheldReason, NnCleanConfig, PrvFrequencyConfig, PrvTimeDomainConfig,
    PrvWithheldReason,
};
use serde_json::Value;

fn load_fixture(relative: &str) -> Value {
    let path = format!(
        "{}/../../packages/biosignal-analytics/fixtures/{relative}",
        env!("CARGO_MANIFEST_DIR")
    );
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read fixture {path}: {e}"));
    serde_json::from_str(&raw).unwrap_or_else(|e| panic!("invalid fixture JSON {path}: {e}"))
}

fn numbers(value: &Value) -> Vec<f64> {
    value
        .as_array()
        .expect("array")
        .iter()
        .map(|v| v.as_f64().expect("number"))
        .collect()
}

fn assert_close(actual: f64, expected: f64, rtol: f64, atol: f64, context: &str) {
    let tolerance = atol + rtol * expected.abs();
    assert!(
        (actual - expected).abs() <= tolerance,
        "{context}: actual {actual} vs expected {expected} (rtol {rtol}, atol {atol})"
    );
}

/// Compare an `Option<f64>` against a fixture field that may be `null`.
/// A withheld value and a reported value are never interchangeable.
fn assert_optional(actual: Option<f64>, expected: &Value, rtol: f64, atol: f64, context: &str) {
    match (actual, expected.as_f64()) {
        (Some(actual), Some(expected)) => assert_close(actual, expected, rtol, atol, context),
        (None, None) => {
            assert!(
                expected.is_null(),
                "{context}: expected null, got {expected}"
            );
        }
        (actual, _) => panic!("{context}: actual {actual:?} vs expected {expected}"),
    }
}

// ------------------------------------------------------------ time domain --

#[test]
fn prv_time_domain_still_matches_the_retired_hrv_time_domain_fixture() {
    let fixture = load_fixture("pulse/hrv_time_domain.json");
    let atol = fixture["tolerances"]["atolMs"].as_f64().unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let intervals = numbers(&case["input"]["ibisMs"]);
        let actual = prv_time_domain(
            &intervals,
            &NnCleanConfig::default(),
            &PrvTimeDomainConfig::default(),
        );
        let expected = &case["expected"];

        // The cleaner must select exactly the same beats as before.
        assert_eq!(
            actual.pp_interval_count,
            expected["ibiCount"].as_u64().unwrap() as usize,
            "{name}: cleaned interval count"
        );
        let expected_cleaned = numbers(&expected["cleanedNnMs"]);
        assert_eq!(
            actual.pp_interval_count,
            expected_cleaned.len(),
            "{name}: cleaned length"
        );
        assert_close(
            actual.usable_interval_fraction,
            expected["usableIbiFraction"].as_f64().unwrap(),
            0.0,
            1e-12,
            &format!("{name}: usable fraction"),
        );
        for (field, actual_value) in [
            ("meanNnMs", actual.mean_nn_ms),
            ("sdnnMs", actual.sdnn_ms),
            ("rmssdMs", actual.rmssd_ms),
        ] {
            assert_optional(
                actual_value,
                &expected[field],
                0.0,
                atol,
                &format!("{name}: {field}"),
            );
        }
    }
}

#[test]
fn prv_time_domain_matches_the_numpy_oracle() {
    let fixture = load_fixture("pulse/prv_time_domain.json");
    let atol_ms = fixture["tolerances"]["atolMs"].as_f64().unwrap();
    let rtol = fixture["tolerances"]["rtol"].as_f64().unwrap();
    let mut case_count = 0usize;
    for case in fixture["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let intervals = numbers(&case["input"]["ibisMs"]);
        let actual = prv_time_domain(
            &intervals,
            &NnCleanConfig::default(),
            &PrvTimeDomainConfig::default(),
        );
        let expected = &case["expected"];

        assert_eq!(
            actual.pp_interval_count,
            expected["ppIntervalCount"].as_u64().unwrap() as usize,
            "{name}: interval count"
        );
        assert_close(
            actual.usable_interval_fraction,
            expected["usableIntervalFraction"].as_f64().unwrap(),
            0.0,
            1e-12,
            &format!("{name}: usable fraction"),
        );
        for (field, actual_value) in [
            ("meanNnMs", actual.mean_nn_ms),
            ("sdnnMs", actual.sdnn_ms),
            ("rmssdMs", actual.rmssd_ms),
            ("sdsdMs", actual.sdsd_ms),
            ("sd1Ms", actual.sd1_ms),
            ("sd2Ms", actual.sd2_ms),
        ] {
            assert_optional(
                actual_value,
                &expected[field],
                rtol,
                atol_ms,
                &format!("{name}: {field}"),
            );
        }
        for (field, actual_value) in [
            ("pnn20Percent", actual.pnn20_percent),
            ("pnn50Percent", actual.pnn50_percent),
            ("meanPulseRateBpm", actual.mean_pulse_rate_bpm),
        ] {
            assert_optional(
                actual_value,
                &expected[field],
                rtol,
                1e-9,
                &format!("{name}: {field}"),
            );
        }
        case_count += 1;
    }
    assert!(
        case_count >= 10,
        "expected the full case set, saw {case_count}"
    );
}

// ------------------------------------------------------- frequency domain --

fn withheld_reason(value: &Value) -> Option<PrvWithheldReason> {
    if value.is_null() {
        return None;
    }
    Some(serde_json::from_value(value.clone()).expect("known withheld reason"))
}

#[test]
fn prv_frequency_domain_matches_the_scipy_oracle() {
    let fixture = load_fixture("pulse/prv_frequency_domain.json");
    let rtol = fixture["tolerances"]["rtol"].as_f64().unwrap();
    let atol = fixture["tolerances"]["atolMs2"].as_f64().unwrap();
    let ratio_rtol = fixture["tolerances"]["ratioRtol"].as_f64().unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let intervals = numbers(&case["input"]["ibisMs"]);
        let actual = prv_frequency_domain(
            &intervals,
            &NnCleanConfig::default(),
            &PrvFrequencyConfig::default(),
        );
        let expected = &case["expected"];

        assert_eq!(
            actual.pp_interval_count,
            expected["ppIntervalCount"].as_u64().unwrap() as usize,
            "{name}: interval count"
        );
        assert_close(
            actual.duration_seconds,
            expected["durationSeconds"].as_f64().unwrap(),
            1e-9,
            1e-9,
            &format!("{name}: duration"),
        );
        assert_optional(
            actual.segment_seconds,
            &expected["segmentSeconds"],
            0.0,
            1e-9,
            &format!("{name}: segmentSeconds"),
        );
        assert_optional(
            actual.lf_ms2,
            &expected["lfMs2"],
            rtol,
            atol,
            &format!("{name}: lfMs2"),
        );
        assert_optional(
            actual.hf_ms2,
            &expected["hfMs2"],
            rtol,
            atol,
            &format!("{name}: hfMs2"),
        );
        assert_optional(
            actual.lf_hf_ratio,
            &expected["lfHfRatio"],
            ratio_rtol,
            1e-9,
            &format!("{name}: lfHfRatio"),
        );
        // Withholding is part of the contract, not an implementation detail:
        // the REASON has to match too, not just the null.
        for (field, actual_reason) in [
            ("lfWithheldReason", actual.lf_withheld_reason),
            ("hfWithheldReason", actual.hf_withheld_reason),
            ("ratioWithheldReason", actual.ratio_withheld_reason),
        ] {
            assert_eq!(
                actual_reason,
                withheld_reason(&expected[field]),
                "{name}: {field}"
            );
        }
    }
}

// -------------------------------------------------------- activation epoch --

fn activation_withheld(value: &Value) -> Option<ActivationWithheldReason> {
    if value.is_null() {
        return None;
    }
    Some(serde_json::from_value(value.clone()).expect("known withheld reason"))
}

#[test]
fn activation_epoch_matches_the_numpy_oracle() {
    let fixture = load_fixture("activation/activation_epoch.json");
    let rtol = fixture["tolerances"]["rtol"].as_f64().unwrap();
    let atol = fixture["tolerances"]["atol"].as_f64().unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let values = numbers(&case["input"]["values"]);
        let rate = case["input"]["sampleRateHz"].as_f64().unwrap();
        let (baseline, epoch, withheld) =
            activation_epoch(&values, rate, &ActivationEpochConfig::default());
        let expected = &case["expected"];

        assert_eq!(
            withheld,
            activation_withheld(&expected["withheldReason"]),
            "{name}: withheldReason"
        );

        match (&baseline, expected["baseline"].as_object()) {
            (Some(actual), Some(_)) => {
                let want = &expected["baseline"];
                for (field, actual_value) in [
                    ("startSeconds", actual.start_seconds),
                    ("endSeconds", actual.end_seconds),
                    ("level", actual.level),
                    ("scale", actual.scale),
                    ("activationThreshold", actual.activation_threshold),
                ] {
                    assert_close(
                        actual_value,
                        want[field].as_f64().unwrap(),
                        rtol,
                        atol,
                        &format!("{name}: baseline {field}"),
                    );
                }
                assert_eq!(
                    actual.sample_count,
                    want["sampleCount"].as_u64().unwrap() as usize,
                    "{name}: baseline sampleCount"
                );
            }
            (None, None) => {}
            _ => panic!("{name}: baseline presence mismatch"),
        }

        let Some(actual_epoch) = epoch else {
            assert!(
                expected["epoch"].is_null(),
                "{name}: epoch presence mismatch"
            );
            continue;
        };
        let want = &expected["epoch"];
        assert!(!want.is_null(), "{name}: epoch presence mismatch");
        for (field, actual_value) in [
            ("startSeconds", actual_epoch.start_seconds),
            ("endSeconds", actual_epoch.end_seconds),
            ("durationSeconds", actual_epoch.duration_seconds),
            ("peakValue", actual_epoch.peak_value),
            ("peakSeconds", actual_epoch.peak_seconds),
            ("timeToPeakSeconds", actual_epoch.time_to_peak_seconds),
            ("riseRatePerSecond", actual_epoch.rise_rate_per_second),
            ("areaAboveBaseline", actual_epoch.area_above_baseline),
        ] {
            assert_close(
                actual_value,
                want[field].as_f64().unwrap(),
                rtol,
                atol,
                &format!("{name}: epoch {field}"),
            );
        }
        assert_eq!(
            actual_epoch.sample_count,
            want["sampleCount"].as_u64().unwrap() as usize,
            "{name}: epoch sampleCount"
        );
        assert_eq!(
            actual_epoch.recovery_withheld_reason,
            activation_withheld(&want["recoveryWithheldReason"]),
            "{name}: recoveryWithheldReason"
        );

        let Some(actual_recovery) = actual_epoch.recovery else {
            assert!(
                want["recovery"].is_null(),
                "{name}: recovery presence mismatch"
            );
            continue;
        };
        let want_recovery = &want["recovery"];
        assert!(
            !want_recovery.is_null(),
            "{name}: recovery presence mismatch"
        );
        for (field, actual_value) in [
            ("observedSeconds", actual_recovery.observed_seconds),
            ("halfRecoveryTarget", actual_recovery.half_recovery_target),
            (
                "baselineReturnTarget",
                actual_recovery.baseline_return_target,
            ),
            (
                "recoverySlopePerSecond",
                actual_recovery.recovery_slope_per_second,
            ),
            ("residualFraction", actual_recovery.residual_fraction),
        ] {
            assert_close(
                actual_value,
                want_recovery[field].as_f64().unwrap(),
                rtol,
                atol,
                &format!("{name}: recovery {field}"),
            );
        }
        for (field, actual_value) in [
            (
                "timeToHalfRecoverySeconds",
                actual_recovery.time_to_half_recovery_seconds,
            ),
            (
                "timeToBaselineSeconds",
                actual_recovery.time_to_baseline_seconds,
            ),
        ] {
            assert_optional(
                actual_value,
                &want_recovery[field],
                rtol,
                atol,
                &format!("{name}: recovery {field}"),
            );
        }
        assert_eq!(
            actual_recovery.recovery_completed,
            want_recovery["recoveryCompleted"].as_bool().unwrap(),
            "{name}: recoveryCompleted"
        );
    }
}

/// The closed-form block: every metric of the piecewise-linear case worked out
/// by hand from the shape definition. This is what makes the numpy oracle
/// itself trustworthy — if the two blocks ever disagree, the fixture is wrong.
#[test]
fn activation_epoch_matches_the_closed_form_analytic_case() {
    let fixture = load_fixture("activation/activation_epoch.json");
    let case = fixture["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["name"] == "piecewise_linear_trapezoid")
        .expect("analytic case present");
    let analytic = &case["analytic"];
    assert!(!analytic.is_null(), "analytic block present");

    let values = numbers(&case["input"]["values"]);
    let rate = case["input"]["sampleRateHz"].as_f64().unwrap();
    let (baseline, epoch, withheld) =
        activation_epoch(&values, rate, &ActivationEpochConfig::default());
    assert_eq!(withheld, None);
    let baseline = baseline.expect("baseline");
    let epoch = epoch.expect("epoch");
    let recovery = epoch.recovery.expect("recovery");

    for (field, actual) in [
        ("baselineLevel", baseline.level),
        ("baselineScale", baseline.scale),
        ("activationThreshold", baseline.activation_threshold),
        ("startSeconds", epoch.start_seconds),
        ("endSeconds", epoch.end_seconds),
        ("peakValue", epoch.peak_value),
        ("peakSeconds", epoch.peak_seconds),
        ("timeToPeakSeconds", epoch.time_to_peak_seconds),
        ("riseRatePerSecond", epoch.rise_rate_per_second),
        ("areaAboveBaseline", epoch.area_above_baseline),
        ("halfRecoveryTarget", recovery.half_recovery_target),
        ("baselineReturnTarget", recovery.baseline_return_target),
        (
            "timeToHalfRecoverySeconds",
            recovery.time_to_half_recovery_seconds.unwrap(),
        ),
        (
            "timeToBaselineSeconds",
            recovery.time_to_baseline_seconds.unwrap(),
        ),
        ("recoverySlopePerSecond", recovery.recovery_slope_per_second),
        ("residualFraction", recovery.residual_fraction),
    ] {
        let expected = analytic[field].as_f64().unwrap();
        assert_close(actual, expected, 0.0, 1e-9, &format!("analytic {field}"));
    }
    assert!(recovery.recovery_completed);
}
