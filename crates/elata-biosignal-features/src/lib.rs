//! Windowed biosignal feature extraction for Elata's local analytics.
//!
//! This crate layers deterministic, versioned window features on top of the
//! DSP primitives in `elata-eeg-signal` (which supplies the FFT — it is not
//! reimplemented here):
//!
//! - [`spectral`]: scipy-compatible Welch PSD, spectral entropy, dominant
//!   frequency, and prominence-qualified alpha peak.
//! - [`eeg`]: band powers (abs/rel/log) integrated from the shared PSD, and
//!   Hjorth activity/mobility/complexity.
//! - [`statistics`]: basic time-domain window statistics.
//! - [`quality`]: flatline/clipping/extreme-amplitude fractions plus a
//!   line-noise ratio from the same PSD.
//! - [`analyzer`]: one coarse call per window computing everything above for
//!   every channel ([`EegWindowAnalyzer`]), returning the serde-backed
//!   [`EegWindowFeaturesV1`].
//!
//! Every algorithm carries an `algorithm@version` identity (see
//! [`ALGORITHM_VERSIONS`]) and results carry a stable `configId`, so persisted
//! observations remain attributable and recomputable. Parity with the Python
//! oracles (numpy/scipy) is enforced by `tests/golden_parity.rs` against the
//! golden fixtures in `packages/biosignal-analytics/fixtures/`.

pub mod analyzer;
pub mod config;
pub mod eeg;
pub mod quality;
pub mod result;
pub mod spectral;
pub mod statistics;

pub use analyzer::EegWindowAnalyzer;
pub use config::{
    AlphaPeakConfig, BandsConfig, ConfigError, EegWindowConfig, QualityConfig, WelchConfig,
};
pub use eeg::{band_powers_from_psd, hjorth, BandPowersFromPsd, BandValues, Hjorth};
pub use quality::{eeg_window_quality, QualityFlags};
pub use result::{
    algorithm_versions_map, EegWindowFeaturesV1, PsdOutput, ALGORITHM_VERSIONS,
    DOMINANT_FREQUENCY_RANGE_HZ, EEG_WINDOW_FEATURES_SCHEMA,
};
pub use spectral::{alpha_peak, dominant_frequency, spectral_entropy, welch_psd, Psd};
pub use statistics::{window_stats, WindowStats};
