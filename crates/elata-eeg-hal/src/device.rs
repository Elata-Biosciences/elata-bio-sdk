//! Core device abstraction trait

use crate::channel::ChannelConfig;
use crate::error::Result;
use crate::sample::SampleBuffer;

/// State of an EEG device
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeviceState {
    /// Device is not connected
    Disconnected,
    /// Device is connected but not streaming
    Connected,
    /// Device is actively streaming data
    Streaming,
}

/// Information about an EEG device
#[derive(Debug, Clone)]
pub struct DeviceInfo {
    /// Human-readable device name
    pub name: String,
    /// Device manufacturer
    pub manufacturer: String,
    /// Sample rate in Hz
    pub sample_rate: u16,
    /// Channel configuration
    pub channels: ChannelConfig,
}

impl DeviceInfo {
    pub fn new(
        name: impl Into<String>,
        manufacturer: impl Into<String>,
        sample_rate: u16,
        channels: ChannelConfig,
    ) -> Self {
        Self {
            name: name.into(),
            manufacturer: manufacturer.into(),
            sample_rate,
            channels,
        }
    }
}

/// Core trait for EEG devices
///
/// This trait provides a unified interface for all EEG devices, whether
/// physical (Muse S, OpenBCI) or synthetic (for testing).
///
/// # Lifecycle
///
/// 1. Create device instance
/// 2. Call `connect()` to establish connection
/// 3. Call `start_stream()` to begin data acquisition
/// 4. Call `read_samples()` to get data
/// 5. Call `stop_stream()` when done
/// 6. Call `disconnect()` to release resources
pub trait EegDevice {
    /// Get device information
    fn info(&self) -> DeviceInfo;

    /// Get current device state
    fn state(&self) -> DeviceState;

    /// Connect to the device
    fn connect(&mut self) -> Result<()>;

    /// Disconnect from the device
    fn disconnect(&mut self) -> Result<()>;

    /// Start streaming data
    fn start_stream(&mut self) -> Result<()>;

    /// Stop streaming data
    fn stop_stream(&mut self) -> Result<()>;

    /// Read available samples into the buffer
    ///
    /// Returns the number of samples read. This may be 0 if no data is available.
    /// The buffer is NOT cleared before reading; new samples are appended.
    fn read_samples(&mut self, buffer: &mut SampleBuffer) -> Result<usize>;

    /// Check if the device is connected
    fn is_connected(&self) -> bool {
        matches!(
            self.state(),
            DeviceState::Connected | DeviceState::Streaming
        )
    }

    /// Check if the device is streaming
    fn is_streaming(&self) -> bool {
        self.state() == DeviceState::Streaming
    }
}

/// Extension trait for devices that support configuration
pub trait ConfigurableDevice: EegDevice {
    /// Set the sample rate (if supported by the device)
    fn set_sample_rate(&mut self, rate: u16) -> Result<()>;

    /// Enable or disable specific channels
    fn set_channels_enabled(&mut self, enabled: &[bool]) -> Result<()>;
}
