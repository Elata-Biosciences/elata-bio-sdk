//! Signal generation for synthetic EEG

use std::f32::consts::PI;

/// Noise level for synthetic signals
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum NoiseLevel {
    /// No noise (pure signal)
    None,
    /// Low noise (clean recording)
    Low,
    /// Medium noise (typical recording)
    Medium,
    /// High noise (noisy environment)
    High,
}

impl NoiseLevel {
    fn amplitude(&self) -> f32 {
        match self {
            NoiseLevel::None => 0.0,
            NoiseLevel::Low => 0.1,
            NoiseLevel::Medium => 0.3,
            NoiseLevel::High => 0.6,
        }
    }
}

/// Predefined signal profiles simulating different brain states
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SignalProfile {
    /// Relaxed, eyes closed (strong alpha)
    Relaxed,
    /// Alert, focused (reduced alpha, increased beta)
    Alert,
    /// Drowsy (increased theta)
    Drowsy,
    /// Deep relaxation/meditation (strong alpha and theta)
    Meditative,
    /// Custom frequencies
    Custom,
}

impl SignalProfile {
    /// Get frequency components for this profile
    /// Returns (frequency_hz, amplitude) pairs
    fn components(&self) -> Vec<(f32, f32)> {
        match self {
            SignalProfile::Relaxed => vec![
                (10.0, 1.0), // Strong alpha
                (3.0, 0.3),  // Some delta
                (20.0, 0.2), // Low beta
            ],
            SignalProfile::Alert => vec![
                (10.0, 0.3), // Reduced alpha
                (18.0, 0.8), // Strong low beta
                (25.0, 0.6), // Mid beta
                (3.0, 0.2),  // Low delta
            ],
            SignalProfile::Drowsy => vec![
                (6.0, 0.9),  // Strong theta
                (10.0, 0.5), // Moderate alpha
                (2.0, 0.4),  // Some delta
            ],
            SignalProfile::Meditative => vec![
                (10.0, 1.0), // Strong alpha
                (6.0, 0.7),  // Good theta
                (3.0, 0.3),  // Some delta
            ],
            SignalProfile::Custom => vec![(10.0, 1.0)], // Default to alpha
        }
    }
}

/// Signal generator for synthetic EEG data
#[derive(Debug, Clone)]
pub struct SignalGenerator {
    /// Sample rate in Hz
    sample_rate: u16,
    /// Number of channels
    channel_count: usize,
    /// Current sample index (for phase continuity)
    sample_index: u64,
    /// Signal profile
    profile: SignalProfile,
    /// Custom frequency components per channel (freq_hz, amplitude)
    custom_components: Vec<Vec<(f32, f32)>>,
    /// Noise level
    noise_level: NoiseLevel,
    /// Simple PRNG state for noise
    rng_state: u64,
}

impl SignalGenerator {
    /// Create a new signal generator
    pub fn new(sample_rate: u16, channel_count: usize) -> Self {
        let default_components = SignalProfile::Relaxed.components();
        Self {
            sample_rate,
            channel_count,
            sample_index: 0,
            profile: SignalProfile::Relaxed,
            custom_components: vec![default_components; channel_count],
            noise_level: NoiseLevel::Low,
            rng_state: 12345,
        }
    }

    /// Set the signal profile
    pub fn set_profile(&mut self, profile: SignalProfile) {
        self.profile = profile;
        if profile != SignalProfile::Custom {
            let components = profile.components();
            self.custom_components = vec![components; self.channel_count];
        }
    }

    /// Set custom frequency components for a specific channel
    pub fn set_channel_components(&mut self, channel: usize, components: Vec<(f32, f32)>) {
        if channel < self.channel_count {
            self.custom_components[channel] = components;
            self.profile = SignalProfile::Custom;
        }
    }

    /// Set noise level
    pub fn set_noise_level(&mut self, level: NoiseLevel) {
        self.noise_level = level;
    }

    /// Generate a single sample for all channels
    pub fn next_sample(&mut self) -> Vec<f32> {
        let t = self.sample_index as f32 / self.sample_rate as f32;
        self.sample_index += 1;

        let mut values = Vec::with_capacity(self.channel_count);

        for ch in 0..self.channel_count {
            let components = &self.custom_components[ch];

            // Sum frequency components
            let mut value: f32 = components
                .iter()
                .map(|(freq, amp)| amp * (2.0 * PI * freq * t).sin())
                .sum();

            // Add noise
            if self.noise_level != NoiseLevel::None {
                value += self.noise() * self.noise_level.amplitude();
            }

            // Scale to microvolts (typical EEG range: -100 to +100 µV)
            value *= 50.0;

            values.push(value);
        }

        values
    }

    /// Generate multiple samples
    pub fn next_samples(&mut self, count: usize) -> Vec<f32> {
        let mut data = Vec::with_capacity(count * self.channel_count);
        for _ in 0..count {
            data.extend(self.next_sample());
        }
        data
    }

    /// Get current timestamp in milliseconds
    pub fn current_timestamp_ms(&self) -> u64 {
        (self.sample_index as f64 * 1000.0 / self.sample_rate as f64) as u64
    }

    /// Reset the generator
    pub fn reset(&mut self) {
        self.sample_index = 0;
    }

    /// Simple xorshift PRNG for noise generation
    fn noise(&mut self) -> f32 {
        self.rng_state ^= self.rng_state << 13;
        self.rng_state ^= self.rng_state >> 7;
        self.rng_state ^= self.rng_state << 17;

        // Convert to [-1, 1] range
        (self.rng_state as f32 / u64::MAX as f32) * 2.0 - 1.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generator_produces_samples() {
        let mut gen = SignalGenerator::new(256, 4);
        let samples = gen.next_samples(256);

        assert_eq!(samples.len(), 256 * 4); // 256 samples * 4 channels
    }

    #[test]
    fn test_profile_changes_signal() {
        let mut gen_relaxed = SignalGenerator::new(256, 1);
        gen_relaxed.set_profile(SignalProfile::Relaxed);
        gen_relaxed.set_noise_level(NoiseLevel::None);

        let mut gen_alert = SignalGenerator::new(256, 1);
        gen_alert.set_profile(SignalProfile::Alert);
        gen_alert.set_noise_level(NoiseLevel::None);

        let samples_relaxed = gen_relaxed.next_samples(256);
        let samples_alert = gen_alert.next_samples(256);

        // Signals should be different
        let diff: f32 = samples_relaxed
            .iter()
            .zip(samples_alert.iter())
            .map(|(a, b)| (a - b).abs())
            .sum();

        assert!(diff > 0.0);
    }

    #[test]
    fn test_noise_level() {
        let mut gen_no_noise = SignalGenerator::new(256, 1);
        gen_no_noise.set_noise_level(NoiseLevel::None);

        let mut gen_high_noise = SignalGenerator::new(256, 1);
        gen_high_noise.set_noise_level(NoiseLevel::High);

        let samples_clean = gen_no_noise.next_samples(1024);
        let samples_noisy = gen_high_noise.next_samples(1024);

        // Compute variance
        let var = |s: &[f32]| -> f32 {
            let mean = s.iter().sum::<f32>() / s.len() as f32;
            s.iter().map(|x| (x - mean).powi(2)).sum::<f32>() / s.len() as f32
        };

        // Noisy signal should have higher variance
        assert!(var(&samples_noisy) > var(&samples_clean));
    }
}
