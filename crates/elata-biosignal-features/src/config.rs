//! Versioned, serde-backed configuration for every analyzer in this crate:
//! [`EegWindowConfig`] (windowed EEG features), [`PrvConfig`] (pulse-rate
//! variability) and [`ActivationEpochConfig`] (sustained-activation epochs).
//!
//! Every field is defaulted so `Config::default()` (or `null` / missing JSON)
//! resolves to the standard-profile configuration. Each resolved configuration
//! has a stable `config_id()` hash carried in result provenance.

use serde::{Deserialize, Serialize};

/// FNV-1a 64-bit over a config's canonical serde_json serialization.
///
/// Struct field order is fixed at compile time, so the serialization — and
/// therefore the id — is deterministic across builds and targets.
fn config_id_for<T: Serialize>(prefix: &str, config: &T) -> String {
    let canonical = serde_json::to_string(config).unwrap_or_else(|_| "unserializable".to_string());
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in canonical.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{prefix}-{hash:016x}")
}

/// Welch PSD estimation parameters (scipy-compatible defaults).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WelchConfig {
    /// Segment length in seconds (`nperseg = round(segment_seconds * fs)`).
    #[serde(default = "default_segment_seconds")]
    pub segment_seconds: f64,
    /// Overlap as a fraction of the segment length (0.5 = 50%).
    #[serde(default = "default_overlap_ratio")]
    pub overlap_ratio: f64,
    /// Window function name; only "hann" is supported in v1.
    #[serde(default = "default_window")]
    pub window: String,
    /// Detrend mode; only "constant" (mean removal) is supported in v1.
    #[serde(default = "default_detrend")]
    pub detrend: String,
}

fn default_segment_seconds() -> f64 {
    4.0
}
fn default_overlap_ratio() -> f64 {
    0.5
}
fn default_window() -> String {
    "hann".to_string()
}
fn default_detrend() -> String {
    "constant".to_string()
}

impl Default for WelchConfig {
    fn default() -> Self {
        Self {
            segment_seconds: default_segment_seconds(),
            overlap_ratio: default_overlap_ratio(),
            window: default_window(),
            detrend: default_detrend(),
        }
    }
}

/// EEG band edges in Hz, `[low, high)` per band.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BandsConfig {
    #[serde(default = "default_delta")]
    pub delta: [f64; 2],
    #[serde(default = "default_theta")]
    pub theta: [f64; 2],
    #[serde(default = "default_alpha")]
    pub alpha: [f64; 2],
    #[serde(default = "default_beta")]
    pub beta: [f64; 2],
    #[serde(default = "default_gamma")]
    pub gamma: [f64; 2],
}

fn default_delta() -> [f64; 2] {
    [0.5, 4.0]
}
fn default_theta() -> [f64; 2] {
    [4.0, 8.0]
}
fn default_alpha() -> [f64; 2] {
    [8.0, 13.0]
}
fn default_beta() -> [f64; 2] {
    [13.0, 30.0]
}
fn default_gamma() -> [f64; 2] {
    [30.0, 50.0]
}

impl Default for BandsConfig {
    fn default() -> Self {
        Self {
            delta: default_delta(),
            theta: default_theta(),
            alpha: default_alpha(),
            beta: default_beta(),
            gamma: default_gamma(),
        }
    }
}

/// Alpha-peak (IAF) search parameters.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AlphaPeakConfig {
    /// Inclusive frequency search range in Hz.
    #[serde(default = "default_search_hz")]
    pub search_hz: [f64; 2],
    /// Minimum scipy-style peak prominence as a fraction of the peak height.
    #[serde(default = "default_min_prominence_ratio")]
    pub min_prominence_ratio: f64,
    /// Minimum peak height as a fraction of the full-spectrum PSD maximum.
    /// Rejects "peaks" that are only numerical/leakage noise in an otherwise
    /// alpha-free spectrum (necessary for cross-implementation determinism:
    /// noise-bin argmaxes differ between f32 and f64 pipelines).
    #[serde(default = "default_min_peak_to_spectrum_max_ratio")]
    pub min_peak_to_spectrum_max_ratio: f64,
}

fn default_search_hz() -> [f64; 2] {
    [7.0, 14.0]
}
fn default_min_prominence_ratio() -> f64 {
    0.15
}
fn default_min_peak_to_spectrum_max_ratio() -> f64 {
    1e-4
}

impl Default for AlphaPeakConfig {
    fn default() -> Self {
        Self {
            search_hz: default_search_hz(),
            min_prominence_ratio: default_min_prominence_ratio(),
            min_peak_to_spectrum_max_ratio: default_min_peak_to_spectrum_max_ratio(),
        }
    }
}

/// Quality-flag thresholds (amplitudes in the same units as the samples, µV).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QualityConfig {
    /// Absolute amplitude at/above which a sample counts as clipped.
    #[serde(default = "default_clip_uv")]
    pub clip_uv: f64,
    /// Successive-difference magnitude below which a step counts as flatline.
    #[serde(default = "default_flatline_eps_uv")]
    pub flatline_eps_uv: f64,
    /// Absolute amplitude at/above which a sample counts as extreme.
    #[serde(default = "default_extreme_amplitude_uv")]
    pub extreme_amplitude_uv: f64,
    /// Mains frequencies checked for line-noise contamination.
    #[serde(default = "default_line_noise_hz")]
    pub line_noise_hz: Vec<f64>,
    /// Half-width in Hz of the PSD band summed around each mains frequency.
    #[serde(default = "default_line_noise_half_width_hz")]
    pub line_noise_half_width_hz: f64,
    /// `usable` thresholds.
    #[serde(default = "default_max_clipped_fraction")]
    pub max_clipped_fraction: f64,
    #[serde(default = "default_max_flatline_fraction")]
    pub max_flatline_fraction: f64,
    #[serde(default = "default_max_extreme_fraction")]
    pub max_extreme_fraction: f64,
    #[serde(default = "default_max_line_noise_ratio")]
    pub max_line_noise_ratio: f64,
}

fn default_clip_uv() -> f64 {
    500.0
}
fn default_flatline_eps_uv() -> f64 {
    0.01
}
fn default_extreme_amplitude_uv() -> f64 {
    150.0
}
fn default_line_noise_hz() -> Vec<f64> {
    vec![50.0, 60.0]
}
fn default_line_noise_half_width_hz() -> f64 {
    1.0
}
fn default_max_clipped_fraction() -> f64 {
    0.05
}
fn default_max_flatline_fraction() -> f64 {
    0.2
}
fn default_max_extreme_fraction() -> f64 {
    0.1
}
fn default_max_line_noise_ratio() -> f64 {
    0.5
}

impl Default for QualityConfig {
    fn default() -> Self {
        Self {
            clip_uv: default_clip_uv(),
            flatline_eps_uv: default_flatline_eps_uv(),
            extreme_amplitude_uv: default_extreme_amplitude_uv(),
            line_noise_hz: default_line_noise_hz(),
            line_noise_half_width_hz: default_line_noise_half_width_hz(),
            max_clipped_fraction: default_max_clipped_fraction(),
            max_flatline_fraction: default_max_flatline_fraction(),
            max_extreme_fraction: default_max_extreme_fraction(),
            max_line_noise_ratio: default_max_line_noise_ratio(),
        }
    }
}

/// Top-level windowed-EEG-features configuration (versioned).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EegWindowConfig {
    /// Config schema version; only 1 is valid.
    #[serde(default = "default_v")]
    pub v: u32,
    #[serde(default)]
    pub welch: WelchConfig,
    #[serde(default)]
    pub bands: BandsConfig,
    #[serde(default)]
    pub alpha_peak: AlphaPeakConfig,
    #[serde(default)]
    pub quality: QualityConfig,
    /// When true, results carry the per-channel one-sided PSD.
    #[serde(default)]
    pub emit_psd: bool,
}

fn default_v() -> u32 {
    1
}

impl Default for EegWindowConfig {
    fn default() -> Self {
        Self {
            v: default_v(),
            welch: WelchConfig::default(),
            bands: BandsConfig::default(),
            alpha_peak: AlphaPeakConfig::default(),
            quality: QualityConfig::default(),
            emit_psd: false,
        }
    }
}

/// Configuration parse/validation error.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigError(pub String);

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "invalid EegWindowConfig: {}", self.0)
    }
}

impl std::error::Error for ConfigError {}

impl EegWindowConfig {
    /// Parse from JSON, applying defaults for missing fields. `None` and
    /// empty strings resolve to the default configuration.
    pub fn from_json(config_json: Option<&str>) -> Result<Self, ConfigError> {
        let config = match config_json {
            None => Self::default(),
            Some(raw) if raw.trim().is_empty() || raw.trim() == "null" => Self::default(),
            Some(raw) => {
                serde_json::from_str::<Self>(raw).map_err(|e| ConfigError(e.to_string()))?
            }
        };
        config.validate()?;
        Ok(config)
    }

    /// Reject configurations the v1 engine cannot honor.
    pub fn validate(&self) -> Result<(), ConfigError> {
        if self.v != 1 {
            return Err(ConfigError(format!(
                "unsupported config version {}",
                self.v
            )));
        }
        if self.welch.window != "hann" {
            return Err(ConfigError(format!(
                "unsupported welch.window '{}' (v1 supports 'hann')",
                self.welch.window
            )));
        }
        if self.welch.detrend != "constant" {
            return Err(ConfigError(format!(
                "unsupported welch.detrend '{}' (v1 supports 'constant')",
                self.welch.detrend
            )));
        }
        if self.welch.segment_seconds.is_nan() || self.welch.segment_seconds <= 0.0 {
            return Err(ConfigError("welch.segmentSeconds must be > 0".into()));
        }
        if !(0.0..1.0).contains(&self.welch.overlap_ratio) {
            return Err(ConfigError("welch.overlapRatio must be in [0, 1)".into()));
        }
        for (name, [low, high]) in [
            ("delta", self.bands.delta),
            ("theta", self.bands.theta),
            ("alpha", self.bands.alpha),
            ("beta", self.bands.beta),
            ("gamma", self.bands.gamma),
        ] {
            if low.is_nan() || high.is_nan() || low >= high {
                return Err(ConfigError(format!("bands.{name} must satisfy low < high")));
            }
        }
        if self.alpha_peak.search_hz[0].is_nan()
            || self.alpha_peak.search_hz[1].is_nan()
            || self.alpha_peak.search_hz[0] >= self.alpha_peak.search_hz[1]
        {
            return Err(ConfigError(
                "alphaPeak.searchHz must satisfy low < high".into(),
            ));
        }
        if !(0.0..=1.0).contains(&self.alpha_peak.min_prominence_ratio) {
            return Err(ConfigError(
                "alphaPeak.minProminenceRatio must be in [0, 1]".into(),
            ));
        }
        Ok(())
    }

    /// Stable identity hash of the fully-resolved configuration.
    pub fn config_id(&self) -> String {
        config_id_for("eegwin1", self)
    }
}

/// NN/PP-interval cleaning parameters. `algorithm: nn_clean@1`.
///
/// Two rejection stages, matching the TypeScript `nn_clean@1` this replaces:
/// a physiologic-plausibility range, then a deviation gate against the median
/// of the in-range set (which is what removes ectopic beats and the
/// compensatory pause that follows them).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NnCleanConfig {
    /// Shortest physiologically plausible interval in ms (200 bpm).
    #[serde(default = "default_nn_min_ms")]
    pub min_ms: f64,
    /// Longest physiologically plausible interval in ms (30 bpm).
    #[serde(default = "default_nn_max_ms")]
    pub max_ms: f64,
    /// Reject in-range intervals deviating from the in-range median by more
    /// than this fraction of that median.
    #[serde(default = "default_nn_median_tolerance")]
    pub median_tolerance: f64,
}

fn default_nn_min_ms() -> f64 {
    300.0
}
fn default_nn_max_ms() -> f64 {
    2000.0
}
fn default_nn_median_tolerance() -> f64 {
    0.3
}

impl Default for NnCleanConfig {
    fn default() -> Self {
        Self {
            min_ms: default_nn_min_ms(),
            max_ms: default_nn_max_ms(),
            median_tolerance: default_nn_median_tolerance(),
        }
    }
}

/// Time-domain PRV parameters. `algorithm: prv_time_domain@1`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrvTimeDomainConfig {
    /// pNN20 threshold in ms (successive differences strictly above count).
    #[serde(default = "default_pnn_short_threshold_ms")]
    pub pnn_short_threshold_ms: f64,
    /// pNN50 threshold in ms.
    #[serde(default = "default_pnn_long_threshold_ms")]
    pub pnn_long_threshold_ms: f64,
}

fn default_pnn_short_threshold_ms() -> f64 {
    20.0
}
fn default_pnn_long_threshold_ms() -> f64 {
    50.0
}

impl Default for PrvTimeDomainConfig {
    fn default() -> Self {
        Self {
            pnn_short_threshold_ms: default_pnn_short_threshold_ms(),
            pnn_long_threshold_ms: default_pnn_long_threshold_ms(),
        }
    }
}

/// Frequency-domain PRV parameters. `algorithm: prv_frequency_domain@1`.
///
/// The duration and cycle floors are the withholding gates: a window too short
/// to resolve a band yields `null` for that band rather than a number the
/// spectrum cannot support.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrvFrequencyConfig {
    /// Uniform grid the NN tachogram is linearly resampled onto.
    #[serde(default = "default_prv_resample_hz")]
    pub resample_hz: f64,
    /// Low-frequency band `[low, high)` in Hz.
    #[serde(default = "default_prv_lf_band_hz")]
    pub lf_band_hz: [f64; 2],
    /// High-frequency band `[low, high)` in Hz.
    #[serde(default = "default_prv_hf_band_hz")]
    pub hf_band_hz: [f64; 2],
    /// Welch segment length in seconds over the resampled tachogram.
    #[serde(default = "default_prv_segment_seconds")]
    pub segment_seconds: f64,
    #[serde(default = "default_prv_overlap_ratio")]
    pub overlap_ratio: f64,
    /// Minimum cleaned intervals before any band is reported.
    #[serde(default = "default_prv_min_intervals")]
    pub min_intervals: usize,
    /// Minimum tachogram duration in seconds before LF is reported. The Task
    /// Force short-term recommendation is 2 minutes for LF.
    #[serde(default = "default_prv_min_lf_duration_seconds")]
    pub min_lf_duration_seconds: f64,
    /// Minimum tachogram duration in seconds before HF is reported (1 minute).
    #[serde(default = "default_prv_min_hf_duration_seconds")]
    pub min_hf_duration_seconds: f64,
    /// The Welch segment actually used must span at least this many cycles of
    /// a band's low edge, else that band is withheld. This is the gate that
    /// keeps a custom (shorter) `segment_seconds` from silently reporting a
    /// band the spectrum cannot resolve.
    #[serde(default = "default_prv_min_cycles_in_segment")]
    pub min_cycles_in_segment: f64,
}

fn default_prv_resample_hz() -> f64 {
    4.0
}
fn default_prv_lf_band_hz() -> [f64; 2] {
    [0.04, 0.15]
}
fn default_prv_hf_band_hz() -> [f64; 2] {
    [0.15, 0.40]
}
fn default_prv_segment_seconds() -> f64 {
    120.0
}
fn default_prv_overlap_ratio() -> f64 {
    0.5
}
fn default_prv_min_intervals() -> usize {
    20
}
fn default_prv_min_lf_duration_seconds() -> f64 {
    120.0
}
fn default_prv_min_hf_duration_seconds() -> f64 {
    60.0
}
fn default_prv_min_cycles_in_segment() -> f64 {
    2.0
}

impl Default for PrvFrequencyConfig {
    fn default() -> Self {
        Self {
            resample_hz: default_prv_resample_hz(),
            lf_band_hz: default_prv_lf_band_hz(),
            hf_band_hz: default_prv_hf_band_hz(),
            segment_seconds: default_prv_segment_seconds(),
            overlap_ratio: default_prv_overlap_ratio(),
            min_intervals: default_prv_min_intervals(),
            min_lf_duration_seconds: default_prv_min_lf_duration_seconds(),
            min_hf_duration_seconds: default_prv_min_hf_duration_seconds(),
            min_cycles_in_segment: default_prv_min_cycles_in_segment(),
        }
    }
}

/// Top-level pulse-rate-variability configuration (versioned).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrvConfig {
    /// Config schema version; only 1 is valid.
    #[serde(default = "default_v")]
    pub v: u32,
    #[serde(default)]
    pub clean: NnCleanConfig,
    #[serde(default)]
    pub time_domain: PrvTimeDomainConfig,
    #[serde(default)]
    pub frequency: PrvFrequencyConfig,
    /// When true, results carry the cleaned interval series.
    #[serde(default)]
    pub emit_cleaned_intervals: bool,
}

impl Default for PrvConfig {
    fn default() -> Self {
        Self {
            v: default_v(),
            clean: NnCleanConfig::default(),
            time_domain: PrvTimeDomainConfig::default(),
            frequency: PrvFrequencyConfig::default(),
            emit_cleaned_intervals: false,
        }
    }
}

impl PrvConfig {
    /// Parse from JSON, applying defaults for missing fields. `None` and
    /// empty strings resolve to the default configuration.
    pub fn from_json(config_json: Option<&str>) -> Result<Self, ConfigError> {
        let config = match config_json {
            None => Self::default(),
            Some(raw) if raw.trim().is_empty() || raw.trim() == "null" => Self::default(),
            Some(raw) => {
                serde_json::from_str::<Self>(raw).map_err(|e| ConfigError(e.to_string()))?
            }
        };
        config.validate()?;
        Ok(config)
    }

    /// Reject configurations the v1 engine cannot honor.
    pub fn validate(&self) -> Result<(), ConfigError> {
        if self.v != 1 {
            return Err(ConfigError(format!(
                "unsupported config version {}",
                self.v
            )));
        }
        if !(self.clean.min_ms.is_finite() && self.clean.max_ms.is_finite())
            || self.clean.min_ms <= 0.0
            || self.clean.min_ms >= self.clean.max_ms
        {
            return Err(ConfigError(
                "clean.minMs must satisfy 0 < minMs < maxMs".into(),
            ));
        }
        if !self.clean.median_tolerance.is_finite() || self.clean.median_tolerance < 0.0 {
            return Err(ConfigError("clean.medianTolerance must be >= 0".into()));
        }
        for (name, threshold) in [
            (
                "pnnShortThresholdMs",
                self.time_domain.pnn_short_threshold_ms,
            ),
            ("pnnLongThresholdMs", self.time_domain.pnn_long_threshold_ms),
        ] {
            if !threshold.is_finite() || threshold < 0.0 {
                return Err(ConfigError(format!("timeDomain.{name} must be >= 0")));
            }
        }
        if !self.frequency.resample_hz.is_finite() || self.frequency.resample_hz <= 0.0 {
            return Err(ConfigError("frequency.resampleHz must be > 0".into()));
        }
        for (name, [low, high]) in [
            ("lfBandHz", self.frequency.lf_band_hz),
            ("hfBandHz", self.frequency.hf_band_hz),
        ] {
            if !low.is_finite() || !high.is_finite() || low <= 0.0 || low >= high {
                return Err(ConfigError(format!(
                    "frequency.{name} must satisfy 0 < low < high"
                )));
            }
        }
        if !self.frequency.segment_seconds.is_finite() || self.frequency.segment_seconds <= 0.0 {
            return Err(ConfigError("frequency.segmentSeconds must be > 0".into()));
        }
        if !(0.0..1.0).contains(&self.frequency.overlap_ratio) {
            return Err(ConfigError(
                "frequency.overlapRatio must be in [0, 1)".into(),
            ));
        }
        if self.frequency.min_intervals < 2 {
            return Err(ConfigError("frequency.minIntervals must be >= 2".into()));
        }
        for (name, value) in [
            (
                "minLfDurationSeconds",
                self.frequency.min_lf_duration_seconds,
            ),
            (
                "minHfDurationSeconds",
                self.frequency.min_hf_duration_seconds,
            ),
            ("minCyclesInSegment", self.frequency.min_cycles_in_segment),
        ] {
            if !value.is_finite() || value < 0.0 {
                return Err(ConfigError(format!("frequency.{name} must be >= 0")));
            }
        }
        Ok(())
    }

    /// Stable identity hash of the fully-resolved configuration.
    pub fn config_id(&self) -> String {
        config_id_for("prv1", self)
    }
}

/// Sustained-activation epoch parameters. `algorithm: activation_epoch@1`.
///
/// See [`crate::activation_epoch`] for the full output contract; these are the
/// knobs that decide when the detector withholds instead of reporting.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActivationEpochConfig {
    /// Config schema version; only 1 is valid.
    #[serde(default = "default_v")]
    pub v: u32,
    /// Leading window (seconds from the recording start) used as the baseline.
    #[serde(default = "default_baseline_window_seconds")]
    pub baseline_window_seconds: f64,
    /// The baseline window must span at least this long, else the whole
    /// result is withheld — a baseline too short to characterize resting
    /// state cannot support any of the downstream metrics.
    #[serde(default = "default_min_baseline_seconds")]
    pub min_baseline_seconds: f64,
    /// Activation threshold in robust (MAD-scaled) units above the baseline
    /// median.
    #[serde(default = "default_activation_k")]
    pub activation_k: f64,
    /// Floor on the activation threshold in signal units, for signals whose
    /// baseline MAD is degenerate (e.g. a quantized or perfectly flat index).
    #[serde(default)]
    pub min_absolute_rise: f64,
    /// An above-threshold run must last at least this long to count as a
    /// sustained activation (this is what rejects transient spikes).
    #[serde(default = "default_min_sustained_seconds")]
    pub min_sustained_seconds: f64,
    /// The recording must continue at least this long past the peak before
    /// any recovery metric is reported.
    #[serde(default = "default_min_recovery_seconds")]
    pub min_recovery_seconds: f64,
    /// Return-to-baseline target as a fraction of the activation amplitude
    /// (0.10 = "within 10% of baseline").
    #[serde(default = "default_recovery_fraction")]
    pub recovery_fraction: f64,
}

fn default_baseline_window_seconds() -> f64 {
    60.0
}
fn default_min_baseline_seconds() -> f64 {
    20.0
}
fn default_activation_k() -> f64 {
    2.0
}
fn default_min_sustained_seconds() -> f64 {
    10.0
}
fn default_min_recovery_seconds() -> f64 {
    10.0
}
fn default_recovery_fraction() -> f64 {
    0.10
}

impl Default for ActivationEpochConfig {
    fn default() -> Self {
        Self {
            v: default_v(),
            baseline_window_seconds: default_baseline_window_seconds(),
            min_baseline_seconds: default_min_baseline_seconds(),
            activation_k: default_activation_k(),
            min_absolute_rise: 0.0,
            min_sustained_seconds: default_min_sustained_seconds(),
            min_recovery_seconds: default_min_recovery_seconds(),
            recovery_fraction: default_recovery_fraction(),
        }
    }
}

impl ActivationEpochConfig {
    /// Parse from JSON, applying defaults for missing fields.
    pub fn from_json(config_json: Option<&str>) -> Result<Self, ConfigError> {
        let config = match config_json {
            None => Self::default(),
            Some(raw) if raw.trim().is_empty() || raw.trim() == "null" => Self::default(),
            Some(raw) => {
                serde_json::from_str::<Self>(raw).map_err(|e| ConfigError(e.to_string()))?
            }
        };
        config.validate()?;
        Ok(config)
    }

    /// Reject configurations the v1 engine cannot honor.
    pub fn validate(&self) -> Result<(), ConfigError> {
        if self.v != 1 {
            return Err(ConfigError(format!(
                "unsupported config version {}",
                self.v
            )));
        }
        for (name, value) in [
            ("baselineWindowSeconds", self.baseline_window_seconds),
            ("minBaselineSeconds", self.min_baseline_seconds),
            ("activationK", self.activation_k),
            ("minAbsoluteRise", self.min_absolute_rise),
            ("minSustainedSeconds", self.min_sustained_seconds),
            ("minRecoverySeconds", self.min_recovery_seconds),
        ] {
            if !value.is_finite() || value < 0.0 {
                return Err(ConfigError(format!("{name} must be finite and >= 0")));
            }
        }
        if self.baseline_window_seconds < self.min_baseline_seconds {
            return Err(ConfigError(
                "baselineWindowSeconds must be >= minBaselineSeconds (else no recording can ever qualify)"
                    .into(),
            ));
        }
        if !(0.0..1.0).contains(&self.recovery_fraction) {
            return Err(ConfigError("recoveryFraction must be in [0, 1)".into()));
        }
        Ok(())
    }

    /// Stable identity hash of the fully-resolved configuration.
    pub fn config_id(&self) -> String {
        config_id_for("actep1", self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_round_trips_and_validates() {
        let config = EegWindowConfig::default();
        assert!(config.validate().is_ok());
        let json = serde_json::to_string(&config).unwrap();
        let parsed = EegWindowConfig::from_json(Some(&json)).unwrap();
        assert_eq!(parsed, config);
    }

    #[test]
    fn from_json_none_and_null_yield_defaults() {
        assert_eq!(
            EegWindowConfig::from_json(None).unwrap(),
            EegWindowConfig::default()
        );
        assert_eq!(
            EegWindowConfig::from_json(Some("null")).unwrap(),
            EegWindowConfig::default()
        );
        assert_eq!(
            EegWindowConfig::from_json(Some("  ")).unwrap(),
            EegWindowConfig::default()
        );
        assert_eq!(
            EegWindowConfig::from_json(Some("{}")).unwrap(),
            EegWindowConfig::default()
        );
    }

    #[test]
    fn partial_json_overrides_only_named_fields() {
        let parsed =
            EegWindowConfig::from_json(Some(r#"{"welch":{"segmentSeconds":2.0}}"#)).unwrap();
        assert_eq!(parsed.welch.segment_seconds, 2.0);
        assert_eq!(parsed.welch.overlap_ratio, 0.5);
        assert_eq!(parsed.bands, BandsConfig::default());
    }

    #[test]
    fn unknown_fields_are_rejected() {
        assert!(EegWindowConfig::from_json(Some(r#"{"nope":1}"#)).is_err());
    }

    #[test]
    fn invalid_version_window_detrend_rejected() {
        assert!(EegWindowConfig::from_json(Some(r#"{"v":2}"#)).is_err());
        assert!(EegWindowConfig::from_json(Some(r#"{"welch":{"window":"hamming"}}"#)).is_err());
        assert!(EegWindowConfig::from_json(Some(r#"{"welch":{"detrend":"linear"}}"#)).is_err());
    }

    #[test]
    fn invalid_band_edges_rejected() {
        assert!(EegWindowConfig::from_json(Some(r#"{"bands":{"alpha":[13,8]}}"#)).is_err());
    }

    #[test]
    fn config_id_is_stable_and_sensitive() {
        let a = EegWindowConfig::default();
        let b = EegWindowConfig::default();
        assert_eq!(a.config_id(), b.config_id());

        let mut c = EegWindowConfig::default();
        c.welch.segment_seconds = 2.0;
        assert_ne!(a.config_id(), c.config_id());
        assert!(a.config_id().starts_with("eegwin1-"));
    }
}
