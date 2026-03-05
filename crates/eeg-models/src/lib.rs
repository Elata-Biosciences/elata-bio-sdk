//! EEG Analysis Models
//!
//! This crate provides analysis models that process EEG data from the HAL.
//! Currently implemented models:
//!
//! - **Alpha Bump Detection**: Detects changes in alpha band power, indicating
//!   transitions between relaxed (eyes closed) and alert (eyes open) states.
//!
//! - **Alpha Peak Model**: Finds the dominant frequency within the alpha band
//!   (8-13 Hz) and reports its power and signal-to-noise ratio.
//!
//! - **Calmness Model**: Computes a continuous calmness score based on the
//!   ratio of relaxation-associated frequencies (alpha, theta) to
//!   alertness-associated frequencies (beta).
//!
//! # Usage
//!
//! ```no_run
//! use eeg_models::{Model, AlphaBumpDetector, AlphaPeakModel, CalmnessModel};
//! use eeg_hal::SampleBuffer;
//!
//! // Create models
//! let mut alpha_detector = AlphaBumpDetector::new(256);
//! let mut alpha_peak = AlphaPeakModel::new(256);
//! let mut calmness = CalmnessModel::new(256);
//!
//! // Process data (assuming buffer is filled from a device)
//! let buffer = SampleBuffer::new(256, 4);
//! // ... fill buffer ...
//!
//! // Get analysis results
//! // let alpha_result = alpha_detector.process(&buffer);
//! // let alpha_peak_result = alpha_peak.process(&buffer);
//! // let calmness_result = calmness.process(&buffer);
//! ```

mod alpha_bump;
mod alpha_peak;
mod calmness;
mod model;

pub use alpha_bump::{AlphaBumpDetector, AlphaBumpOutput, AlphaState};
pub use alpha_peak::{AlphaPeakModel, AlphaPeakOutput};
pub use calmness::{CalmnessModel, CalmnessOutput};
pub use model::{Model, ModelOutput};
