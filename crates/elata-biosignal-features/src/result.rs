//! Serde result schemas for the crate's coarse-grained analyzers:
//! [`EegWindowFeaturesV1`], [`PrvSummaryV1`] and [`ActivationEpochResultV1`].

use crate::activation_epoch::{
    ActivationBaseline, ActivationEpochMetrics, ActivationWithheldReason,
};
use crate::eeg::{BandValues, Hjorth};
use crate::hrv::{PrvFrequencyDomain, PrvTimeDomain};
use crate::quality::QualityFlags;
use crate::statistics::WindowStats;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Schema identifier carried by every EEG window result.
pub const EEG_WINDOW_FEATURES_SCHEMA: &str = "elata.eeg-window-features/v1";

/// Schema identifier carried by every PRV result.
pub const PRV_SUMMARY_SCHEMA: &str = "elata.prv-summary/v1";

/// Schema identifier carried by every activation-epoch result.
pub const ACTIVATION_EPOCH_SCHEMA: &str = "elata.activation-epoch/v1";

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

/// Pulse-rate-variability summary for one interval series.
///
/// PRV, not HRV: these intervals are camera-derived peak-to-peak intervals.
/// See [`crate::hrv`] for why the distinction is load-bearing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrvSummaryV1 {
    pub schema: String,
    /// Intervals presented to the cleaner.
    pub input_interval_count: usize,
    /// Rejected as non-finite or outside the physiologic range.
    pub implausible_interval_count: usize,
    /// Rejected as ectopic (in range, but off the in-range median).
    pub ectopic_interval_count: usize,
    pub time_domain: PrvTimeDomain,
    pub frequency_domain: PrvFrequencyDomain,
    /// Cleaned intervals in ms (emitted only when `config.emitCleanedIntervals`).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cleaned_intervals_ms: Option<Vec<f64>>,
    /// `algorithmName -> algorithm@version` for every algorithm that ran.
    pub algorithm_versions: BTreeMap<String, String>,
    /// Stable hash of the resolved configuration.
    pub config_id: String,
}

/// Result of one activation-epoch analysis. See [`crate::activation_epoch`]
/// for the normative output contract — a downstream Recovery score reads it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActivationEpochResultV1 {
    pub schema: String,
    pub sample_rate_hz: f64,
    pub sample_count: usize,
    /// `sample_count / sample_rate_hz`.
    pub duration_seconds: f64,
    pub baseline: Option<ActivationBaseline>,
    pub epoch: Option<ActivationEpochMetrics>,
    /// Set iff `epoch` is `None`.
    pub withheld_reason: Option<ActivationWithheldReason>,
    /// `algorithmName -> algorithm@version` for every algorithm that ran.
    pub algorithm_versions: BTreeMap<String, String>,
    /// Stable hash of the resolved configuration.
    pub config_id: String,
}

/// The `algorithm@version` identifiers behind [`EegWindowFeaturesV1`].
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

/// The `algorithm@version` identifiers behind [`PrvSummaryV1`].
///
/// `prv_time_domain@1` is a rename of the retired `hrv_time_domain@1` with
/// added metrics, not a change to the shared arithmetic: meanNN, SDNN and
/// RMSSD are computed identically and still match
/// `fixtures/pulse/hrv_time_domain.json`. The rename is the PRV-vs-HRV
/// correctness fix — camera intervals are peak-to-peak, so the old id claimed
/// a measurement the sensor never made.
pub const PRV_ALGORITHM_VERSIONS: &[(&str, &str)] = &[
    ("nn_clean", "nn_clean@1"),
    ("prv_time_domain", "prv_time_domain@1"),
    ("prv_frequency_domain", "prv_frequency_domain@1"),
    ("welch_psd", "welch_psd@1"),
];

/// The `algorithm@version` identifiers behind [`ActivationEpochResultV1`].
pub const ACTIVATION_ALGORITHM_VERSIONS: &[(&str, &str)] = &[
    ("activation_epoch", "activation_epoch@1"),
    ("robust_stats", "robust_stats@1"),
];

fn versions_map(versions: &[(&str, &str)]) -> BTreeMap<String, String> {
    versions
        .iter()
        .map(|(name, version)| ((*name).to_string(), (*version).to_string()))
        .collect()
}

/// [`ALGORITHM_VERSIONS`] as an ordered map for result payloads.
pub fn algorithm_versions_map() -> BTreeMap<String, String> {
    versions_map(ALGORITHM_VERSIONS)
}

/// [`PRV_ALGORITHM_VERSIONS`] as an ordered map for result payloads.
pub fn prv_algorithm_versions_map() -> BTreeMap<String, String> {
    versions_map(PRV_ALGORITHM_VERSIONS)
}

/// [`ACTIVATION_ALGORITHM_VERSIONS`] as an ordered map for result payloads.
pub fn activation_algorithm_versions_map() -> BTreeMap<String, String> {
    versions_map(ACTIVATION_ALGORITHM_VERSIONS)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn algorithm_versions_are_well_formed_and_unique() {
        let all: Vec<&(&str, &str)> = ALGORITHM_VERSIONS
            .iter()
            .chain(PRV_ALGORITHM_VERSIONS)
            .chain(ACTIVATION_ALGORITHM_VERSIONS)
            .collect();
        assert_eq!(algorithm_versions_map().len(), ALGORITHM_VERSIONS.len());
        assert_eq!(
            prv_algorithm_versions_map().len(),
            PRV_ALGORITHM_VERSIONS.len()
        );
        assert_eq!(
            activation_algorithm_versions_map().len(),
            ACTIVATION_ALGORITHM_VERSIONS.len()
        );
        for (name, version) in all {
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
