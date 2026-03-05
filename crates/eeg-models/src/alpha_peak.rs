//! Alpha Peak Model
//!
//! Finds the dominant frequency within the alpha band (8-13 Hz) and
//! reports its power and signal-to-noise ratio.

use eeg_hal::{bands, SampleBuffer};
use eeg_signal::{apply_window, fft, fft_frequencies, power_spectrum, Window};

use crate::model::{Model, ModelOutput};

/// Output from the alpha peak model
#[derive(Debug, Clone)]
pub struct AlphaPeakOutput {
    /// Peak frequency within the alpha band (Hz)
    pub peak_frequency: f32,
    /// Smoothed peak frequency (Hz)
    pub smoothed_peak_frequency: f32,
    /// Long-term peak frequency estimate (Hz)
    pub long_term_peak_frequency: f32,
    /// Peak power at the alpha peak frequency
    pub peak_power: f32,
    /// Average power across the alpha band
    pub alpha_power: f32,
    /// Signal-to-noise ratio within the alpha band
    pub snr: f32,
}

impl ModelOutput for AlphaPeakOutput {
    fn description(&self) -> String {
        if self.peak_frequency <= 0.0 {
            "Alpha peak: unavailable".to_string()
        } else {
            let long_term = if self.long_term_peak_frequency > 0.0 {
                format!(", lt={:.2} Hz", self.long_term_peak_frequency)
            } else {
                String::new()
            };
            format!(
                "Alpha peak: {:.2} Hz (snr={:.2}{})",
                self.smoothed_peak_frequency, self.snr, long_term
            )
        }
    }

    fn value(&self) -> Option<f32> {
        Some(self.smoothed_peak_frequency)
    }

    fn confidence(&self) -> Option<f32> {
        let confidence = if self.snr <= 1.0 {
            0.0
        } else {
            ((self.snr - 1.0) / 4.0).min(1.0)
        };
        Some(confidence)
    }
}

/// Alpha peak analysis model
///
/// Computes the dominant frequency within the alpha band (8-13 Hz),
/// which can be used to track individual alpha peak frequency (IAPF).
pub struct AlphaPeakModel {
    /// Sample rate
    sample_rate: u16,
    /// Smoothing factor for peak frequency
    smoothing_alpha: f32,
    /// Smoothed peak frequency
    smoothed_peak_frequency: f32,
    /// Long-term smoothing factor for Welch PSD averaging
    long_term_alpha: f32,
    /// Long-term peak frequency estimate
    long_term_peak_frequency: f32,
    /// Welch segment length (samples)
    welch_segment_len: usize,
    /// Welch overlap length (samples)
    welch_overlap_len: usize,
    /// Long-term averaged power spectrum (Welch)
    long_term_psd: Option<Vec<f32>>,
    /// Frequencies for long-term PSD
    long_term_freqs: Option<Vec<f32>>,
    /// Number of Welch PSD updates accumulated (for all-time average)
    long_term_psd_count: u64,
    /// Number of updates
    update_count: usize,
}

impl AlphaPeakModel {
    /// Create a new alpha peak model
    pub fn new(sample_rate: u16) -> Self {
        let segment_len = sample_rate as usize;
        let overlap_len = segment_len / 2;
        Self {
            sample_rate,
            smoothing_alpha: 0.2,
            smoothed_peak_frequency: 0.0,
            long_term_alpha: 0.02,
            long_term_peak_frequency: 0.0,
            welch_segment_len: segment_len.max(1),
            welch_overlap_len: overlap_len,
            long_term_psd: None,
            long_term_freqs: None,
            long_term_psd_count: 0,
            update_count: 0,
        }
    }

    /// Set the smoothing factor (0-1)
    /// Higher values = faster response to changes
    pub fn set_smoothing(&mut self, alpha: f32) {
        self.smoothing_alpha = alpha.clamp(0.01, 1.0);
    }

    /// Set the long-term smoothing factor (0-1).
    ///
    /// Note: In all-time mode, long-term uses a cumulative average and does
    /// not decay, so this value has no effect.
    pub fn set_long_term_smoothing(&mut self, alpha: f32) {
        self.long_term_alpha = alpha.clamp(0.001, 0.5);
    }

    /// Set Welch segment length (samples)
    ///
    /// Shorter segments react faster but are noisier; longer segments are more stable.
    pub fn set_welch_segment_len(&mut self, segment_len: usize) {
        let segment_len = segment_len.max(1);
        self.welch_segment_len = segment_len;
        self.welch_overlap_len = segment_len / 2;
        self.long_term_psd = None;
        self.long_term_freqs = None;
    }

    fn compute_average_power_spectrum(
        &self,
        buffer: &SampleBuffer,
    ) -> Option<(Vec<f32>, Vec<f32>)> {
        let channel_count = buffer.channel_count;
        if channel_count == 0 || buffer.sample_count() == 0 {
            return None;
        }

        let mut summed_power: Vec<f32> = Vec::new();
        let mut freqs: Vec<f32> = Vec::new();
        let mut used_channels = 0usize;

        for ch in 0..channel_count {
            let data = buffer.channel_data(ch);
            if data.is_empty() {
                continue;
            }

            let mut windowed = data.to_vec();
            apply_window(&mut windowed, Window::Hann);

            let fft_result = fft(&windowed);
            let power = power_spectrum(&fft_result);

            if summed_power.is_empty() {
                summed_power = vec![0.0; power.len()];
                freqs = fft_frequencies(fft_result.len(), self.sample_rate as f32);
            }

            for (i, value) in power.iter().enumerate() {
                summed_power[i] += value;
            }
            used_channels += 1;
        }

        if used_channels == 0 {
            return None;
        }

        let denom = used_channels as f32;
        for value in &mut summed_power {
            *value /= denom;
        }

        Some((freqs, summed_power))
    }

    fn compute_alpha_peak_from_spectrum(
        &self,
        freqs: &[f32],
        power: &[f32],
    ) -> Option<(f32, f32, f32, f32)> {
        let (low, high) = bands::ALPHA;
        let mut peak_power = 0.0;
        let mut peak_freq = 0.0;
        let mut band_sum = 0.0;
        let mut band_count = 0usize;

        for (freq, val) in freqs.iter().zip(power.iter()) {
            if *freq >= low && *freq <= high {
                band_sum += *val;
                band_count += 1;

                if *val > peak_power {
                    peak_power = *val;
                    peak_freq = *freq;
                }
            }
        }

        if band_count == 0 {
            return None;
        }

        let alpha_power = band_sum / band_count as f32;
        let noise_floor = if band_count > 1 {
            (band_sum - peak_power) / (band_count as f32 - 1.0)
        } else {
            0.0
        }
        .max(1e-12);

        let snr = if peak_power > 0.0 {
            peak_power / noise_floor
        } else {
            0.0
        };

        Some((peak_freq, peak_power, alpha_power, snr))
    }

    fn compute_welch_spectrum(&self, buffer: &SampleBuffer) -> Option<(Vec<f32>, Vec<f32>)> {
        let channel_count = buffer.channel_count;
        let total_samples = buffer.sample_count();
        if channel_count == 0 || total_samples == 0 {
            return None;
        }

        let segment_len = self.welch_segment_len.min(total_samples);
        if segment_len == 0 {
            return None;
        }

        let overlap_len = self.welch_overlap_len.min(segment_len.saturating_sub(1));
        let step = (segment_len - overlap_len).max(1);

        let mut summed_power: Vec<f32> = Vec::new();
        let mut freqs: Vec<f32> = Vec::new();
        let mut used_channels = 0usize;

        for ch in 0..channel_count {
            let data = buffer.channel_data(ch);
            if data.len() < segment_len {
                continue;
            }

            let mut channel_power: Vec<f32> = Vec::new();
            let mut channel_freqs: Vec<f32> = Vec::new();
            let mut segments = 0usize;

            let mut start = 0usize;
            while start + segment_len <= data.len() {
                let segment = &data[start..start + segment_len];
                let mut windowed = segment.to_vec();
                apply_window(&mut windowed, Window::Hann);

                let fft_result = fft(&windowed);
                let power = power_spectrum(&fft_result);

                if channel_power.is_empty() {
                    channel_power = vec![0.0; power.len()];
                    channel_freqs = fft_frequencies(fft_result.len(), self.sample_rate as f32);
                }

                for (i, value) in power.iter().enumerate() {
                    channel_power[i] += value;
                }
                segments += 1;
                start += step;
            }

            if segments == 0 {
                continue;
            }

            let denom = segments as f32;
            for value in &mut channel_power {
                *value /= denom;
            }

            if summed_power.is_empty() {
                summed_power = vec![0.0; channel_power.len()];
                freqs = channel_freqs;
            }

            if summed_power.len() != channel_power.len() {
                continue;
            }

            for (i, value) in channel_power.iter().enumerate() {
                summed_power[i] += value;
            }
            used_channels += 1;
        }

        if used_channels == 0 {
            return None;
        }

        let denom = used_channels as f32;
        for value in &mut summed_power {
            *value /= denom;
        }

        Some((freqs, summed_power))
    }

    fn compute_alpha_peak(&self, buffer: &SampleBuffer) -> Option<(f32, f32, f32, f32)> {
        let (freqs, power) = self.compute_average_power_spectrum(buffer)?;
        self.compute_alpha_peak_from_spectrum(&freqs, &power)
    }

    fn update_long_term_peak(&mut self, buffer: &SampleBuffer) {
        let (freqs, power) = match self.compute_welch_spectrum(buffer) {
            Some(result) => result,
            None => return,
        };

        if self.long_term_psd.is_none() || self.long_term_freqs.is_none() {
            self.long_term_psd = Some(power);
            self.long_term_freqs = Some(freqs);
            self.long_term_psd_count = 1;
        } else if let (Some(existing), Some(existing_freqs)) =
            (self.long_term_psd.as_mut(), self.long_term_freqs.as_ref())
        {
            if existing.len() != power.len() || existing_freqs.len() != freqs.len() {
                self.long_term_psd = Some(power);
                self.long_term_freqs = Some(freqs);
                self.long_term_psd_count = 1;
            } else {
                let next_count = self.long_term_psd_count.saturating_add(1);
                let inv = 1.0 / next_count as f32;
                for (i, value) in power.iter().enumerate() {
                    let delta = *value - existing[i];
                    existing[i] += delta * inv;
                }
                self.long_term_psd_count = next_count;
            }
        }

        if let (Some(freqs), Some(psd)) =
            (self.long_term_freqs.as_ref(), self.long_term_psd.as_ref())
        {
            if let Some((peak_freq, _, _, _)) = self.compute_alpha_peak_from_spectrum(freqs, psd) {
                self.long_term_peak_frequency = peak_freq;
            }
        }
    }
}

impl Model for AlphaPeakModel {
    type Output = AlphaPeakOutput;

    fn name(&self) -> &str {
        "Alpha Peak Model"
    }

    fn min_samples(&self) -> usize {
        // At least 1 second of data for 1 Hz resolution
        (self.sample_rate as usize).max(self.welch_segment_len)
    }

    fn process(&mut self, buffer: &SampleBuffer) -> Option<Self::Output> {
        if buffer.sample_count() < self.min_samples() {
            return None;
        }

        let (peak_frequency, peak_power, alpha_power, snr) = self.compute_alpha_peak(buffer)?;

        if self.update_count == 0 || self.smoothed_peak_frequency == 0.0 {
            self.smoothed_peak_frequency = peak_frequency;
        } else {
            self.smoothed_peak_frequency = self.smoothed_peak_frequency
                * (1.0 - self.smoothing_alpha)
                + peak_frequency * self.smoothing_alpha;
        }

        self.update_long_term_peak(buffer);
        self.update_count += 1;

        Some(AlphaPeakOutput {
            peak_frequency,
            smoothed_peak_frequency: self.smoothed_peak_frequency,
            long_term_peak_frequency: self.long_term_peak_frequency,
            peak_power,
            alpha_power,
            snr,
        })
    }

    fn reset(&mut self) {
        self.smoothed_peak_frequency = 0.0;
        self.long_term_peak_frequency = 0.0;
        self.long_term_psd = None;
        self.long_term_freqs = None;
        self.long_term_psd_count = 0;
        self.update_count = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_buffer(
        sample_rate: u16,
        samples: usize,
        frequencies: &[(f32, f32)],
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
    fn test_alpha_peak_detects_frequency() {
        let mut model = AlphaPeakModel::new(256);
        let buffer = create_test_buffer(256, 512, &[(10.0, 50.0)]);

        let output = model.process(&buffer).unwrap();
        assert!((output.peak_frequency - 10.0).abs() < 0.6);
        assert!(output.peak_power > 0.0);
    }

    #[test]
    fn test_alpha_peak_prefers_stronger_signal() {
        let mut model = AlphaPeakModel::new(256);
        let buffer = create_test_buffer(256, 512, &[(10.0, 10.0), (12.0, 40.0)]);

        let output = model.process(&buffer).unwrap();
        assert!((output.peak_frequency - 12.0).abs() < 0.6);
    }

    #[test]
    fn test_alpha_peak_smoothing() {
        let mut model = AlphaPeakModel::new(256);
        model.set_smoothing(0.5);

        let buffer_a = create_test_buffer(256, 512, &[(9.0, 40.0)]);
        let buffer_b = create_test_buffer(256, 512, &[(12.0, 40.0)]);

        let output_a = model.process(&buffer_a).unwrap();
        let output_b = model.process(&buffer_b).unwrap();

        assert!(output_b.smoothed_peak_frequency > output_a.smoothed_peak_frequency);
    }
}
