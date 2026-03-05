//! Signal processing utilities for EEG data
//!
//! This crate provides common signal processing operations needed for EEG analysis:
//! - FFT computation
//! - Band power extraction
//! - Filtering
//! - Windowing

mod fft;
mod filter;
mod power;
mod window;

pub use fft::{fft, fft_frequencies, magnitude_spectrum, power_spectrum};
pub use filter::{bandpass_filter, highpass_filter, lowpass_filter, notch_filter};
pub use power::{band_power, band_powers, relative_band_power, BandPowers};
pub use window::{apply_window, Window};

pub use eeg_hal::bands;
