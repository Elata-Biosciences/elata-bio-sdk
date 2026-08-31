//! Coarse-grained analyzers — one call per unit of work, never one per metric:
//!
//! - [`EegWindowAnalyzer`]: every v1 EEG feature for every channel of one
//!   window, sharing a single Welch PSD per channel.
//! - [`PrvAnalyzer`]: time- and frequency-domain pulse-rate variability for
//!   one interval series, sharing a single cleaning pass.
//! - [`ActivationEpochAnalyzer`]: the sustained-activation epoch of one
//!   session-length index series.
//!
//! Each holds its parsed configuration and stamps every result with the
//! configuration's stable id plus the `algorithm@version` map, so a persisted
//! observation stays attributable and recomputable.

use crate::activation_epoch::activation_epoch;
use crate::config::{ActivationEpochConfig, ConfigError, EegWindowConfig, PrvConfig};
use crate::eeg::{band_powers_from_psd, hjorth};
use crate::hrv::{prv_frequency_domain_from_cleaned, prv_time_domain_from_cleaned};
use crate::pulse::clean_pp_intervals_ms;
use crate::quality::eeg_window_quality;
use crate::result::{
    activation_algorithm_versions_map, algorithm_versions_map, prv_algorithm_versions_map,
    ActivationEpochResultV1, EegWindowFeaturesV1, PrvSummaryV1, PsdOutput, ACTIVATION_EPOCH_SCHEMA,
    DOMINANT_FREQUENCY_RANGE_HZ, EEG_WINDOW_FEATURES_SCHEMA, PRV_SUMMARY_SCHEMA,
};
use crate::spectral::{alpha_peak, dominant_frequency, spectral_entropy, welch_psd};
use crate::statistics::window_stats;

/// Reusable analyzer bound to a sample rate, channel count, and configuration.
#[derive(Debug, Clone)]
pub struct EegWindowAnalyzer {
    sample_rate_hz: f64,
    channel_count: usize,
    config: EegWindowConfig,
    config_id: String,
}

impl EegWindowAnalyzer {
    /// Build from an optional JSON configuration (defaults on `None`).
    pub fn new(
        sample_rate_hz: f32,
        channel_count: usize,
        config_json: Option<&str>,
    ) -> Result<Self, ConfigError> {
        let config = EegWindowConfig::from_json(config_json)?;
        Self::from_config(sample_rate_hz, channel_count, config)
    }

    /// Build from an already-parsed configuration.
    pub fn from_config(
        sample_rate_hz: f32,
        channel_count: usize,
        config: EegWindowConfig,
    ) -> Result<Self, ConfigError> {
        if sample_rate_hz.is_nan() || sample_rate_hz <= 0.0 {
            return Err(ConfigError("sampleRateHz must be > 0".into()));
        }
        if channel_count == 0 {
            return Err(ConfigError("channelCount must be >= 1".into()));
        }
        config.validate()?;
        let config_id = config.config_id();
        Ok(Self {
            sample_rate_hz: f64::from(sample_rate_hz),
            channel_count,
            config,
            config_id,
        })
    }

    /// Stable hash of the resolved configuration (provenance).
    pub fn config_id(&self) -> &str {
        &self.config_id
    }

    pub fn sample_rate_hz(&self) -> f64 {
        self.sample_rate_hz
    }

    pub fn channel_count(&self) -> usize {
        self.channel_count
    }

    /// Change the stream layout without re-parsing the configuration.
    /// Non-positive rates / zero channels are ignored (layout keeps its
    /// previous value), mirroring the defensive WASM boundary.
    pub fn update_layout(&mut self, sample_rate_hz: f32, channel_count: usize) {
        if sample_rate_hz > 0.0 {
            self.sample_rate_hz = f64::from(sample_rate_hz);
        }
        if channel_count > 0 {
            self.channel_count = channel_count;
        }
    }

    /// Analyze one window of interleaved samples
    /// (`samples[sampleIdx][channelIdx]` flattened, matching
    /// `WasmEegPreprocessor::process`). Trailing samples that do not fill a
    /// complete frame are ignored.
    pub fn analyze_window(&self, interleaved: &[f32]) -> EegWindowFeaturesV1 {
        let channels = self.channel_count;
        let frame_count = interleaved.len() / channels;

        let mut stats = Vec::with_capacity(channels);
        let mut band_abs = Vec::with_capacity(channels);
        let mut band_rel = Vec::with_capacity(channels);
        let mut band_log = Vec::with_capacity(channels);
        let mut entropy = Vec::with_capacity(channels);
        let mut dominant = Vec::with_capacity(channels);
        let mut alpha = Vec::with_capacity(channels);
        let mut hjorth_values = Vec::with_capacity(channels);
        let mut quality = Vec::with_capacity(channels);
        let mut psd_freqs: Vec<f64> = Vec::new();
        let mut psd_per_channel: Vec<Vec<f64>> = Vec::new();

        let mut channel_samples = vec![0.0f32; frame_count];
        for channel in 0..channels {
            for frame in 0..frame_count {
                channel_samples[frame] = interleaved[frame * channels + channel];
            }
            let signal = &channel_samples[..];

            let psd = welch_psd(signal, self.sample_rate_hz, &self.config.welch);
            let powers = band_powers_from_psd(&psd, &self.config.bands);
            let (low, high) = DOMINANT_FREQUENCY_RANGE_HZ;

            stats.push(window_stats(signal));
            band_abs.push(powers.abs);
            band_rel.push(powers.rel);
            band_log.push(powers.log);
            entropy.push(spectral_entropy(&psd.psd));
            dominant.push(dominant_frequency(&psd, low, high).unwrap_or(0.0));
            alpha.push(alpha_peak(&psd, &self.config.alpha_peak));
            hjorth_values.push(hjorth(signal));
            quality.push(eeg_window_quality(signal, &psd, &self.config.quality));

            if self.config.emit_psd {
                if psd_freqs.is_empty() {
                    psd_freqs = psd.freqs_hz.clone();
                }
                psd_per_channel.push(psd.psd);
            }
        }

        EegWindowFeaturesV1 {
            schema: EEG_WINDOW_FEATURES_SCHEMA.to_string(),
            sample_rate_hz: self.sample_rate_hz,
            channel_count: channels,
            sample_count: frame_count,
            stats,
            band_powers_abs: band_abs,
            band_powers_rel: band_rel,
            band_powers_log: band_log,
            spectral_entropy: entropy,
            dominant_frequency_hz: dominant,
            alpha_peak_hz: alpha,
            hjorth: hjorth_values,
            quality,
            psd: if self.config.emit_psd {
                Some(PsdOutput {
                    freqs_hz: psd_freqs,
                    per_channel: psd_per_channel,
                })
            } else {
                None
            },
            algorithm_versions: algorithm_versions_map(),
            config_id: self.config_id.clone(),
        }
    }
}

/// Reusable pulse-rate-variability analyzer bound to a configuration.
///
/// One coarse call per interval series: cleaning runs once and both the
/// time- and frequency-domain metrics are computed from that single cleaned
/// sequence, so the two can never disagree about which beats were used.
#[derive(Debug, Clone)]
pub struct PrvAnalyzer {
    config: PrvConfig,
    config_id: String,
}

impl PrvAnalyzer {
    /// Build from an optional JSON configuration (defaults on `None`).
    pub fn new(config_json: Option<&str>) -> Result<Self, ConfigError> {
        Self::from_config(PrvConfig::from_json(config_json)?)
    }

    /// Build from an already-parsed configuration.
    pub fn from_config(config: PrvConfig) -> Result<Self, ConfigError> {
        config.validate()?;
        let config_id = config.config_id();
        Ok(Self { config, config_id })
    }

    /// Stable hash of the resolved configuration (provenance).
    pub fn config_id(&self) -> &str {
        &self.config_id
    }

    /// Analyze one PP-interval series (milliseconds, in acquisition order).
    pub fn analyze_intervals(&self, intervals_ms: &[f64]) -> PrvSummaryV1 {
        let cleaned = clean_pp_intervals_ms(intervals_ms, &self.config.clean);
        let time_domain = prv_time_domain_from_cleaned(
            &cleaned.kept_ms,
            cleaned.input_count,
            &self.config.time_domain,
        );
        let frequency_domain =
            prv_frequency_domain_from_cleaned(&cleaned.kept_ms, &self.config.frequency);
        PrvSummaryV1 {
            schema: PRV_SUMMARY_SCHEMA.to_string(),
            input_interval_count: cleaned.input_count,
            implausible_interval_count: cleaned.implausible_count,
            ectopic_interval_count: cleaned.ectopic_count,
            time_domain,
            frequency_domain,
            cleaned_intervals_ms: if self.config.emit_cleaned_intervals {
                Some(cleaned.kept_ms)
            } else {
                None
            },
            algorithm_versions: prv_algorithm_versions_map(),
            config_id: self.config_id.clone(),
        }
    }
}

/// Reusable activation-epoch analyzer bound to a sample rate and
/// configuration.
#[derive(Debug, Clone)]
pub struct ActivationEpochAnalyzer {
    sample_rate_hz: f64,
    config: ActivationEpochConfig,
    config_id: String,
}

impl ActivationEpochAnalyzer {
    /// Build from an optional JSON configuration (defaults on `None`).
    ///
    /// `sample_rate_hz` is the rate of the *derived index* series, which is
    /// typically well under 1 Hz (one value per analysis window).
    pub fn new(sample_rate_hz: f64, config_json: Option<&str>) -> Result<Self, ConfigError> {
        Self::from_config(
            sample_rate_hz,
            ActivationEpochConfig::from_json(config_json)?,
        )
    }

    /// Build from an already-parsed configuration.
    pub fn from_config(
        sample_rate_hz: f64,
        config: ActivationEpochConfig,
    ) -> Result<Self, ConfigError> {
        if !sample_rate_hz.is_finite() || sample_rate_hz <= 0.0 {
            return Err(ConfigError("sampleRateHz must be > 0".into()));
        }
        config.validate()?;
        let config_id = config.config_id();
        Ok(Self {
            sample_rate_hz,
            config,
            config_id,
        })
    }

    /// Stable hash of the resolved configuration (provenance).
    pub fn config_id(&self) -> &str {
        &self.config_id
    }

    pub fn sample_rate_hz(&self) -> f64 {
        self.sample_rate_hz
    }

    /// Analyze one session-length index series.
    pub fn analyze_series(&self, values: &[f64]) -> ActivationEpochResultV1 {
        let (baseline, epoch, withheld_reason) =
            activation_epoch(values, self.sample_rate_hz, &self.config);
        ActivationEpochResultV1 {
            schema: ACTIVATION_EPOCH_SCHEMA.to_string(),
            sample_rate_hz: self.sample_rate_hz,
            sample_count: values.len(),
            duration_seconds: values.len() as f64 / self.sample_rate_hz,
            baseline,
            epoch,
            withheld_reason,
            algorithm_versions: activation_algorithm_versions_map(),
            config_id: self.config_id.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::activation_epoch::ActivationWithheldReason;
    use crate::hrv::PrvWithheldReason;
    use std::f64::consts::PI;

    fn interleaved_two_channel(n: usize) -> Vec<f32> {
        // ch0: 10 Hz alpha tone; ch1: 20 Hz beta tone.
        let mut out = Vec::with_capacity(n * 2);
        for i in 0..n {
            let t = i as f64 / 256.0;
            out.push((20.0 * (2.0 * PI * 10.0 * t).sin()) as f32);
            out.push((20.0 * (2.0 * PI * 20.0 * t).sin()) as f32);
        }
        out
    }

    #[test]
    fn construction_validates_inputs() {
        assert!(EegWindowAnalyzer::new(256.0, 4, None).is_ok());
        assert!(EegWindowAnalyzer::new(0.0, 4, None).is_err());
        assert!(EegWindowAnalyzer::new(256.0, 0, None).is_err());
        assert!(EegWindowAnalyzer::new(256.0, 4, Some("{bad json")).is_err());
    }

    #[test]
    fn per_channel_features_are_channel_ordered() {
        let analyzer = EegWindowAnalyzer::new(256.0, 2, None).unwrap();
        let result = analyzer.analyze_window(&interleaved_two_channel(2048));
        assert_eq!(result.channel_count, 2);
        assert_eq!(result.sample_count, 2048);
        assert_eq!(result.stats.len(), 2);
        assert_eq!(result.quality.len(), 2);
        // ch0 concentrates in alpha, ch1 in beta.
        assert!(result.band_powers_rel[0].alpha > 0.9);
        assert!(result.band_powers_rel[1].beta > 0.9);
        assert!((result.dominant_frequency_hz[0] - 10.0).abs() < 0.26);
        assert!((result.dominant_frequency_hz[1] - 20.0).abs() < 0.26);
        assert!(result.psd.is_none());
        assert_eq!(result.config_id, analyzer.config_id());
        assert_eq!(result.schema, EEG_WINDOW_FEATURES_SCHEMA);
        assert!(result.algorithm_versions.contains_key("welch_psd"));
    }

    #[test]
    fn emit_psd_carries_per_channel_spectra() {
        let config = EegWindowConfig {
            emit_psd: true,
            ..EegWindowConfig::default()
        };
        let analyzer = EegWindowAnalyzer::from_config(256.0, 2, config).unwrap();
        let result = analyzer.analyze_window(&interleaved_two_channel(2048));
        let psd = result.psd.expect("psd expected");
        assert_eq!(psd.per_channel.len(), 2);
        assert_eq!(psd.freqs_hz.len(), psd.per_channel[0].len());
    }

    #[test]
    fn partial_trailing_frame_is_ignored() {
        let analyzer = EegWindowAnalyzer::new(256.0, 2, None).unwrap();
        let mut samples = interleaved_two_channel(1024);
        samples.push(42.0); // half a frame
        let result = analyzer.analyze_window(&samples);
        assert_eq!(result.sample_count, 1024);
    }

    #[test]
    fn update_layout_changes_shape_and_ignores_invalid() {
        let mut analyzer = EegWindowAnalyzer::new(256.0, 2, None).unwrap();
        analyzer.update_layout(128.0, 1);
        assert_eq!(analyzer.sample_rate_hz(), 128.0);
        assert_eq!(analyzer.channel_count(), 1);
        analyzer.update_layout(-1.0, 0);
        assert_eq!(analyzer.sample_rate_hz(), 128.0);
        assert_eq!(analyzer.channel_count(), 1);
    }

    #[test]
    fn result_serializes_to_camel_case_json() {
        let analyzer = EegWindowAnalyzer::new(256.0, 1, None).unwrap();
        let result = analyzer.analyze_window(&interleaved_two_channel(512));
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"bandPowersRel\""));
        assert!(json.contains("\"alphaPeakHz\""));
        assert!(json.contains("\"configId\""));
        assert!(!json.contains("\"psd\""));
        // Structural round-trip (float equality is only up to serde_json's
        // last-ulp parse behavior, so compare fields, not full structs).
        let parsed: EegWindowFeaturesV1 = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.schema, result.schema);
        assert_eq!(parsed.config_id, result.config_id);
        assert_eq!(parsed.algorithm_versions, result.algorithm_versions);
        assert_eq!(parsed.alpha_peak_hz, result.alpha_peak_hz);
        assert!((parsed.stats[0].variance - result.stats[0].variance).abs() < 1e-9);
    }

    // ---------------------------------------------------------------- PRV --

    fn modulated_intervals(duration_s: f64, mean_ms: f64, amp_ms: f64, hz: f64) -> Vec<f64> {
        let mut out = Vec::new();
        let mut t = 0.0f64;
        while t < duration_s {
            let nn = mean_ms + amp_ms * (2.0 * PI * hz * t).sin();
            out.push(nn);
            t += nn / 1000.0;
        }
        out
    }

    #[test]
    fn prv_construction_validates_inputs() {
        assert!(PrvAnalyzer::new(None).is_ok());
        assert!(PrvAnalyzer::new(Some("{bad json")).is_err());
        assert!(PrvAnalyzer::new(Some(r#"{"v":2}"#)).is_err());
        assert!(PrvAnalyzer::new(Some(r#"{"clean":{"minMs":3000}}"#)).is_err());
    }

    #[test]
    fn prv_one_call_returns_both_domains_and_the_rejection_tally() {
        let analyzer = PrvAnalyzer::new(None).unwrap();
        let mut intervals = modulated_intervals(300.0, 850.0, 40.0, 0.10);
        intervals[5] = 2500.0; // dropout
        intervals[9] = 400.0; // ectopic
        let result = analyzer.analyze_intervals(&intervals);

        assert_eq!(result.schema, "elata.prv-summary/v1");
        assert_eq!(result.input_interval_count, intervals.len());
        assert_eq!(result.implausible_interval_count, 1);
        assert_eq!(result.ectopic_interval_count, 1);
        assert!(result.time_domain.sdnn_ms.is_some());
        assert!(result.frequency_domain.lf_ms2.is_some());
        assert_eq!(result.config_id, analyzer.config_id());
        assert!(result.algorithm_versions.contains_key("prv_time_domain"));
        assert!(result.cleaned_intervals_ms.is_none());
        // Both domains saw exactly the same cleaned sequence.
        assert_eq!(
            result.time_domain.pp_interval_count,
            result.frequency_domain.pp_interval_count
        );
    }

    #[test]
    fn prv_result_serializes_to_camel_case_json_with_prv_naming() {
        let analyzer = PrvAnalyzer::from_config(PrvConfig {
            emit_cleaned_intervals: true,
            ..PrvConfig::default()
        })
        .unwrap();
        let result = analyzer.analyze_intervals(&modulated_intervals(90.0, 800.0, 30.0, 0.25));
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"ppIntervalCount\""));
        assert!(json.contains("\"lfHfRatio\""));
        assert!(json.contains("\"pnn50Percent\""));
        assert!(json.contains("\"cleanedIntervalsMs\""));
        assert!(json.contains("\"configId\""));
        // A 90 s window cannot resolve LF, and says so rather than reporting 0.
        assert!(json.contains("\"lfWithheldReason\":\"recordingTooShort\""));
        // The word "hrv" must never appear in a camera-derived payload.
        assert!(
            !json.to_lowercase().contains("hrv"),
            "PRV payload must not claim HRV: {json}"
        );
        let parsed: PrvSummaryV1 = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.config_id, result.config_id);
        assert_eq!(
            parsed.frequency_domain.lf_withheld_reason,
            Some(PrvWithheldReason::RecordingTooShort)
        );
    }

    // --------------------------------------------------- Activation epoch --

    fn trapezoid_series() -> Vec<f64> {
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
    fn activation_construction_validates_inputs() {
        assert!(ActivationEpochAnalyzer::new(1.0, None).is_ok());
        assert!(ActivationEpochAnalyzer::new(0.0, None).is_err());
        assert!(ActivationEpochAnalyzer::new(f64::NAN, None).is_err());
        assert!(ActivationEpochAnalyzer::new(1.0, Some("{bad")).is_err());
        assert!(ActivationEpochAnalyzer::new(1.0, Some(r#"{"recoveryFraction":1.5}"#)).is_err());
        // A baseline window shorter than the minimum could never qualify.
        assert!(ActivationEpochAnalyzer::new(
            1.0,
            Some(r#"{"baselineWindowSeconds":5,"minBaselineSeconds":20}"#)
        )
        .is_err());
    }

    #[test]
    fn activation_one_call_returns_the_full_contract() {
        let analyzer = ActivationEpochAnalyzer::new(1.0, None).unwrap();
        let result = analyzer.analyze_series(&trapezoid_series());
        assert_eq!(result.schema, "elata.activation-epoch/v1");
        assert_eq!(result.sample_count, 400);
        assert_eq!(result.duration_seconds, 400.0);
        assert_eq!(result.withheld_reason, None);
        let epoch = result.epoch.expect("epoch");
        assert_eq!(epoch.peak_value, 50.0);
        assert!(epoch.recovery.expect("recovery").recovery_completed);
        assert_eq!(result.config_id, analyzer.config_id());
        assert!(result.algorithm_versions.contains_key("activation_epoch"));
    }

    #[test]
    fn activation_result_serializes_withholding_as_explicit_reasons() {
        let analyzer = ActivationEpochAnalyzer::new(1.0, None).unwrap();
        let result = analyzer.analyze_series(&vec![10.0; 400]);
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"withheldReason\":\"noQualifyingActivation\""));
        assert!(json.contains("\"epoch\":null"));
        assert!(json.contains("\"activationThreshold\""));
        let parsed: ActivationEpochResultV1 = serde_json::from_str(&json).unwrap();
        assert_eq!(
            parsed.withheld_reason,
            Some(ActivationWithheldReason::NoQualifyingActivation)
        );
        assert!(parsed.baseline.is_some());
    }

    #[test]
    fn activation_config_changes_move_the_config_id() {
        let default = ActivationEpochAnalyzer::new(1.0, None).unwrap();
        let strict = ActivationEpochAnalyzer::new(1.0, Some(r#"{"activationK":4.0}"#)).unwrap();
        assert_ne!(default.config_id(), strict.config_id());
        assert!(default.config_id().starts_with("actep1-"));
    }
}
