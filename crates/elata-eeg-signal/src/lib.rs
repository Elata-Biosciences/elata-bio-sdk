//! Signal processing utilities for EEG data
//!
//! This crate provides common signal processing operations needed for EEG analysis:
//! - FFT computation
//! - Band power extraction
//! - Filtering
//! - Windowing
//!
//! It is designed to work with samples buffered through `elata-eeg-hal`.
//!
//! # Example
//!
//! ```rust
//! use elata_eeg_signal::{band_power, bands};
//!
//! let signal = vec![0.0; 256];
//! let sample_rate = 256.0;
//! let alpha_power = band_power(&signal, sample_rate, bands::ALPHA);
//!
//! assert!(alpha_power >= 0.0);
//! ```

mod fft;
mod filter;
mod preprocess;
mod power;
mod window;

pub use fft::{fft, fft_frequencies, magnitude_spectrum, power_spectrum};
pub use filter::{bandpass_filter, highpass_filter, lowpass_filter, notch_filter, BiquadFilter};
pub use preprocess::{
    DetrendConfig, DetrendMode, EegPreprocessorConfig, NotchConfig, ReferenceConfig,
    ReferenceMode, StreamingEegPreprocessor,
};
pub use power::{band_power, band_powers, relative_band_power, BandPowers};
pub use window::{apply_window, Window};

pub use elata_eeg_hal::bands;
