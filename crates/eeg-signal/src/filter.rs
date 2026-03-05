//! Simple IIR filters for EEG preprocessing

use std::f32::consts::PI;

/// Second-order IIR filter (biquad)
#[derive(Debug, Clone)]
pub struct BiquadFilter {
    // Coefficients
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    // State
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl BiquadFilter {
    /// Create a lowpass filter
    pub fn lowpass(cutoff_hz: f32, sample_rate: f32, q: f32) -> Self {
        let omega = 2.0 * PI * cutoff_hz / sample_rate;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);

        let b0 = (1.0 - cos_omega) / 2.0;
        let b1 = 1.0 - cos_omega;
        let b2 = (1.0 - cos_omega) / 2.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha;

        Self::new(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)
    }

    /// Create a highpass filter
    pub fn highpass(cutoff_hz: f32, sample_rate: f32, q: f32) -> Self {
        let omega = 2.0 * PI * cutoff_hz / sample_rate;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);

        let b0 = (1.0 + cos_omega) / 2.0;
        let b1 = -(1.0 + cos_omega);
        let b2 = (1.0 + cos_omega) / 2.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha;

        Self::new(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)
    }

    /// Create a bandpass filter
    pub fn bandpass(center_hz: f32, bandwidth_hz: f32, sample_rate: f32) -> Self {
        let omega = 2.0 * PI * center_hz / sample_rate;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega * (bandwidth_hz / center_hz).sinh() / 2.0;

        let b0 = alpha;
        let b1 = 0.0;
        let b2 = -alpha;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha;

        Self::new(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)
    }

    /// Create a notch (band-reject) filter
    pub fn notch(center_hz: f32, bandwidth_hz: f32, sample_rate: f32) -> Self {
        let omega = 2.0 * PI * center_hz / sample_rate;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega * (bandwidth_hz / center_hz).sinh() / 2.0;

        let b0 = 1.0;
        let b1 = -2.0 * cos_omega;
        let b2 = 1.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha;

        Self::new(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)
    }

    fn new(b0: f32, b1: f32, b2: f32, a1: f32, a2: f32) -> Self {
        Self {
            b0,
            b1,
            b2,
            a1,
            a2,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    /// Reset filter state
    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }

    /// Process a single sample
    pub fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2;

        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y;

        y
    }

    /// Filter an entire signal (in-place)
    pub fn filter_inplace(&mut self, signal: &mut [f32]) {
        for sample in signal.iter_mut() {
            *sample = self.process(*sample);
        }
    }

    /// Filter a signal, returning a new vector
    pub fn filter(&mut self, signal: &[f32]) -> Vec<f32> {
        signal.iter().map(|&x| self.process(x)).collect()
    }
}

/// Apply a lowpass filter to a signal
pub fn lowpass_filter(signal: &[f32], cutoff_hz: f32, sample_rate: f32) -> Vec<f32> {
    let mut filter = BiquadFilter::lowpass(cutoff_hz, sample_rate, 0.707);
    filter.filter(signal)
}

/// Apply a highpass filter to a signal
pub fn highpass_filter(signal: &[f32], cutoff_hz: f32, sample_rate: f32) -> Vec<f32> {
    let mut filter = BiquadFilter::highpass(cutoff_hz, sample_rate, 0.707);
    filter.filter(signal)
}

/// Apply a bandpass filter to a signal
pub fn bandpass_filter(signal: &[f32], low_hz: f32, high_hz: f32, sample_rate: f32) -> Vec<f32> {
    let center = (low_hz + high_hz) / 2.0;
    let bandwidth = high_hz - low_hz;
    let mut filter = BiquadFilter::bandpass(center, bandwidth, sample_rate);
    filter.filter(signal)
}

/// Apply a notch filter (e.g., for 50/60Hz line noise removal)
pub fn notch_filter(signal: &[f32], center_hz: f32, sample_rate: f32) -> Vec<f32> {
    let mut filter = BiquadFilter::notch(center_hz, 2.0, sample_rate);
    filter.filter(signal)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lowpass_attenuates_high_freq() {
        // Generate a signal with low and high frequency components
        let sample_rate = 256.0;
        let n = 256;
        let signal: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f32 / sample_rate;
                // 5 Hz component (should pass)
                let low = (2.0 * PI * 5.0 * t).sin();
                // 50 Hz component (should be attenuated)
                let high = (2.0 * PI * 50.0 * t).sin();
                low + high
            })
            .collect();

        let filtered = lowpass_filter(&signal, 10.0, sample_rate);

        // Compute variance of second half (after filter settles)
        let original_var: f32 = signal[128..].iter().map(|x| x * x).sum::<f32>() / 128.0;
        let filtered_var: f32 = filtered[128..].iter().map(|x| x * x).sum::<f32>() / 128.0;

        // Filtered signal should have significantly lower variance
        // (high freq component removed)
        assert!(filtered_var < original_var * 0.7);
    }
}
