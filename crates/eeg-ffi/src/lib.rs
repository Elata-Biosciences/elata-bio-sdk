//! FFI bindings for EEG SDK
//!
//! Provides cross-language bindings via UniFFI for iOS (Swift) and Android (Kotlin).

use eeg_hal::bands;
use eeg_hal::SampleBuffer;
use eeg_models::{
    AlphaBumpDetector as RustAlphaBumpDetector, CalmnessModel as RustCalmnessModel, Model,
};
use eeg_signal::{
    band_power, band_powers as compute_band_powers, fft, fft_frequencies, power_spectrum,
};
use std::sync::Mutex;

uniffi::setup_scaffolding!();

/// Get SDK version
#[uniffi::export]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Error types for FFI
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum EegError {
    #[error("Invalid data provided")]
    InvalidData,
    #[error("Processing error occurred")]
    ProcessingError,
    #[error("Not enough samples for processing")]
    NotEnoughSamples,
}

/// Band power results
#[derive(Debug, Clone, uniffi::Record)]
pub struct BandPowers {
    pub delta: f32,
    pub theta: f32,
    pub alpha: f32,
    pub beta: f32,
    pub gamma: f32,
}

/// Frequency band range
#[derive(Debug, Clone, uniffi::Record)]
pub struct BandRange {
    pub low: f32,
    pub high: f32,
}

/// EEG frequency band definitions
#[derive(uniffi::Object)]
pub struct EegBands;

#[uniffi::export]
impl EegBands {
    #[uniffi::constructor]
    pub fn new() -> Self {
        Self
    }

    pub fn get_delta(&self) -> BandRange {
        BandRange {
            low: bands::DELTA.0,
            high: bands::DELTA.1,
        }
    }

    pub fn get_theta(&self) -> BandRange {
        BandRange {
            low: bands::THETA.0,
            high: bands::THETA.1,
        }
    }

    pub fn get_alpha(&self) -> BandRange {
        BandRange {
            low: bands::ALPHA.0,
            high: bands::ALPHA.1,
        }
    }

    pub fn get_beta(&self) -> BandRange {
        BandRange {
            low: bands::BETA.0,
            high: bands::BETA.1,
        }
    }

    pub fn get_gamma(&self) -> BandRange {
        BandRange {
            low: bands::GAMMA.0,
            high: bands::GAMMA.1,
        }
    }
}

/// Signal processing functions
#[derive(uniffi::Object)]
pub struct SignalProcessor {
    sample_rate: f32,
}

#[uniffi::export]
impl SignalProcessor {
    #[uniffi::constructor]
    pub fn new(sample_rate: u16) -> Self {
        Self {
            sample_rate: sample_rate as f32,
        }
    }

    pub fn compute_band_powers(&self, data: Vec<f32>) -> Result<BandPowers, EegError> {
        if data.is_empty() {
            return Err(EegError::InvalidData);
        }
        let powers = compute_band_powers(&data, self.sample_rate);
        Ok(BandPowers {
            delta: powers.delta,
            theta: powers.theta,
            alpha: powers.alpha,
            beta: powers.beta,
            gamma: powers.gamma,
        })
    }

    pub fn alpha_power(&self, data: Vec<f32>) -> Result<f32, EegError> {
        if data.is_empty() {
            return Err(EegError::InvalidData);
        }
        Ok(band_power(&data, self.sample_rate, bands::ALPHA))
    }

    pub fn beta_power(&self, data: Vec<f32>) -> Result<f32, EegError> {
        if data.is_empty() {
            return Err(EegError::InvalidData);
        }
        Ok(band_power(&data, self.sample_rate, bands::BETA))
    }

    pub fn theta_power(&self, data: Vec<f32>) -> Result<f32, EegError> {
        if data.is_empty() {
            return Err(EegError::InvalidData);
        }
        Ok(band_power(&data, self.sample_rate, bands::THETA))
    }

    pub fn delta_power(&self, data: Vec<f32>) -> Result<f32, EegError> {
        if data.is_empty() {
            return Err(EegError::InvalidData);
        }
        Ok(band_power(&data, self.sample_rate, bands::DELTA))
    }

    pub fn gamma_power(&self, data: Vec<f32>) -> Result<f32, EegError> {
        if data.is_empty() {
            return Err(EegError::InvalidData);
        }
        Ok(band_power(&data, self.sample_rate, bands::GAMMA))
    }

    pub fn custom_band_power(
        &self,
        data: Vec<f32>,
        low_freq: f32,
        high_freq: f32,
    ) -> Result<f32, EegError> {
        if data.is_empty() {
            return Err(EegError::InvalidData);
        }
        Ok(band_power(&data, self.sample_rate, (low_freq, high_freq)))
    }

    pub fn power_spectrum(&self, data: Vec<f32>) -> Result<Vec<f32>, EegError> {
        if data.is_empty() {
            return Err(EegError::InvalidData);
        }
        let fft_result = fft(&data);
        Ok(power_spectrum(&fft_result))
    }

    pub fn fft_frequencies(&self, sample_count: u32) -> Vec<f32> {
        let n = (sample_count as usize).next_power_of_two();
        fft_frequencies(n, self.sample_rate)
    }
}

/// Alpha state enum for FFI
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum AlphaState {
    High,
    Low,
    Transitioning,
    Unknown,
}

impl From<eeg_models::AlphaState> for AlphaState {
    fn from(state: eeg_models::AlphaState) -> Self {
        match state {
            eeg_models::AlphaState::High => AlphaState::High,
            eeg_models::AlphaState::Low => AlphaState::Low,
            eeg_models::AlphaState::Transitioning => AlphaState::Transitioning,
            eeg_models::AlphaState::Unknown => AlphaState::Unknown,
        }
    }
}

/// Alpha bump detection result
#[derive(Debug, Clone, uniffi::Record)]
pub struct AlphaBumpResult {
    pub state: AlphaState,
    pub alpha_power: f32,
    pub baseline: f32,
    pub state_changed: bool,
}

/// Alpha bump detector
#[derive(uniffi::Object)]
pub struct AlphaBumpDetector {
    inner: Mutex<RustAlphaBumpDetector>,
    sample_rate: u16,
    channel_count: usize,
}

#[uniffi::export]
impl AlphaBumpDetector {
    #[uniffi::constructor]
    pub fn new(sample_rate: u16, channel_count: u32) -> Self {
        Self {
            inner: Mutex::new(RustAlphaBumpDetector::new(sample_rate)),
            sample_rate,
            channel_count: channel_count as usize,
        }
    }

    pub fn process(&self, interleaved_data: Vec<f32>) -> Result<Option<AlphaBumpResult>, EegError> {
        let mut detector = self.inner.lock().map_err(|_| EegError::ProcessingError)?;

        let samples_per_channel = interleaved_data.len() / self.channel_count;
        if samples_per_channel < detector.min_samples() {
            return Ok(None);
        }

        let mut buffer = SampleBuffer::new(self.sample_rate, self.channel_count);
        buffer.push_interleaved(&interleaved_data, 0, self.sample_rate);

        match detector.process(&buffer) {
            Some(output) => Ok(Some(AlphaBumpResult {
                state: output.state.into(),
                alpha_power: output.alpha_power,
                baseline: output.baseline,
                state_changed: output.state_changed,
            })),
            None => Ok(None),
        }
    }

    pub fn set_threshold(&self, multiplier: f32) {
        if let Ok(mut detector) = self.inner.lock() {
            detector.set_threshold(multiplier);
        }
    }

    pub fn set_baseline_smoothing(&self, alpha: f32) {
        if let Ok(mut detector) = self.inner.lock() {
            detector.set_baseline_smoothing(alpha);
        }
    }

    pub fn reset(&self) {
        if let Ok(mut detector) = self.inner.lock() {
            detector.reset();
        }
    }

    pub fn min_samples(&self) -> u32 {
        self.inner
            .lock()
            .map(|d| d.min_samples() as u32)
            .unwrap_or(0)
    }

    pub fn name(&self) -> String {
        self.inner
            .lock()
            .map(|d| d.name().to_string())
            .unwrap_or_else(|_| "Alpha Bump Detector".to_string())
    }
}

// ---------------- rPPG FFI wrapper ----------------

#[derive(Debug, Clone, uniffi::Record)]
pub struct RppgMetricsRecord {
    pub bpm: Option<f32>,
    pub confidence: f32,
    pub signal_quality: f32,
}

#[derive(uniffi::Object)]
pub struct RppgPipelineFFI {
    inner: Mutex<rppg::RppgPipeline>,
}

#[uniffi::export]
impl RppgPipelineFFI {
    #[uniffi::constructor]
    pub fn new(sample_rate: u16, window_sec: f32) -> Self {
        Self {
            inner: Mutex::new(rppg::RppgPipeline::new(sample_rate as f32, window_sec)),
        }
    }

    pub fn push_sample(&self, timestamp_ms: i64, intensity: f32) {
        if let Ok(mut p) = self.inner.lock() {
            p.push_sample(timestamp_ms, intensity);
        }
    }

    pub fn get_metrics(&self) -> Result<RppgMetricsRecord, EegError> {
        if let Ok(mut p) = self.inner.lock() {
            let m = p.get_metrics();
            Ok(RppgMetricsRecord {
                bpm: m.bpm,
                confidence: m.confidence,
                signal_quality: m.signal_quality,
            })
        } else {
            Err(EegError::ProcessingError)
        }
    }
}

/// Calmness model result
#[derive(Debug, Clone, uniffi::Record)]
pub struct CalmnessResult {
    pub score: f32,
    pub smoothed_score: f32,
    pub alpha_beta_ratio: f32,
    pub alpha_power: f32,
    pub beta_power: f32,
    pub theta_power: f32,
}

/// Calmness model
#[derive(uniffi::Object)]
pub struct CalmnessModel {
    inner: Mutex<RustCalmnessModel>,
    sample_rate: u16,
    channel_count: usize,
}

#[uniffi::export]
impl CalmnessModel {
    #[uniffi::constructor]
    pub fn new(sample_rate: u16, channel_count: u32) -> Self {
        Self {
            inner: Mutex::new(RustCalmnessModel::new(sample_rate)),
            sample_rate,
            channel_count: channel_count as usize,
        }
    }

    pub fn process(&self, interleaved_data: Vec<f32>) -> Result<Option<CalmnessResult>, EegError> {
        let mut model = self.inner.lock().map_err(|_| EegError::ProcessingError)?;

        let samples_per_channel = interleaved_data.len() / self.channel_count;
        if samples_per_channel < model.min_samples() {
            return Ok(None);
        }

        let mut buffer = SampleBuffer::new(self.sample_rate, self.channel_count);
        buffer.push_interleaved(&interleaved_data, 0, self.sample_rate);

        match model.process(&buffer) {
            Some(output) => Ok(Some(CalmnessResult {
                score: output.score,
                smoothed_score: output.smoothed_score,
                alpha_beta_ratio: output.alpha_beta_ratio,
                alpha_power: output.alpha_power,
                beta_power: output.beta_power,
                theta_power: output.theta_power,
            })),
            None => Ok(None),
        }
    }

    pub fn set_smoothing(&self, alpha: f32) {
        if let Ok(mut model) = self.inner.lock() {
            model.set_smoothing(alpha);
        }
    }

    pub fn reset(&self) {
        if let Ok(mut model) = self.inner.lock() {
            model.reset();
        }
    }

    pub fn min_samples(&self) -> u32 {
        self.inner
            .lock()
            .map(|m| m.min_samples() as u32)
            .unwrap_or(0)
    }

    pub fn name(&self) -> String {
        self.inner
            .lock()
            .map(|m| m.name().to_string())
            .unwrap_or_else(|_| "Calmness Model".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_signal_processor() {
        let processor = SignalProcessor::new(256);

        // Generate test sine wave at 10 Hz (alpha band)
        let data: Vec<f32> = (0..256)
            .map(|i| (2.0 * std::f32::consts::PI * 10.0 * i as f32 / 256.0).sin())
            .collect();

        let powers = processor.compute_band_powers(data).unwrap();
        assert!(powers.alpha > powers.delta);
    }

    #[test]
    fn test_alpha_detector() {
        let detector = AlphaBumpDetector::new(256, 1);
        assert_eq!(detector.name(), "Alpha Bump Detector");
    }

    #[test]
    fn test_calmness_model() {
        let model = CalmnessModel::new(256, 1);
        assert_eq!(model.name(), "Calmness Model");
    }

    #[test]
    fn test_rppg_pipeline_ffi_estimations() {
        // Use a 100 Hz sample rate and 5s window
        let pipeline = RppgPipelineFFI::new(100, 5.0);

        // Generate a 1.2 Hz sine wave (~72 bpm)
        let fs = 100.0;
        let freq = 1.2f32; // 72 bpm
        let n = (fs * 5.0) as usize;
        for i in 0..n {
            let t = i as f32 / fs;
            let intensity = (2.0 * std::f32::consts::PI * freq * t).sin();
            let ts_ms = (t * 1000.0) as i64;
            pipeline.push_sample(ts_ms, intensity);
        }

        let metrics = pipeline.get_metrics().expect("expected metrics");
        assert!(metrics.bpm.is_some());
        let bpm = metrics.bpm.unwrap();
        assert!((bpm - 72.0).abs() < 10.0, "unexpected bpm: {}", bpm);
        assert!(metrics.confidence >= 0.0 && metrics.confidence <= 1.0);
    }
}
