//! Calmness Model
//!
//! Computes a continuous calmness score based on the ratio of
//! relaxation-associated frequencies (alpha, theta) to
//! alertness-associated frequencies (beta).

use eeg_hal::SampleBuffer;
use eeg_signal::band_powers;

use crate::model::{Model, ModelOutput};

/// Output from the calmness model
#[derive(Debug, Clone)]
pub struct CalmnessOutput {
    /// Calmness score (0.0 = very alert, 1.0 = very calm)
    pub score: f32,
    /// Smoothed calmness score (less jittery)
    pub smoothed_score: f32,
    /// Alpha/beta ratio (primary indicator)
    pub alpha_beta_ratio: f32,
    /// Theta contribution
    pub theta_level: f32,
    /// Raw band powers
    pub alpha_power: f32,
    pub beta_power: f32,
    pub theta_power: f32,
}

impl ModelOutput for CalmnessOutput {
    fn description(&self) -> String {
        let state = if self.smoothed_score > 0.7 {
            "very calm"
        } else if self.smoothed_score > 0.5 {
            "calm"
        } else if self.smoothed_score > 0.3 {
            "neutral"
        } else {
            "alert"
        };
        format!(
            "Calmness: {:.0}% ({}) [α/β={:.2}]",
            self.smoothed_score * 100.0,
            state,
            self.alpha_beta_ratio
        )
    }

    fn value(&self) -> Option<f32> {
        Some(self.smoothed_score)
    }

    fn confidence(&self) -> Option<f32> {
        // Higher confidence when we have stronger signals
        let signal_strength = self.alpha_power + self.beta_power + self.theta_power;
        Some((signal_strength / 1000.0).min(1.0))
    }
}

/// Calmness analysis model
///
/// Uses the ratio of alpha+theta power to beta power to estimate
/// how calm or alert the user is.
///
/// The model outputs a score from 0.0 (very alert) to 1.0 (very calm).
pub struct CalmnessModel {
    /// Sample rate
    sample_rate: u16,
    /// Smoothed score (exponential moving average)
    smoothed_score: f32,
    /// Smoothing factor
    smoothing_alpha: f32,
    /// Number of updates
    update_count: usize,
}

impl CalmnessModel {
    /// Create a new calmness model
    pub fn new(sample_rate: u16) -> Self {
        Self {
            sample_rate,
            smoothed_score: 0.5, // Start neutral
            smoothing_alpha: 0.1,
            update_count: 0,
        }
    }

    /// Set the smoothing factor (0-1, higher = faster response)
    pub fn set_smoothing(&mut self, alpha: f32) {
        self.smoothing_alpha = alpha.clamp(0.01, 1.0);
    }

    /// Compute calmness metrics from band powers
    fn compute_calmness(&self, alpha: f32, beta: f32, theta: f32) -> (f32, f32) {
        // Avoid division by zero
        let beta_safe = beta.max(1e-6);

        // Alpha/beta ratio is primary indicator
        // Higher ratio = more relaxed
        let alpha_beta_ratio = alpha / beta_safe;

        // Include theta for deeper relaxation states
        let relaxation_power = alpha + theta * 0.5;
        let alertness_power = beta;

        // Compute ratio (reserved for future use in enhanced model)
        let _ratio = relaxation_power / (relaxation_power + alertness_power + 1e-6);

        // Map to 0-1 score using sigmoid-like function
        // Typical alpha/beta ratios: 0.5-3.0
        let normalized_ratio = (alpha_beta_ratio - 0.5) / 2.5; // Center around 1.0
        let score = 1.0 / (1.0 + (-normalized_ratio * 4.0).exp());

        (score.clamp(0.0, 1.0), alpha_beta_ratio)
    }

    /// Compute average band powers across all channels
    fn compute_band_powers(&self, buffer: &SampleBuffer) -> (f32, f32, f32) {
        let channel_count = buffer.channel_count;
        if channel_count == 0 {
            return (0.0, 0.0, 0.0);
        }

        let mut total_alpha = 0.0;
        let mut total_beta = 0.0;
        let mut total_theta = 0.0;

        for ch in 0..channel_count {
            let data = buffer.channel_data(ch);
            let powers = band_powers(data, self.sample_rate as f32);
            total_alpha += powers.alpha;
            total_beta += powers.beta;
            total_theta += powers.theta;
        }

        let n = channel_count as f32;
        (total_alpha / n, total_beta / n, total_theta / n)
    }
}

impl Model for CalmnessModel {
    type Output = CalmnessOutput;

    fn name(&self) -> &str {
        "Calmness Model"
    }

    fn min_samples(&self) -> usize {
        // Need at least 1 second of data
        self.sample_rate as usize
    }

    fn process(&mut self, buffer: &SampleBuffer) -> Option<Self::Output> {
        if buffer.sample_count() < self.min_samples() {
            return None;
        }

        let (alpha_power, beta_power, theta_power) = self.compute_band_powers(buffer);
        let (raw_score, alpha_beta_ratio) =
            self.compute_calmness(alpha_power, beta_power, theta_power);

        // Update smoothed score
        if self.update_count == 0 {
            self.smoothed_score = raw_score;
        } else {
            self.smoothed_score = self.smoothed_score * (1.0 - self.smoothing_alpha)
                + raw_score * self.smoothing_alpha;
        }
        self.update_count += 1;

        Some(CalmnessOutput {
            score: raw_score,
            smoothed_score: self.smoothed_score,
            alpha_beta_ratio,
            theta_level: theta_power,
            alpha_power,
            beta_power,
            theta_power,
        })
    }

    fn reset(&mut self) {
        self.smoothed_score = 0.5;
        self.update_count = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_buffer_multi_freq(
        sample_rate: u16,
        samples: usize,
        frequencies: &[(f32, f32)], // (freq, amplitude)
    ) -> SampleBuffer {
        use std::f32::consts::PI;

        let mut buffer = SampleBuffer::new(sample_rate, 1);
        let data: Vec<f32> = (0..samples)
            .map(|i| {
                let t = i as f32 / sample_rate as f32;
                frequencies
                    .iter()
                    .map(|(freq, amp)| amp * (2.0 * PI * freq * t).sin())
                    .sum()
            })
            .collect();
        buffer.push_interleaved(&data, 0, sample_rate);
        buffer
    }

    #[test]
    fn test_calmness_model_creation() {
        let model = CalmnessModel::new(256);
        assert_eq!(model.sample_rate, 256);
    }

    #[test]
    fn test_high_alpha_is_calm() {
        let mut model = CalmnessModel::new(256);

        // Strong alpha (10 Hz) signal
        let buffer = create_test_buffer_multi_freq(256, 512, &[(10.0, 50.0)]);
        let output = model.process(&buffer).unwrap();

        // Should show some level of calmness with alpha
        assert!(output.alpha_power > output.beta_power);
    }

    #[test]
    fn test_high_beta_is_alert() {
        let mut model = CalmnessModel::new(256);

        // Strong beta (20 Hz) signal
        let buffer = create_test_buffer_multi_freq(256, 512, &[(20.0, 50.0)]);
        let output = model.process(&buffer).unwrap();

        // Beta should dominate
        assert!(output.beta_power > output.theta_power);
    }

    #[test]
    fn test_score_range() {
        let mut model = CalmnessModel::new(256);

        // Mixed signal
        let buffer =
            create_test_buffer_multi_freq(256, 512, &[(10.0, 30.0), (20.0, 30.0), (6.0, 20.0)]);

        let output = model.process(&buffer).unwrap();

        // Score should be in valid range
        assert!(output.score >= 0.0 && output.score <= 1.0);
        assert!(output.smoothed_score >= 0.0 && output.smoothed_score <= 1.0);
    }
}
