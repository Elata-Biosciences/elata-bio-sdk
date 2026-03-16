//! EEG Hardware Abstraction Layer
//!
//! This crate provides a unified interface for EEG devices, allowing models
//! to work with any supported device without knowing the underlying hardware.

mod channel;
mod device;
mod error;
mod sample;

pub use channel::{Channel, ChannelConfig, ChannelType};
pub use device::{ConfigurableDevice, DeviceInfo, DeviceState, EegDevice};
pub use error::{HalError, Result};
pub use sample::{EegSample, SampleBuffer};

/// Standard EEG frequency bands (in Hz)
pub mod bands {
    /// Delta band: 0.5-4 Hz (deep sleep)
    pub const DELTA: (f32, f32) = (0.5, 4.0);
    /// Theta band: 4-8 Hz (drowsiness, meditation)
    pub const THETA: (f32, f32) = (4.0, 8.0);
    /// Alpha band: 8-13 Hz (relaxed, eyes closed)
    pub const ALPHA: (f32, f32) = (8.0, 13.0);
    /// Beta band: 13-30 Hz (active thinking, focus)
    pub const BETA: (f32, f32) = (13.0, 30.0);
    /// Gamma band: 30-100 Hz (high-level cognition)
    pub const GAMMA: (f32, f32) = (30.0, 100.0);
}
