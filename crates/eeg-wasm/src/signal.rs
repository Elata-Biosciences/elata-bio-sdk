//! Signal processing bindings for WASM

use eeg_hal::bands;
use eeg_signal::{
    band_power, band_powers as compute_band_powers, fft, fft_frequencies, power_spectrum,
    BandPowers,
};
use wasm_bindgen::prelude::*;

/// Compute band powers from EEG signal data
/// Returns an object with delta, theta, alpha, beta, gamma powers
#[wasm_bindgen]
pub struct WasmBandPowers {
    inner: BandPowers,
}

#[wasm_bindgen]
impl WasmBandPowers {
    #[wasm_bindgen(getter)]
    pub fn delta(&self) -> f32 {
        self.inner.delta
    }

    #[wasm_bindgen(getter)]
    pub fn theta(&self) -> f32 {
        self.inner.theta
    }

    #[wasm_bindgen(getter)]
    pub fn alpha(&self) -> f32 {
        self.inner.alpha
    }

    #[wasm_bindgen(getter)]
    pub fn beta(&self) -> f32 {
        self.inner.beta
    }

    #[wasm_bindgen(getter)]
    pub fn gamma(&self) -> f32 {
        self.inner.gamma
    }

    #[wasm_bindgen(getter)]
    pub fn total(&self) -> f32 {
        self.inner.total()
    }

    /// Get relative powers (each band as fraction of total)
    pub fn relative(&self) -> WasmBandPowers {
        WasmBandPowers {
            inner: self.inner.relative(),
        }
    }
}

/// Compute band powers for a single channel of EEG data
///
/// # Arguments
/// * `data` - Float32Array of EEG samples (microvolts)
/// * `sample_rate` - Sample rate in Hz (e.g., 256)
///
/// # Returns
/// WasmBandPowers object with power in each frequency band
#[wasm_bindgen]
pub fn band_powers(data: &[f32], sample_rate: f32) -> WasmBandPowers {
    let powers = compute_band_powers(data, sample_rate);
    WasmBandPowers { inner: powers }
}

/// Compute power in the alpha band (8-13 Hz)
#[wasm_bindgen]
pub fn alpha_power(data: &[f32], sample_rate: f32) -> f32 {
    band_power(data, sample_rate, bands::ALPHA)
}

/// Compute power in the beta band (13-30 Hz)
#[wasm_bindgen]
pub fn beta_power(data: &[f32], sample_rate: f32) -> f32 {
    band_power(data, sample_rate, bands::BETA)
}

/// Compute power in the theta band (4-8 Hz)
#[wasm_bindgen]
pub fn theta_power(data: &[f32], sample_rate: f32) -> f32 {
    band_power(data, sample_rate, bands::THETA)
}

/// Compute power in the delta band (0.5-4 Hz)
#[wasm_bindgen]
pub fn delta_power(data: &[f32], sample_rate: f32) -> f32 {
    band_power(data, sample_rate, bands::DELTA)
}

/// Compute power in the gamma band (30-100 Hz)
#[wasm_bindgen]
pub fn gamma_power(data: &[f32], sample_rate: f32) -> f32 {
    band_power(data, sample_rate, bands::GAMMA)
}

/// Compute power in a custom frequency band
///
/// # Arguments
/// * `data` - Float32Array of EEG samples
/// * `sample_rate` - Sample rate in Hz
/// * `low_freq` - Lower bound of frequency band (Hz)
/// * `high_freq` - Upper bound of frequency band (Hz)
#[wasm_bindgen]
pub fn custom_band_power(data: &[f32], sample_rate: f32, low_freq: f32, high_freq: f32) -> f32 {
    band_power(data, sample_rate, (low_freq, high_freq))
}

/// Compute the power spectrum of EEG data
/// Returns Float32Array of power values for each frequency bin
#[wasm_bindgen]
pub fn compute_power_spectrum(data: &[f32]) -> Vec<f32> {
    let fft_result = fft(data);
    power_spectrum(&fft_result)
}

/// Get frequency values corresponding to FFT bins
///
/// # Arguments
/// * `n` - Number of samples (should match data length used in FFT)
/// * `sample_rate` - Sample rate in Hz
#[wasm_bindgen]
pub fn get_fft_frequencies(n: usize, sample_rate: f32) -> Vec<f32> {
    fft_frequencies(n.next_power_of_two(), sample_rate)
}

/// Standard EEG band definitions (for reference)
#[wasm_bindgen]
pub struct EegBands;

#[wasm_bindgen]
impl EegBands {
    /// Delta band: 0.5-4 Hz (deep sleep)
    #[wasm_bindgen(getter)]
    pub fn delta() -> Vec<f32> {
        vec![bands::DELTA.0, bands::DELTA.1]
    }

    /// Theta band: 4-8 Hz (drowsiness, meditation)
    #[wasm_bindgen(getter)]
    pub fn theta() -> Vec<f32> {
        vec![bands::THETA.0, bands::THETA.1]
    }

    /// Alpha band: 8-13 Hz (relaxed, eyes closed)
    #[wasm_bindgen(getter)]
    pub fn alpha() -> Vec<f32> {
        vec![bands::ALPHA.0, bands::ALPHA.1]
    }

    /// Beta band: 13-30 Hz (active thinking, focus)
    #[wasm_bindgen(getter)]
    pub fn beta() -> Vec<f32> {
        vec![bands::BETA.0, bands::BETA.1]
    }

    /// Gamma band: 30-100 Hz (high-level cognition)
    #[wasm_bindgen(getter)]
    pub fn gamma() -> Vec<f32> {
        vec![bands::GAMMA.0, bands::GAMMA.1]
    }
}
