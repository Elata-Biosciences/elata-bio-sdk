//! Windowed biosignal feature extraction for Elata's local analytics.
//!
//! This crate layers deterministic, versioned features on top of the DSP
//! primitives in `elata-eeg-signal` (which supplies the FFT — it is not
//! reimplemented here):
//!
//! - [`spectral`]: scipy-compatible Welch PSD, spectral entropy, dominant
//!   frequency, and prominence-qualified alpha peak.
//! - [`eeg`]: band powers (abs/rel/log) integrated from the shared PSD, and
//!   Hjorth activity/mobility/complexity.
//! - [`statistics`]: basic time-domain window statistics.
//! - [`quality`]: flatline/clipping/extreme-amplitude fractions plus a
//!   line-noise ratio from the same PSD.
//! - [`pulse`]: inter-beat-interval cleaning (`nn_clean@1`) and the
//!   uniformly-resampled tachogram it feeds.
//! - [`hrv`]: time- and frequency-domain **pulse-rate variability** over those
//!   intervals. Camera-derived intervals are peak-to-peak, so the metrics are
//!   PRV and are named PRV throughout — never HRV.
//! - [`activation_epoch`]: the sustained physiological activation in a
//!   session, with its pre-epoch baseline and post-epoch recovery.
//! - [`analyzer`]: one coarse call per unit of work —
//!   [`EegWindowAnalyzer`] per window, [`PrvAnalyzer`] per interval series,
//!   [`ActivationEpochAnalyzer`] per session — returning the serde-backed
//!   [`EegWindowFeaturesV1`], [`PrvSummaryV1`] and
//!   [`ActivationEpochResultV1`].
//!
//! Every algorithm carries an `algorithm@version` identity (see
//! [`ALGORITHM_VERSIONS`], [`PRV_ALGORITHM_VERSIONS`] and
//! [`ACTIVATION_ALGORITHM_VERSIONS`]) and results carry a stable `configId`,
//! so persisted observations remain attributable and recomputable.
//!
//! Anything that can be withheld *is* withheld rather than guessed: a PRV band
//! the window is too short to resolve, or an activation epoch that never
//! qualified, comes back as `null` with a machine-readable reason, never as a
//! zero a consumer would mistake for a measurement.
//!
//! Parity with the Python oracles (numpy/scipy) is enforced by
//! `tests/golden_parity.rs` and `tests/pulse_activation_parity.rs` against the
//! golden fixtures in `packages/biosignal-analytics/fixtures/`; invariants that
//! must hold for *any* input are pinned by `tests/properties.rs`.

pub mod activation_epoch;
pub mod analyzer;
pub mod config;
pub mod eeg;
pub mod hrv;
pub mod pulse;
pub mod quality;
pub mod result;
pub mod spectral;
pub mod statistics;

pub use activation_epoch::{
    activation_epoch, ActivationBaseline, ActivationEpochMetrics, ActivationRecovery,
    ActivationWithheldReason, MAD_SCALE,
};
pub use analyzer::{ActivationEpochAnalyzer, EegWindowAnalyzer, PrvAnalyzer};
pub use config::{
    ActivationEpochConfig, AlphaPeakConfig, BandsConfig, ConfigError, EegWindowConfig,
    NnCleanConfig, PrvConfig, PrvFrequencyConfig, PrvTimeDomainConfig, QualityConfig, WelchConfig,
};
pub use eeg::{band_powers_from_psd, hjorth, BandPowersFromPsd, BandValues, Hjorth};
pub use hrv::{
    prv_frequency_domain, prv_frequency_domain_from_cleaned, prv_time_domain,
    prv_time_domain_from_cleaned, PrvFrequencyDomain, PrvTimeDomain, PrvWithheldReason,
};
pub use pulse::{
    clean_pp_intervals_ms, nn_tachogram, CleanedIntervals, Tachogram, NN_MAX_MS,
    NN_MEDIAN_TOLERANCE, NN_MIN_MS,
};
pub use quality::{eeg_window_quality, QualityFlags};
pub use result::{
    activation_algorithm_versions_map, algorithm_versions_map, prv_algorithm_versions_map,
    ActivationEpochResultV1, EegWindowFeaturesV1, PrvSummaryV1, PsdOutput,
    ACTIVATION_ALGORITHM_VERSIONS, ACTIVATION_EPOCH_SCHEMA, ALGORITHM_VERSIONS,
    DOMINANT_FREQUENCY_RANGE_HZ, EEG_WINDOW_FEATURES_SCHEMA, PRV_ALGORITHM_VERSIONS,
    PRV_SUMMARY_SCHEMA,
};
pub use spectral::{alpha_peak, dominant_frequency, spectral_entropy, welch_psd, Psd};
pub use statistics::{window_stats, WindowStats};
