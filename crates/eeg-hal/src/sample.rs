//! EEG sample data types

/// A single multi-channel EEG sample
#[derive(Debug, Clone)]
pub struct EegSample {
    /// Timestamp in milliseconds since epoch
    pub timestamp_ms: u64,
    /// Sample values for each channel (in microvolts)
    pub values: Vec<f32>,
}

impl EegSample {
    pub fn new(timestamp_ms: u64, values: Vec<f32>) -> Self {
        Self {
            timestamp_ms,
            values,
        }
    }

    pub fn channel_count(&self) -> usize {
        self.values.len()
    }

    pub fn get(&self, channel: usize) -> Option<f32> {
        self.values.get(channel).copied()
    }
}

/// A buffer of EEG samples for batch processing
#[derive(Debug, Clone)]
pub struct SampleBuffer {
    /// Sample rate in Hz
    pub sample_rate: u16,
    /// Number of channels
    pub channel_count: usize,
    /// Samples stored in channel-major order: [ch0_samples..., ch1_samples..., ...]
    data: Vec<f32>,
    /// Timestamps for each sample
    timestamps: Vec<u64>,
}

impl SampleBuffer {
    pub fn new(sample_rate: u16, channel_count: usize) -> Self {
        Self {
            sample_rate,
            channel_count,
            data: Vec::new(),
            timestamps: Vec::new(),
        }
    }

    /// Create a buffer with pre-allocated capacity
    pub fn with_capacity(sample_rate: u16, channel_count: usize, sample_capacity: usize) -> Self {
        Self {
            sample_rate,
            channel_count,
            data: Vec::with_capacity(channel_count * sample_capacity),
            timestamps: Vec::with_capacity(sample_capacity),
        }
    }

    /// Number of samples in the buffer
    pub fn sample_count(&self) -> usize {
        self.timestamps.len()
    }

    /// Duration of data in the buffer (in seconds)
    pub fn duration_secs(&self) -> f32 {
        self.sample_count() as f32 / self.sample_rate as f32
    }

    /// Clear all samples from the buffer
    pub fn clear(&mut self) {
        self.data.clear();
        self.timestamps.clear();
    }

    /// Add a single sample to the buffer
    pub fn push(&mut self, sample: &EegSample) {
        assert_eq!(sample.channel_count(), self.channel_count);
        self.timestamps.push(sample.timestamp_ms);
        // Store in channel-major order for efficient per-channel processing
        for (ch, &value) in sample.values.iter().enumerate() {
            let idx = ch * self.sample_count() + (self.timestamps.len() - 1);
            if idx >= self.data.len() {
                self.data
                    .resize(self.channel_count * self.timestamps.len(), 0.0);
            }
            self.data[ch * self.timestamps.len() + self.timestamps.len() - 1] = value;
        }
    }

    /// Add samples from interleaved data (sample-major order)
    /// Data format: [s0_ch0, s0_ch1, ..., s1_ch0, s1_ch1, ...]
    pub fn push_interleaved(&mut self, data: &[f32], timestamp_start: u64, sample_rate: u16) {
        let samples_per_channel = data.len() / self.channel_count;
        let sample_interval_ms = 1000.0 / sample_rate as f64;

        let start_idx = self.timestamps.len();

        // Add timestamps
        for i in 0..samples_per_channel {
            let ts = timestamp_start + (i as f64 * sample_interval_ms) as u64;
            self.timestamps.push(ts);
        }

        // Resize data array
        let new_sample_count = self.timestamps.len();
        self.data.resize(self.channel_count * new_sample_count, 0.0);

        // Convert from interleaved to channel-major
        for sample_idx in 0..samples_per_channel {
            for ch in 0..self.channel_count {
                let src_idx = sample_idx * self.channel_count + ch;
                let dst_idx = ch * new_sample_count + start_idx + sample_idx;
                self.data[dst_idx] = data[src_idx];
            }
        }
    }

    /// Get all samples for a specific channel
    pub fn channel_data(&self, channel: usize) -> &[f32] {
        let start = channel * self.sample_count();
        let end = start + self.sample_count();
        &self.data[start..end]
    }

    /// Get a mutable reference to channel data
    pub fn channel_data_mut(&mut self, channel: usize) -> &mut [f32] {
        let count = self.sample_count();
        let start = channel * count;
        let end = start + count;
        &mut self.data[start..end]
    }

    /// Get timestamp for a sample index
    pub fn timestamp(&self, sample_idx: usize) -> Option<u64> {
        self.timestamps.get(sample_idx).copied()
    }

    /// Get the most recent N samples for a channel
    pub fn recent_channel_data(&self, channel: usize, n: usize) -> &[f32] {
        let data = self.channel_data(channel);
        if data.len() <= n {
            data
        } else {
            &data[data.len() - n..]
        }
    }

    /// Keep only the most recent N samples
    pub fn retain_recent(&mut self, n: usize) {
        if self.sample_count() <= n {
            return;
        }

        let remove_count = self.sample_count() - n;

        // Shift timestamps
        self.timestamps.drain(0..remove_count);

        // Shift each channel's data
        let new_count = self.timestamps.len();
        for ch in 0..self.channel_count {
            let old_start = ch * (new_count + remove_count) + remove_count;
            let new_start = ch * new_count;
            for i in 0..new_count {
                self.data[new_start + i] = self.data[old_start + i];
            }
        }
        self.data.truncate(self.channel_count * new_count);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sample_buffer_interleaved() {
        let mut buf = SampleBuffer::new(256, 2);

        // 3 samples, 2 channels, interleaved: [s0c0, s0c1, s1c0, s1c1, s2c0, s2c1]
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        buf.push_interleaved(&data, 1000, 256);

        assert_eq!(buf.sample_count(), 3);
        assert_eq!(buf.channel_data(0), &[1.0, 3.0, 5.0]);
        assert_eq!(buf.channel_data(1), &[2.0, 4.0, 6.0]);
    }

    #[test]
    fn test_recent_data() {
        let mut buf = SampleBuffer::new(256, 1);
        let data: Vec<f32> = (0..10).map(|i| i as f32).collect();
        buf.push_interleaved(&data, 0, 256);

        assert_eq!(buf.recent_channel_data(0, 3), &[7.0, 8.0, 9.0]);
    }
}
