//! Analysis model bindings for WASM

use eeg_hal::SampleBuffer;
use eeg_models::{AlphaBumpDetector, AlphaPeakModel, AlphaState, CalmnessModel, Model};
use wasm_bindgen::prelude::*;

/// WASM wrapper for the Alpha Bump Detector
/// Detects transitions between relaxed (eyes closed, high alpha)
/// and alert (eyes open, low alpha) states
#[wasm_bindgen]
pub struct WasmAlphaBumpDetector {
    inner: AlphaBumpDetector,
    sample_rate: u16,
    channel_count: usize,
}

#[wasm_bindgen]
impl WasmAlphaBumpDetector {
    /// Create a new alpha bump detector
    ///
    /// # Arguments
    /// * `sample_rate` - Sample rate in Hz (e.g., 256)
    /// * `channel_count` - Number of EEG channels
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: u16, channel_count: usize) -> Self {
        Self {
            inner: AlphaBumpDetector::new(sample_rate),
            sample_rate,
            channel_count,
        }
    }

    /// Set the threshold multiplier for state detection (default 1.5)
    /// Higher values require larger changes to detect transitions
    pub fn set_threshold(&mut self, multiplier: f32) {
        self.inner.set_threshold(multiplier);
    }

    /// Set the baseline smoothing factor (0-1)
    /// Lower values = slower adaptation = more stable baseline
    pub fn set_baseline_smoothing(&mut self, alpha: f32) {
        self.inner.set_baseline_smoothing(alpha);
    }

    /// Process EEG data and detect alpha state
    ///
    /// # Arguments
    /// * `data` - Float32Array of interleaved EEG samples
    ///           Format: [s0_ch0, s0_ch1, ..., s1_ch0, s1_ch1, ...]
    ///
    /// # Returns
    /// WasmAlphaBumpResult with current state and metrics
    pub fn process(&mut self, data: &[f32]) -> Option<WasmAlphaBumpResult> {
        let mut buffer = SampleBuffer::new(self.sample_rate, self.channel_count);
        buffer.push_interleaved(data, 0, self.sample_rate);

        self.inner
            .process(&buffer)
            .map(|output| WasmAlphaBumpResult {
                state: match output.state {
                    AlphaState::High => "high",
                    AlphaState::Low => "low",
                    AlphaState::Transitioning => "transitioning",
                    AlphaState::Unknown => "unknown",
                }
                .to_string(),
                alpha_power: output.alpha_power,
                baseline: output.baseline,
                state_changed: output.state_changed,
                previous_state: output.previous_state.map(|s| s.as_str().to_string()),
            })
    }

    /// Reset the detector state
    pub fn reset(&mut self) {
        self.inner.reset();
    }

    /// Get the model name
    pub fn name(&self) -> String {
        self.inner.name().to_string()
    }

    /// Get minimum samples required
    pub fn min_samples(&self) -> usize {
        self.inner.min_samples()
    }
}

/// Result from the alpha bump detector
#[wasm_bindgen]
pub struct WasmAlphaBumpResult {
    state: String,
    alpha_power: f32,
    baseline: f32,
    state_changed: bool,
    previous_state: Option<String>,
}

#[wasm_bindgen]
impl WasmAlphaBumpResult {
    /// Current alpha state: "high", "low", "transitioning", or "unknown"
    #[wasm_bindgen(getter)]
    pub fn state(&self) -> String {
        self.state.clone()
    }

    /// Current alpha power level
    #[wasm_bindgen(getter)]
    pub fn alpha_power(&self) -> f32 {
        self.alpha_power
    }

    /// Running baseline alpha power
    #[wasm_bindgen(getter)]
    pub fn baseline(&self) -> f32 {
        self.baseline
    }

    /// Whether state changed in this update
    #[wasm_bindgen(getter)]
    pub fn state_changed(&self) -> bool {
        self.state_changed
    }

    /// Previous state if changed
    #[wasm_bindgen(getter)]
    pub fn previous_state(&self) -> Option<String> {
        self.previous_state.clone()
    }

    /// Is this a "high alpha" (relaxed/eyes closed) state?
    pub fn is_high(&self) -> bool {
        self.state == "high"
    }

    /// Is this a "low alpha" (alert/eyes open) state?
    pub fn is_low(&self) -> bool {
        self.state == "low"
    }
}

/// WASM wrapper for the Alpha Peak Model
/// Finds the dominant frequency within the alpha band (8-13 Hz)
#[wasm_bindgen]
pub struct WasmAlphaPeakModel {
    inner: AlphaPeakModel,
    sample_rate: u16,
    channel_count: usize,
}

#[wasm_bindgen]
impl WasmAlphaPeakModel {
    /// Create a new alpha peak model
    ///
    /// # Arguments
    /// * `sample_rate` - Sample rate in Hz (e.g., 256)
    /// * `channel_count` - Number of EEG channels
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: u16, channel_count: usize) -> Self {
        Self {
            inner: AlphaPeakModel::new(sample_rate),
            sample_rate,
            channel_count,
        }
    }

    /// Set the smoothing factor (0-1)
    /// Higher values = faster response to changes
    pub fn set_smoothing(&mut self, alpha: f32) {
        self.inner.set_smoothing(alpha);
    }

    /// Process EEG data and compute alpha peak metrics
    ///
    /// # Arguments
    /// * `data` - Float32Array of interleaved EEG samples
    ///           Format: [s0_ch0, s0_ch1, ..., s1_ch0, s1_ch1, ...]
    ///
    /// # Returns
    /// WasmAlphaPeakResult with peak frequency and metrics
    pub fn process(&mut self, data: &[f32]) -> Option<WasmAlphaPeakResult> {
        let mut buffer = SampleBuffer::new(self.sample_rate, self.channel_count);
        buffer.push_interleaved(data, 0, self.sample_rate);

        self.inner
            .process(&buffer)
            .map(|output| WasmAlphaPeakResult {
                peak_frequency: output.peak_frequency,
                smoothed_peak_frequency: output.smoothed_peak_frequency,
                long_term_peak_frequency: output.long_term_peak_frequency,
                peak_power: output.peak_power,
                alpha_power: output.alpha_power,
                snr: output.snr,
            })
    }

    /// Reset the model state
    pub fn reset(&mut self) {
        self.inner.reset();
    }

    /// Get the model name
    pub fn name(&self) -> String {
        self.inner.name().to_string()
    }

    /// Get minimum samples required
    pub fn min_samples(&self) -> usize {
        self.inner.min_samples()
    }
}

/// Result from the alpha peak model
#[wasm_bindgen]
pub struct WasmAlphaPeakResult {
    peak_frequency: f32,
    smoothed_peak_frequency: f32,
    long_term_peak_frequency: f32,
    peak_power: f32,
    alpha_power: f32,
    snr: f32,
}

#[wasm_bindgen]
impl WasmAlphaPeakResult {
    /// Peak frequency within the alpha band (Hz)
    #[wasm_bindgen(getter)]
    pub fn peak_frequency(&self) -> f32 {
        self.peak_frequency
    }

    /// Smoothed peak frequency within the alpha band (Hz)
    #[wasm_bindgen(getter)]
    pub fn smoothed_peak_frequency(&self) -> f32 {
        self.smoothed_peak_frequency
    }

    /// Long-term peak frequency estimate (Hz)
    #[wasm_bindgen(getter)]
    pub fn long_term_peak_frequency(&self) -> f32 {
        self.long_term_peak_frequency
    }

    /// Peak power at the alpha peak frequency
    #[wasm_bindgen(getter)]
    pub fn peak_power(&self) -> f32 {
        self.peak_power
    }

    /// Average power across the alpha band
    #[wasm_bindgen(getter)]
    pub fn alpha_power(&self) -> f32 {
        self.alpha_power
    }

    /// Signal-to-noise ratio within the alpha band
    #[wasm_bindgen(getter)]
    pub fn snr(&self) -> f32 {
        self.snr
    }
}

/// WASM wrapper for the Calmness Model
/// Computes a continuous calmness score based on EEG frequency ratios
#[wasm_bindgen]
pub struct WasmCalmnessModel {
    inner: CalmnessModel,
    sample_rate: u16,
    channel_count: usize,
}

#[wasm_bindgen]
impl WasmCalmnessModel {
    /// Create a new calmness model
    ///
    /// # Arguments
    /// * `sample_rate` - Sample rate in Hz (e.g., 256)
    /// * `channel_count` - Number of EEG channels
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: u16, channel_count: usize) -> Self {
        Self {
            inner: CalmnessModel::new(sample_rate),
            sample_rate,
            channel_count,
        }
    }

    /// Set the smoothing factor (0-1)
    /// Higher values = faster response to changes
    pub fn set_smoothing(&mut self, alpha: f32) {
        self.inner.set_smoothing(alpha);
    }

    /// Process EEG data and compute calmness score
    ///
    /// # Arguments
    /// * `data` - Float32Array of interleaved EEG samples
    ///           Format: [s0_ch0, s0_ch1, ..., s1_ch0, s1_ch1, ...]
    ///
    /// # Returns
    /// WasmCalmnessResult with calmness score and metrics
    pub fn process(&mut self, data: &[f32]) -> Option<WasmCalmnessResult> {
        let mut buffer = SampleBuffer::new(self.sample_rate, self.channel_count);
        buffer.push_interleaved(data, 0, self.sample_rate);

        self.inner
            .process(&buffer)
            .map(|output| WasmCalmnessResult {
                score: output.score,
                smoothed_score: output.smoothed_score,
                alpha_beta_ratio: output.alpha_beta_ratio,
                theta_level: output.theta_level,
                alpha_power: output.alpha_power,
                beta_power: output.beta_power,
                theta_power: output.theta_power,
            })
    }

    /// Reset the model state
    pub fn reset(&mut self) {
        self.inner.reset();
    }

    /// Get the model name
    pub fn name(&self) -> String {
        self.inner.name().to_string()
    }

    /// Get minimum samples required
    pub fn min_samples(&self) -> usize {
        self.inner.min_samples()
    }
}

/// Result from the calmness model
#[wasm_bindgen]
pub struct WasmCalmnessResult {
    score: f32,
    smoothed_score: f32,
    alpha_beta_ratio: f32,
    theta_level: f32,
    alpha_power: f32,
    beta_power: f32,
    theta_power: f32,
}

#[wasm_bindgen]
impl WasmCalmnessResult {
    /// Raw calmness score (0.0 = alert, 1.0 = very calm)
    #[wasm_bindgen(getter)]
    pub fn score(&self) -> f32 {
        self.score
    }

    /// Smoothed calmness score (less jittery)
    #[wasm_bindgen(getter)]
    pub fn smoothed_score(&self) -> f32 {
        self.smoothed_score
    }

    /// Alpha/beta power ratio (primary calmness indicator)
    #[wasm_bindgen(getter)]
    pub fn alpha_beta_ratio(&self) -> f32 {
        self.alpha_beta_ratio
    }

    /// Theta power level
    #[wasm_bindgen(getter)]
    pub fn theta_level(&self) -> f32 {
        self.theta_level
    }

    /// Alpha band power
    #[wasm_bindgen(getter)]
    pub fn alpha_power(&self) -> f32 {
        self.alpha_power
    }

    /// Beta band power
    #[wasm_bindgen(getter)]
    pub fn beta_power(&self) -> f32 {
        self.beta_power
    }

    /// Theta band power
    #[wasm_bindgen(getter)]
    pub fn theta_power(&self) -> f32 {
        self.theta_power
    }

    /// Get calmness as percentage (0-100)
    pub fn percentage(&self) -> f32 {
        self.smoothed_score * 100.0
    }

    /// Get state description: "very calm", "calm", "neutral", or "alert"
    pub fn state_description(&self) -> String {
        if self.smoothed_score > 0.7 {
            "very calm".to_string()
        } else if self.smoothed_score > 0.5 {
            "calm".to_string()
        } else if self.smoothed_score > 0.3 {
            "neutral".to_string()
        } else {
            "alert".to_string()
        }
    }
}
