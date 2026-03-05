//! Synthetic EEG device implementation

use eeg_hal::{ChannelConfig, DeviceInfo, DeviceState, EegDevice, HalError, Result, SampleBuffer};

use crate::generator::{NoiseLevel, SignalGenerator, SignalProfile};

/// Synthetic EEG device for testing
///
/// This device generates realistic-looking EEG signals without requiring
/// physical hardware. The generated signals can be configured to simulate
/// different brain states (relaxed, alert, drowsy, etc.).
///
/// # Example
///
/// ```no_run
/// use eeg_hal::{EegDevice, SampleBuffer};
/// use eeg_hal_synthetic::SyntheticDevice;
///
/// let mut device = SyntheticDevice::new();
/// device.connect().unwrap();
/// device.start_stream().unwrap();
///
/// let mut buffer = SampleBuffer::new(256, 4);
/// device.read_samples(&mut buffer).unwrap();
/// ```
pub struct SyntheticDevice {
    info: DeviceInfo,
    state: DeviceState,
    generator: SignalGenerator,
    /// Samples per read operation
    samples_per_read: usize,
    /// Epoch timestamp offset (set on connect)
    epoch_offset_ms: u64,
}

impl SyntheticDevice {
    /// Create a new synthetic device with default settings
    pub fn new() -> Self {
        Self::with_config(256, 4)
    }

    /// Create a synthetic device with custom sample rate and channel count
    pub fn with_config(sample_rate: u16, channel_count: usize) -> Self {
        let channels = ChannelConfig::simple(channel_count);
        let info = DeviceInfo::new("Synthetic EEG", "HAL Test", sample_rate, channels);

        Self {
            info,
            state: DeviceState::Disconnected,
            generator: SignalGenerator::new(sample_rate, channel_count),
            samples_per_read: 16,
            epoch_offset_ms: 0,
        }
    }

    /// Create a synthetic device that mimics Muse channel layout
    pub fn muse_like() -> Self {
        let channels = ChannelConfig::muse();
        let info = DeviceInfo::new("Synthetic Muse", "HAL Test", 256, channels);

        Self {
            info,
            state: DeviceState::Disconnected,
            generator: SignalGenerator::new(256, 4),
            samples_per_read: 16,
            epoch_offset_ms: 0,
        }
    }

    /// Create a synthetic device that mimics Muse S Athena channel layout
    pub fn muse_athena_like() -> Self {
        let channels = ChannelConfig::muse_athena();
        let info = DeviceInfo::new("Synthetic Muse Athena", "HAL Test", 256, channels);

        Self {
            info,
            state: DeviceState::Disconnected,
            generator: SignalGenerator::new(256, 8),
            samples_per_read: 16,
            epoch_offset_ms: 0,
        }
    }

    /// Set the signal profile
    pub fn set_profile(&mut self, profile: SignalProfile) {
        self.generator.set_profile(profile);
    }

    /// Set the noise level
    pub fn set_noise_level(&mut self, level: NoiseLevel) {
        self.generator.set_noise_level(level);
    }

    /// Set the number of samples generated per read operation
    pub fn set_samples_per_read(&mut self, count: usize) {
        self.samples_per_read = count;
    }

    /// Get current timestamp in milliseconds since epoch
    fn current_timestamp_ms(&self) -> u64 {
        self.epoch_offset_ms + self.generator.current_timestamp_ms()
    }
}

impl Default for SyntheticDevice {
    fn default() -> Self {
        Self::new()
    }
}

impl EegDevice for SyntheticDevice {
    fn info(&self) -> DeviceInfo {
        self.info.clone()
    }

    fn state(&self) -> DeviceState {
        self.state
    }

    fn connect(&mut self) -> Result<()> {
        if self.state != DeviceState::Disconnected {
            return Err(HalError::AlreadyConnected);
        }

        // Set epoch offset to current time
        self.epoch_offset_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        self.generator.reset();
        self.state = DeviceState::Connected;
        Ok(())
    }

    fn disconnect(&mut self) -> Result<()> {
        if self.state == DeviceState::Disconnected {
            return Err(HalError::NotConnected);
        }

        self.state = DeviceState::Disconnected;
        Ok(())
    }

    fn start_stream(&mut self) -> Result<()> {
        match self.state {
            DeviceState::Disconnected => Err(HalError::NotConnected),
            DeviceState::Streaming => Ok(()), // Already streaming, no-op
            DeviceState::Connected => {
                self.state = DeviceState::Streaming;
                Ok(())
            }
        }
    }

    fn stop_stream(&mut self) -> Result<()> {
        match self.state {
            DeviceState::Disconnected => Err(HalError::NotConnected),
            DeviceState::Connected => Ok(()), // Not streaming, no-op
            DeviceState::Streaming => {
                self.state = DeviceState::Connected;
                Ok(())
            }
        }
    }

    fn read_samples(&mut self, buffer: &mut SampleBuffer) -> Result<usize> {
        if self.state != DeviceState::Streaming {
            return Err(HalError::NotStreaming);
        }

        let timestamp = self.current_timestamp_ms();

        // Generate samples
        let data = self.generator.next_samples(self.samples_per_read);

        // Push to buffer
        buffer.push_interleaved(&data, timestamp, self.info.sample_rate);

        Ok(self.samples_per_read)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_lifecycle() {
        let mut device = SyntheticDevice::new();

        assert_eq!(device.state(), DeviceState::Disconnected);

        device.connect().unwrap();
        assert_eq!(device.state(), DeviceState::Connected);

        device.start_stream().unwrap();
        assert_eq!(device.state(), DeviceState::Streaming);

        device.stop_stream().unwrap();
        assert_eq!(device.state(), DeviceState::Connected);

        device.disconnect().unwrap();
        assert_eq!(device.state(), DeviceState::Disconnected);
    }

    #[test]
    fn test_read_samples() {
        let mut device = SyntheticDevice::new();
        device.connect().unwrap();
        device.start_stream().unwrap();

        let mut buffer = SampleBuffer::new(256, 4);
        let count = device.read_samples(&mut buffer).unwrap();

        assert_eq!(count, 16); // Default samples per read
        assert_eq!(buffer.sample_count(), 16);
    }

    #[test]
    fn test_muse_like_configuration() {
        let device = SyntheticDevice::muse_like();
        let info = device.info();

        let channel_names: Vec<_> = info
            .channels
            .channels()
            .iter()
            .map(|channel| channel.name.as_str())
            .collect();

        assert_eq!(info.sample_rate, 256);
        assert_eq!(channel_names, vec!["TP9", "AF7", "AF8", "TP10"]);
    }

    #[test]
    fn test_muse_athena_like_configuration() {
        let device = SyntheticDevice::muse_athena_like();
        let info = device.info();

        let channel_names: Vec<_> = info
            .channels
            .channels()
            .iter()
            .map(|channel| channel.name.as_str())
            .collect();

        assert_eq!(info.sample_rate, 256);
        assert_eq!(
            channel_names,
            vec!["TP9", "AF7", "AF8", "TP10", "AUX_1", "AUX_2", "AUX_3", "AUX_4"]
        );
    }

    #[test]
    fn test_cannot_read_when_not_streaming() {
        let mut device = SyntheticDevice::new();
        device.connect().unwrap();
        // Don't start streaming

        let mut buffer = SampleBuffer::new(256, 4);
        let result = device.read_samples(&mut buffer);

        assert!(result.is_err());
    }
}
