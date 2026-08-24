//! Serde result schema for one analyzed EEG window (`EegWindowFeaturesV1`).

use crate::eeg::{BandValues, Hjorth};
use crate::quality::QualityFlags;
use crate::statistics::WindowStats;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Schema identifier carried by every result.
pub const EEG_WINDOW_FEATURES_SCHEMA: &str = "elata.eeg-window-features/v1";

/// Dominant-frequency search range in Hz (part of `dominant_frequency@1`).
pub const DOMINANT_FREQUENCY_RANGE_HZ: (f64, f64) = (1.0, 40.0);

/// Optional per-channel PSD payload (emitted only when `config.emitPsd`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PsdOutput {
    pub freqs_hz: Vec<f64>,
    /// One PSD per channel, ordered by channel index.
    pub per_channel: Vec<Vec<f64>>,
}

/// Features for one window; all per-channel vectors are ordered by channel
/// index and have `channelCount` entries.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EegWindowFeaturesV1 {
    pub schema: String,
    pub sample_rate_hz: f64,
    pub channel_count: usize,
    /// Complete frames analyzed (interleaved length / channelCount).
    pub sample_count: usize,
    pub stats: Vec<WindowStats>,
    pub band_powers_abs: Vec<BandValues>,
    pub band_powers_rel: Vec<BandValues>,
    pub band_powers_log: Vec<BandValues>,
    pub spectral_entropy: Vec<f64>,
    pub dominant_frequency_hz: Vec<f64>,
    pub alpha_peak_hz: Vec<Option<f64>>,
    pub hjorth: Vec<Hjorth>,
    pub quality: Vec<QualityFlags>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub psd: Option<PsdOutput>,
    /// `algorithmName -> algorithm@version` for every algorithm that ran.
    pub algorithm_versions: BTreeMap<String, String>,
    /// Stable hash of the resolved configuration.
    pub config_id: String,
}

/// The `algorithm@version` identifiers implemented by this crate.
pub const ALGORITHM_VERSIONS: &[(&str, &str)] = &[
    ("welch_psd", "welch_psd@1"),
    ("eeg_band_power", "eeg_band_power@2"),
    ("spectral_entropy", "spectral_entropy@1"),
    ("dominant_frequency", "dominant_frequency@1"),
    ("alpha_peak", "alpha_peak@2"),
    ("hjorth", "hjorth@1"),
    ("window_stats", "window_stats@1"),
    ("eeg_quality_flags", "eeg_quality_flags@1"),
];

/// [`ALGORITHM_VERSIONS`] as an ordered map for result payloads.
pub fn algorithm_versions_map() -> BTreeMap<String, String> {
    ALGORITHM_VERSIONS
        .iter()
        .map(|(name, version)| ((*name).to_string(), (*version).to_string()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn algorithm_versions_are_well_formed_and_unique() {
        let map = algorithm_versions_map();
        assert_eq!(map.len(), ALGORITHM_VERSIONS.len());
        for (name, version) in ALGORITHM_VERSIONS {
            assert!(
                version.starts_with(name),
                "{version} must start with {name}"
            );
            let suffix = &version[name.len()..];
            assert!(suffix.starts_with('@'), "{version} must contain @");
            assert!(
                suffix[1..].parse::<u32>().is_ok(),
                "{version} must end in a number"
            );
        }
    }
}
