//! Channel configuration and metadata

/// Type of EEG channel
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChannelType {
    /// Standard EEG electrode
    Eeg,
    /// Auxiliary channel (accelerometer, gyro, etc.)
    Aux,
    /// Reference electrode
    Reference,
    /// Ground electrode
    Ground,
}

/// Information about a single channel
#[derive(Debug, Clone)]
pub struct Channel {
    /// Channel index (0-based)
    pub index: usize,
    /// Channel name (e.g., "TP9", "AF7", "Fpz")
    pub name: String,
    /// Type of channel
    pub channel_type: ChannelType,
    /// 10-20 system location, if applicable
    pub location: Option<String>,
}

impl Channel {
    pub fn new(index: usize, name: impl Into<String>, channel_type: ChannelType) -> Self {
        Self {
            index,
            name: name.into(),
            channel_type,
            location: None,
        }
    }

    pub fn eeg(index: usize, name: impl Into<String>) -> Self {
        Self::new(index, name, ChannelType::Eeg)
    }

    pub fn aux(index: usize, name: impl Into<String>) -> Self {
        Self::new(index, name, ChannelType::Aux)
    }

    pub fn with_location(mut self, location: impl Into<String>) -> Self {
        self.location = Some(location.into());
        self
    }
}

/// Channel configuration for a device
#[derive(Debug, Clone)]
pub struct ChannelConfig {
    channels: Vec<Channel>,
}

impl ChannelConfig {
    pub fn new(channels: Vec<Channel>) -> Self {
        Self { channels }
    }

    /// Create a simple configuration with N EEG channels named Ch0, Ch1, etc.
    pub fn simple(count: usize) -> Self {
        let channels = (0..count)
            .map(|i| Channel::eeg(i, format!("Ch{i}")))
            .collect();
        Self { channels }
    }

    /// Create a Muse-style channel configuration
    pub fn muse() -> Self {
        Self::new(vec![
            Channel::eeg(0, "TP9").with_location("TP9"),
            Channel::eeg(1, "AF7").with_location("AF7"),
            Channel::eeg(2, "AF8").with_location("AF8"),
            Channel::eeg(3, "TP10").with_location("TP10"),
        ])
    }

    /// Create a Muse S Athena-style channel configuration (8-channel EEG)
    pub fn muse_athena() -> Self {
        Self::new(vec![
            Channel::eeg(0, "TP9").with_location("TP9"),
            Channel::eeg(1, "AF7").with_location("AF7"),
            Channel::eeg(2, "AF8").with_location("AF8"),
            Channel::eeg(3, "TP10").with_location("TP10"),
            Channel::eeg(4, "AUX_1").with_location("AUX_1"),
            Channel::eeg(5, "AUX_2").with_location("AUX_2"),
            Channel::eeg(6, "AUX_3").with_location("AUX_3"),
            Channel::eeg(7, "AUX_4").with_location("AUX_4"),
        ])
    }

    pub fn channels(&self) -> &[Channel] {
        &self.channels
    }

    pub fn channel_count(&self) -> usize {
        self.channels.len()
    }

    pub fn eeg_channels(&self) -> impl Iterator<Item = &Channel> {
        self.channels
            .iter()
            .filter(|c| c.channel_type == ChannelType::Eeg)
    }

    pub fn eeg_channel_count(&self) -> usize {
        self.eeg_channels().count()
    }

    pub fn get_by_name(&self, name: &str) -> Option<&Channel> {
        self.channels.iter().find(|c| c.name == name)
    }

    pub fn get_by_index(&self, index: usize) -> Option<&Channel> {
        self.channels.get(index)
    }
}
