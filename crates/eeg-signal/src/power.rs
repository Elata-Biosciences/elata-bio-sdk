//! Band power extraction from EEG signals

use crate::fft::{fft, fft_frequencies, power_spectrum};
use crate::window::{apply_window, Window};
use eeg_hal::bands;

/// Power values for all standard EEG bands
#[derive(Debug, Clone, Default)]
pub struct BandPowers {
    /// Delta (0.5-4 Hz) - deep sleep
    pub delta: f32,
    /// Theta (4-8 Hz) - drowsiness, meditation
    pub theta: f32,
    /// Alpha (8-13 Hz) - relaxed, eyes closed
    pub alpha: f32,
    /// Beta (13-30 Hz) - active thinking, focus
    pub beta: f32,
    /// Gamma (30-100 Hz) - high-level cognition
    pub gamma: f32,
}

impl BandPowers {
    /// Get total power across all bands
    pub fn total(&self) -> f32 {
        self.delta + self.theta + self.alpha + self.beta + self.gamma
    }

    /// Get relative band powers (each band as fraction of total)
    pub fn relative(&self) -> BandPowers {
        let total = self.total();
        if total < 1e-10 {
            return BandPowers::default();
        }
        BandPowers {
            delta: self.delta / total,
            theta: self.theta / total,
            alpha: self.alpha / total,
            beta: self.beta / total,
            gamma: self.gamma / total,
        }
    }
}

/// Compute power in a specific frequency band
pub fn band_power(signal: &[f32], sample_rate: f32, band: (f32, f32)) -> f32 {
    if signal.is_empty() {
        return 0.0;
    }

    // Apply Hann window
    let mut windowed: Vec<f32> = signal.to_vec();
    apply_window(&mut windowed, Window::Hann);

    // Compute FFT
    let fft_result = fft(&windowed);
    let power = power_spectrum(&fft_result);
    let freqs = fft_frequencies(fft_result.len(), sample_rate);

    // Sum power in the band
    let (low, high) = band;
    let mut sum = 0.0;
    let mut count = 0;

    for (i, &freq) in freqs.iter().enumerate() {
        if freq >= low && freq <= high {
            sum += power[i];
            count += 1;
        }
    }

    // Return average power in the band (normalize by bin count)
    if count > 0 {
        sum / count as f32
    } else {
        0.0
    }
}

/// Compute power in all standard EEG bands
pub fn band_powers(signal: &[f32], sample_rate: f32) -> BandPowers {
    // Apply Hann window once
    let mut windowed: Vec<f32> = signal.to_vec();
    apply_window(&mut windowed, Window::Hann);

    // Compute FFT once
    let fft_result = fft(&windowed);
    let power = power_spectrum(&fft_result);
    let freqs = fft_frequencies(fft_result.len(), sample_rate);

    // Extract power for each band
    let extract_band = |band: (f32, f32)| -> f32 {
        let (low, high) = band;
        let mut sum = 0.0;
        let mut count = 0;
        for (i, &freq) in freqs.iter().enumerate() {
            if freq >= low && freq <= high {
                sum += power[i];
                count += 1;
            }
        }
        if count > 0 {
            sum / count as f32
        } else {
            0.0
        }
    };

    BandPowers {
        delta: extract_band(bands::DELTA),
        theta: extract_band(bands::THETA),
        alpha: extract_band(bands::ALPHA),
        beta: extract_band(bands::BETA),
        gamma: extract_band(bands::GAMMA),
    }
}

/// Compute relative power in a specific band (as fraction of total power)
pub fn relative_band_power(signal: &[f32], sample_rate: f32, band: (f32, f32)) -> f32 {
    let powers = band_powers(signal, sample_rate);
    let total = powers.total();
    if total < 1e-10 {
        return 0.0;
    }

    let (low, high) = band;
    let band_val = match (low, high) {
        x if x == bands::DELTA => powers.delta,
        x if x == bands::THETA => powers.theta,
        x if x == bands::ALPHA => powers.alpha,
        x if x == bands::BETA => powers.beta,
        x if x == bands::GAMMA => powers.gamma,
        _ => band_power(signal, sample_rate, band),
    };

    band_val / total
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    #[test]
    fn test_band_power_sine() {
        // Generate a 10 Hz sine wave (should appear in alpha band)
        let sample_rate = 256.0;
        let n = 256;
        let signal: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * 10.0 * i as f32 / sample_rate).sin())
            .collect();

        let powers = band_powers(&signal, sample_rate);

        // Alpha should have the most power
        assert!(powers.alpha > powers.delta);
        assert!(powers.alpha > powers.theta);
        assert!(powers.alpha > powers.beta);
    }

    #[test]
    fn test_relative_powers_sum_to_one() {
        let sample_rate = 256.0;
        let n = 256;
        // Generate mixed frequency signal
        let signal: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f32 / sample_rate;
                (2.0 * PI * 3.0 * t).sin()  // delta
                    + (2.0 * PI * 10.0 * t).sin()  // alpha
                    + (2.0 * PI * 20.0 * t).sin() // beta
            })
            .collect();

        let rel = band_powers(&signal, sample_rate).relative();
        let sum = rel.delta + rel.theta + rel.alpha + rel.beta + rel.gamma;

        assert!((sum - 1.0).abs() < 0.01);
    }
}
