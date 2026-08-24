//! Parity against the Python-oracle golden fixtures in
//! `packages/biosignal-analytics/fixtures/` (workspace-relative path; fine
//! while the crate is `publish = false` — vendor a subset before publishing).

use elata_biosignal_features::{
    alpha_peak, band_powers_from_psd, dominant_frequency, eeg_window_quality, hjorth,
    spectral_entropy, welch_psd, window_stats, AlphaPeakConfig, BandsConfig, Psd, QualityConfig,
    WelchConfig, DOMINANT_FREQUENCY_RANGE_HZ,
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

fn case_samples(case: &Value) -> Vec<f32> {
    case["input"]["samples"]
        .as_array()
        .expect("samples array")
        .iter()
        .map(|v| v.as_f64().expect("sample number") as f32)
        .collect()
}

fn case_rate(case: &Value) -> f64 {
    case["input"]["sampleRateHz"]
        .as_f64()
        .expect("sampleRateHz")
}

fn case_psd(case: &Value) -> Psd {
    welch_psd(
        &case_samples(case),
        case_rate(case),
        &WelchConfig::default(),
    )
}

fn assert_close(actual: f64, expected: f64, rtol: f64, atol: f64, context: &str) {
    let tolerance = atol + rtol * expected.abs();
    assert!(
        (actual - expected).abs() <= tolerance,
        "{context}: actual {actual} vs expected {expected} (rtol {rtol}, atol {atol})"
    );
}

#[test]
fn welch_psd_matches_scipy() {
    let fixture = load_fixture("eeg/welch_psd.json");
    for case in fixture["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let psd = case_psd(case);
        let expected_freqs: Vec<f64> = case["expected"]["freqsHz"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_f64().unwrap())
            .collect();
        let expected_psd: Vec<f64> = case["expected"]["psd"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_f64().unwrap())
            .collect();
        assert_eq!(
            psd.freqs_hz.len(),
            expected_freqs.len(),
            "{name}: bin count"
        );
        for (i, (&actual, &expected)) in psd.freqs_hz.iter().zip(expected_freqs.iter()).enumerate()
        {
            assert!((actual - expected).abs() < 1e-9, "{name}: freq bin {i}");
        }
        // rtol 1e-3 with an absolute floor relative to the spectrum max
        // (near-zero bins of pure tones are pure roundoff in both pipelines).
        let max = expected_psd.iter().cloned().fold(0.0f64, f64::max);
        let atol = 1e-6 * max;
        for (i, (&actual, &expected)) in psd.psd.iter().zip(expected_psd.iter()).enumerate() {
            assert_close(
                actual,
                expected,
                1e-3,
                atol,
                &format!("{name}: psd bin {i}"),
            );
        }
    }
}

#[test]
fn band_powers_match_oracle() {
    let fixture = load_fixture("eeg/band_powers.json");
    let bands = BandsConfig::default();
    for case in fixture["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let powers = band_powers_from_psd(&case_psd(case), &bands);
        let expected = &case["expected"];
        for (band, actual_abs, actual_rel, actual_log) in [
            (
                "delta",
                powers.abs.delta,
                powers.rel.delta,
                powers.log.delta,
            ),
            (
                "theta",
                powers.abs.theta,
                powers.rel.theta,
                powers.log.theta,
            ),
            (
                "alpha",
                powers.abs.alpha,
                powers.rel.alpha,
                powers.log.alpha,
            ),
            ("beta", powers.abs.beta, powers.rel.beta, powers.log.beta),
            (
                "gamma",
                powers.abs.gamma,
                powers.rel.gamma,
                powers.log.gamma,
            ),
        ] {
            assert_close(
                actual_abs,
                expected["abs"][band].as_f64().unwrap(),
                1e-3,
                1e-9,
                &format!("{name}: abs {band}"),
            );
            assert_close(
                actual_rel,
                expected["rel"][band].as_f64().unwrap(),
                1e-3,
                1e-9,
                &format!("{name}: rel {band}"),
            );
            // log10 is a presentation transform of abs (already compared
            // above); only meaningful when the band carries real power —
            // near-floor bands are pure roundoff and their logs diverge.
            if expected["abs"][band].as_f64().unwrap() > 1e-8 {
                assert_close(
                    actual_log,
                    expected["log"][band].as_f64().unwrap(),
                    0.0,
                    1e-3,
                    &format!("{name}: log {band}"),
                );
            }
        }
    }
}

#[test]
fn spectral_entropy_and_dominant_frequency_match_oracle() {
    let fixture = load_fixture("eeg/spectral_entropy.json");
    for case in fixture["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let psd = case_psd(case);
        let entropy = spectral_entropy(&psd.psd);
        assert_close(
            entropy,
            case["expected"]["spectralEntropy"].as_f64().unwrap(),
            1e-3,
            0.0,
            &format!("{name}: entropy"),
        );
        let (low, high) = DOMINANT_FREQUENCY_RANGE_HZ;
        let dominant = dominant_frequency(&psd, low, high).expect("dominant expected");
        let expected = case["expected"]["dominantFrequencyHz"].as_f64().unwrap();
        assert!(
            (dominant - expected).abs() < 1e-9,
            "{name}: dominant {dominant} vs {expected}"
        );
    }
}

#[test]
fn alpha_peak_matches_oracle() {
    let fixture = load_fixture("eeg/alpha_peak.json");
    let cfg = AlphaPeakConfig::default();
    for case in fixture["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let actual = alpha_peak(&case_psd(case), &cfg);
        let expected = &case["expected"]["alphaPeakHz"];
        match (actual, expected.as_f64()) {
            (Some(actual_hz), Some(expected_hz)) => assert!(
                (actual_hz - expected_hz).abs() <= 0.25,
                "{name}: alpha {actual_hz} vs {expected_hz}"
            ),
            (None, None) => {}
            (actual, _) => panic!("{name}: alpha {actual:?} vs expected {expected}"),
        }
    }
}

#[test]
fn hjorth_and_window_stats_match_oracle() {
    let fixture = load_fixture("eeg/hjorth.json");
    for case in fixture["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let samples = case_samples(case);
        let actual_hjorth = hjorth(&samples);
        let expected_hjorth = &case["expected"]["hjorth"];
        for (field, actual) in [
            ("activity", actual_hjorth.activity),
            ("mobility", actual_hjorth.mobility),
            ("complexity", actual_hjorth.complexity),
        ] {
            assert_close(
                actual,
                expected_hjorth[field].as_f64().unwrap(),
                1e-4,
                0.0,
                &format!("{name}: hjorth {field}"),
            );
        }
        let actual_stats = window_stats(&samples);
        let expected_stats = &case["expected"]["windowStats"];
        for (field, actual) in [
            ("mean", actual_stats.mean),
            ("rms", actual_stats.rms),
            ("variance", actual_stats.variance),
            ("std", actual_stats.std),
            ("ptp", actual_stats.ptp),
        ] {
            assert_close(
                actual,
                expected_stats[field].as_f64().unwrap(),
                1e-4,
                1e-9,
                &format!("{name}: stats {field}"),
            );
        }
    }
}

#[test]
fn quality_flags_match_oracle() {
    let fixture = load_fixture("eeg/quality_flags.json");
    let cfg = QualityConfig::default();
    for case in fixture["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let samples = case_samples(case);
        let psd = case_psd(case);
        let actual = eeg_window_quality(&samples, &psd, &cfg);
        let expected = &case["expected"];
        for (field, actual_value) in [
            ("flatlineFraction", actual.flatline_fraction),
            ("clippedFraction", actual.clipped_fraction),
            (
                "extremeAmplitudeFraction",
                actual.extreme_amplitude_fraction,
            ),
        ] {
            assert_close(
                actual_value,
                expected[field].as_f64().unwrap(),
                0.0,
                1e-4,
                &format!("{name}: {field}"),
            );
        }
        assert_close(
            actual.line_noise_ratio,
            expected["lineNoiseRatio"].as_f64().unwrap(),
            1e-3,
            1e-6,
            &format!("{name}: lineNoiseRatio"),
        );
        assert_eq!(
            actual.usable,
            expected["usable"].as_bool().unwrap(),
            "{name}: usable"
        );
    }
}

#[test]
fn manifest_lists_every_fixture_file() {
    let manifest = load_fixture("manifest.json");
    for file in manifest["files"].as_array().unwrap() {
        let relative = file.as_str().unwrap();
        let _ = load_fixture(relative); // parses -> exists and is valid JSON
    }
}
