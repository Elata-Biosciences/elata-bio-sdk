//! Alpha Bump Detection Model
//!
//! Detects changes in alpha band (8-13 Hz) power, which is associated with
//! the transition between relaxed (eyes closed, high alpha) and alert
//! (eyes open, low alpha) states.

use eeg_hal::SampleBuffer;
use eeg_signal::{band_power, bands};

use crate::model::{Model, ModelOutput};

/// Detected alpha state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlphaState {
    /// High alpha power (relaxed, eyes likely closed)
    High,
    /// Low alpha power (alert, eyes likely open)
    Low,
    /// Transitioning between states
    Transitioning,
    /// Unknown (not enough data)
    Unknown,
}

impl AlphaState {
    pub fn as_str(&self) -> &'static str {
        match self {
            AlphaState::High => "high",
            AlphaState::Low => "low",
            AlphaState::Transitioning => "transitioning",
            AlphaState::Unknown => "unknown",
        }
    }
}

/// Output from the alpha bump detector
#[derive(Debug, Clone)]
pub struct AlphaBumpOutput {
    /// Current alpha state
    pub state: AlphaState,
    /// Current alpha power (averaged across channels)
    pub alpha_power: f32,
    /// Baseline alpha power (running average)
    pub baseline: f32,
    /// Whether a state change was detected in this update
    pub state_changed: bool,
    /// Previous state (if changed)
    pub previous_state: Option<AlphaState>,
}

impl ModelOutput for AlphaBumpOutput {
    fn description(&self) -> String {
        let change = if self.state_changed {
            format!(
                " (changed from {})",
                self.previous_state.map(|s| s.as_str()).unwrap_or("unknown")
            )
        } else {
            String::new()
        };
        format!(
            "Alpha: {} (power={:.2}, baseline={:.2}){}",
            self.state.as_str(),
            self.alpha_power,
            self.baseline,
            change
        )
    }

    fn value(&self) -> Option<f32> {
        Some(self.alpha_power)
    }

    fn confidence(&self) -> Option<f32> {
        // Confidence based on how far from threshold
        if self.baseline < 1e-6 {
            return Some(0.0);
        }
        let ratio = self.alpha_power / self.baseline;
        let distance_from_threshold = (ratio - 1.0).abs();
        Some((distance_from_threshold * 2.0).min(1.0))
    }
}

/// Alpha bump detection model
///
/// Monitors alpha band power and detects transitions between
/// high-alpha (relaxed) and low-alpha (alert) states.
pub struct AlphaBumpDetector {
    /// Sample rate
    sample_rate: u16,
    /// Running baseline (exponential moving average)
    baseline: f32,
    /// Baseline smoothing factor (0-1, lower = more smoothing)
    baseline_alpha: f32,
    /// Threshold multiplier for high/low detection
    threshold_multiplier: f32,
    /// Current detected state
    current_state: AlphaState,
    /// Number of samples processed
    samples_processed: usize,
    /// Minimum samples for baseline
    warmup_samples: usize,
}

impl AlphaBumpDetector {
    /// Create a new alpha bump detector
    pub fn new(sample_rate: u16) -> Self {
        Self {
            sample_rate,
            baseline: 0.0,
            baseline_alpha: 0.02, // Slow adaptation
            threshold_multiplier: 1.5,
            current_state: AlphaState::Unknown,
            samples_processed: 0,
            warmup_samples: sample_rate as usize * 2, // 2 seconds warmup
        }
    }

    /// Set the threshold multiplier (default 1.5)
    ///
    /// Higher values require larger changes to detect state transitions.
    pub fn set_threshold(&mut self, multiplier: f32) {
        self.threshold_multiplier = multiplier.max(1.1);
    }

    /// Set the baseline smoothing factor (0-1)
    ///
    /// Lower values = slower adaptation = more stable baseline.
    pub fn set_baseline_smoothing(&mut self, alpha: f32) {
        self.baseline_alpha = alpha.clamp(0.001, 0.5);
    }

    /// Compute average alpha power across all EEG channels
    fn compute_alpha_power(&self, buffer: &SampleBuffer) -> f32 {
        let channel_count = buffer.channel_count;
        if channel_count == 0 {
            return 0.0;
        }

        let mut total_power = 0.0;
        for ch in 0..channel_count {
            let data = buffer.channel_data(ch);
            let power = band_power(data, self.sample_rate as f32, bands::ALPHA);
            total_power += power;
        }

        total_power / channel_count as f32
    }

    /// Update baseline with new alpha power reading
    fn update_baseline(&mut self, alpha_power: f32) {
        if self.samples_processed == 0 {
            self.baseline = alpha_power;
        } else {
            // Exponential moving average
            self.baseline =
                self.baseline * (1.0 - self.baseline_alpha) + alpha_power * self.baseline_alpha;
        }
    }

    /// Determine alpha state based on current power vs baseline
    fn determine_state(&self, alpha_power: f32) -> AlphaState {
        if self.samples_processed < self.warmup_samples || self.baseline < 1e-6 {
            return AlphaState::Unknown;
        }

        let ratio = alpha_power / self.baseline;
        let high_threshold = self.threshold_multiplier;
        let low_threshold = 1.0 / self.threshold_multiplier;

        if ratio > high_threshold {
            AlphaState::High
        } else if ratio < low_threshold {
            AlphaState::Low
        } else {
            // Near baseline - could be transitioning or stable at baseline
            match self.current_state {
                AlphaState::High | AlphaState::Low => AlphaState::Transitioning,
                _ => AlphaState::Unknown,
            }
        }
    }
}

impl Model for AlphaBumpDetector {
    type Output = AlphaBumpOutput;

    fn name(&self) -> &str {
        "Alpha Bump Detector"
    }

    fn min_samples(&self) -> usize {
        // Need at least 0.5 seconds of data for meaningful FFT
        (self.sample_rate as usize) / 2
    }

    fn process(&mut self, buffer: &SampleBuffer) -> Option<Self::Output> {
        if buffer.sample_count() < self.min_samples() {
            return None;
        }

        let alpha_power = self.compute_alpha_power(buffer);
        self.update_baseline(alpha_power);
        self.samples_processed += buffer.sample_count();

        let new_state = self.determine_state(alpha_power);
        let state_changed = new_state != self.current_state
            && new_state != AlphaState::Unknown
            && self.current_state != AlphaState::Unknown;

        let previous_state = if state_changed {
            Some(self.current_state)
        } else {
            None
        };

        if new_state != AlphaState::Unknown {
            self.current_state = new_state;
        }

        Some(AlphaBumpOutput {
            state: self.current_state,
            alpha_power,
            baseline: self.baseline,
            state_changed,
            previous_state,
        })
    }

    fn reset(&mut self) {
        self.baseline = 0.0;
        self.current_state = AlphaState::Unknown;
        self.samples_processed = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_buffer(sample_rate: u16, samples: usize, freq: f32) -> SampleBuffer {
        use std::f32::consts::PI;

        let mut buffer = SampleBuffer::new(sample_rate, 1);
        let data: Vec<f32> = (0..samples)
            .map(|i| (2.0 * PI * freq * i as f32 / sample_rate as f32).sin() * 50.0)
            .collect();
        buffer.push_interleaved(&data, 0, sample_rate);
        buffer
    }

    fn create_test_buffer_with_amplitude(
        sample_rate: u16,
        samples: usize,
        freq: f32,
        amplitude: f32,
    ) -> SampleBuffer {
        use std::f32::consts::PI;

        let mut buffer = SampleBuffer::new(sample_rate, 1);
        let data: Vec<f32> = (0..samples)
            .map(|i| (2.0 * PI * freq * i as f32 / sample_rate as f32).sin() * amplitude)
            .collect();
        buffer.push_interleaved(&data, 0, sample_rate);
        buffer
    }

    #[test]
    fn test_detector_creation() {
        let detector = AlphaBumpDetector::new(256);
        assert_eq!(detector.sample_rate, 256);
        assert_eq!(detector.current_state, AlphaState::Unknown);
    }

    #[test]
    fn test_alpha_detection() {
        let mut detector = AlphaBumpDetector::new(256);

        // Create a buffer with 10 Hz signal (alpha band)
        let buffer = create_test_buffer(256, 512, 10.0);

        let output = detector.process(&buffer);
        assert!(output.is_some());

        let output = output.unwrap();
        assert!(output.alpha_power > 0.0);
    }

    #[test]
    fn test_state_transitions_with_synthetic_alpha_power_changes() {
        let sample_rate = 256;
        let mut detector = AlphaBumpDetector::new(sample_rate);

        // Warm up baseline using a moderate alpha amplitude.
        let baseline_buffer = create_test_buffer_with_amplitude(sample_rate, 512, 10.0, 20.0);
        let warmup_output = detector.process(&baseline_buffer).expect("warmup output");
        assert_eq!(warmup_output.state, AlphaState::Unknown);

        // Strong alpha bump should move detector to High.
        let high_buffer = create_test_buffer_with_amplitude(sample_rate, 512, 10.0, 60.0);
        let high_output = detector.process(&high_buffer).expect("high output");
        assert_eq!(high_output.state, AlphaState::High);
        assert!(!high_output.state_changed);

        // Drop alpha power substantially to force Low and trigger transition flag.
        let low_buffer = create_test_buffer_with_amplitude(sample_rate, 512, 10.0, 5.0);
        let low_output = detector.process(&low_buffer).expect("low output");
        assert_eq!(low_output.state, AlphaState::Low);
        assert!(low_output.state_changed);
        assert_eq!(low_output.previous_state, Some(AlphaState::High));
    }
}
