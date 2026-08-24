//! Coarse-grained per-window analyzer: one call computes every v1 feature for
//! every channel, sharing a single Welch PSD per channel.

use crate::config::{ConfigError, EegWindowConfig};
use crate::eeg::{band_powers_from_psd, hjorth};
use crate::quality::eeg_window_quality;
use crate::result::{
    algorithm_versions_map, EegWindowFeaturesV1, PsdOutput, DOMINANT_FREQUENCY_RANGE_HZ,
    EEG_WINDOW_FEATURES_SCHEMA,
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

#[cfg(test)]
mod tests {
    use super::*;
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
}
