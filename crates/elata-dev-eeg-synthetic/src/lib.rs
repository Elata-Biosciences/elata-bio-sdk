//! Synthetic EEG device for testing and development
//!
//! This crate provides a synthetic EEG device that generates realistic-looking
//! EEG signals without requiring physical hardware. It's useful for:
//! - Testing the pipeline without hardware
//! - Demonstrating the HAL interface
//! - Developing and testing models
//!
//! # Signal Generation
//!
//! The synthetic device generates signals with controllable properties:
//! - Configurable frequency components (alpha, beta, etc.)
//! - Adjustable noise levels
//! - Support for simulating different brain states

mod device;
mod generator;

pub use device::SyntheticDevice;
pub use generator::{NoiseLevel, SignalGenerator, SignalProfile};
