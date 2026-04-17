//! Streaming EEG preprocessing utilities.

use serde::{Deserialize, Serialize};

use crate::filter::BiquadFilter;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DetrendMode {
    Off,
    Highpass,
    Linear,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct DetrendConfig {
    pub mode: DetrendMode,
    pub cutoff_hz: f32,
    pub q: f32,
}

impl Default for DetrendConfig {
    fn default() -> Self {
        Self {
            mode: DetrendMode::Highpass,
            cutoff_hz: 0.5,
            q: 0.707,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ReferenceMode {
    None,
    CommonAverage,
    CustomAverage,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ReferenceConfig {
    pub mode: ReferenceMode,
    pub channels: Vec<usize>,
}

impl Default for ReferenceConfig {
    fn default() -> Self {
        Self {
            mode: ReferenceMode::CommonAverage,
            channels: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct NotchConfig {
    pub mains_hz: Option<f32>,
    pub harmonics: Vec<f32>,
    pub q: f32,
}

impl Default for NotchConfig {
    fn default() -> Self {
        Self {
            mains_hz: Some(60.0),
            harmonics: vec![1.0, 2.0],
            q: 20.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct EegPreprocessorConfig {
    pub enabled: bool,
    pub preserve_raw: bool,
    pub notch: NotchConfig,
    pub detrend: DetrendConfig,
    pub reference: ReferenceConfig,
}

impl Default for EegPreprocessorConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            preserve_raw: true,
            notch: NotchConfig::default(),
            detrend: DetrendConfig::default(),
            reference: ReferenceConfig::default(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct StreamingEegPreprocessor {
    sample_rate_hz: f32,
    channel_count: usize,
    config: EegPreprocessorConfig,
    notch_frequencies_hz: Vec<f32>,
    notch_stages: Vec<Vec<BiquadFilter>>,
    detrend_stages: Vec<BiquadFilter>,
}

impl StreamingEegPreprocessor {
    pub fn new(
        sample_rate_hz: f32,
        channel_count: usize,
        config: EegPreprocessorConfig,
    ) -> Self {
        let mut processor = Self {
            sample_rate_hz,
            channel_count,
            config,
            notch_frequencies_hz: Vec::new(),
            notch_stages: Vec::new(),
            detrend_stages: Vec::new(),
        };
        processor.rebuild_filters();
        processor
    }

    pub fn sample_rate_hz(&self) -> f32 {
        self.sample_rate_hz
    }

    pub fn channel_count(&self) -> usize {
        self.channel_count
    }

    pub fn config(&self) -> &EegPreprocessorConfig {
        &self.config
    }

    pub fn notch_frequencies_hz(&self) -> &[f32] {
        &self.notch_frequencies_hz
    }

    pub fn update_layout(&mut self, sample_rate_hz: f32, channel_count: usize) {
        if (self.sample_rate_hz - sample_rate_hz).abs() < f32::EPSILON
            && self.channel_count == channel_count
        {
            return;
        }
        self.sample_rate_hz = sample_rate_hz;
        self.channel_count = channel_count;
        self.rebuild_filters();
    }

    pub fn set_config(&mut self, config: EegPreprocessorConfig) {
        if self.config == config {
            return;
        }
        self.config = config;
        self.rebuild_filters();
    }

    pub fn reset(&mut self) {
        for stage in &mut self.notch_stages {
            for filter in stage {
                filter.reset();
            }
        }
        for filter in &mut self.detrend_stages {
            filter.reset();
        }
    }

    pub fn process_interleaved(&mut self, data: &[f32]) -> Vec<f32> {
        if !self.config.enabled || self.channel_count == 0 || data.is_empty() {
            return data.to_vec();
        }
        let sample_count = data.len() / self.channel_count;
        if sample_count == 0 {
            return data.to_vec();
        }

        let mut rows = Vec::with_capacity(sample_count);
        for sample_idx in 0..sample_count {
            let mut row = Vec::with_capacity(self.channel_count);
            let base = sample_idx * self.channel_count;
            row.extend_from_slice(&data[base..base + self.channel_count]);
            rows.push(row);
        }

        self.process_rows_in_place(&mut rows);

        let mut out = Vec::with_capacity(sample_count * self.channel_count);
        for row in rows {
            out.extend(row);
        }
        out
    }

    fn process_rows_in_place(&mut self, rows: &mut [Vec<f32>]) {
        self.apply_iir_filters(rows);

        if self.config.detrend.mode == DetrendMode::Linear {
            apply_linear_detrend(rows, self.channel_count);
        }

        self.apply_rereference(rows);
    }

    fn apply_iir_filters(&mut self, rows: &mut [Vec<f32>]) {
        for row in rows {
            for channel_idx in 0..self.channel_count {
                let mut value = row[channel_idx];
                for stage in &mut self.notch_stages {
                    if let Some(filter) = stage.get_mut(channel_idx) {
                        value = filter.process(value);
                    }
                }
                if let Some(filter) = self.detrend_stages.get_mut(channel_idx) {
                    value = filter.process(value);
                }
                row[channel_idx] = value;
            }
        }
    }

    fn apply_rereference(&self, rows: &mut [Vec<f32>]) {
        let reference_indices = self.reference_indices();
        if reference_indices.is_empty() {
            return;
        }

        for row in rows {
            let mut reference_sum = 0.0_f32;
            let mut reference_count = 0_usize;

            for &idx in &reference_indices {
                if let Some(value) = row.get(idx) {
                    reference_sum += *value;
                    reference_count += 1;
                }
            }

            if reference_count == 0 {
                continue;
            }

            let reference = reference_sum / reference_count as f32;
            for value in row.iter_mut() {
                *value -= reference;
            }
        }
    }

    fn reference_indices(&self) -> Vec<usize> {
        match self.config.reference.mode {
            ReferenceMode::None => Vec::new(),
            ReferenceMode::CommonAverage => (0..self.channel_count).collect(),
            ReferenceMode::CustomAverage => self
                .config
                .reference
                .channels
                .iter()
                .copied()
                .filter(|idx| *idx < self.channel_count)
                .collect(),
        }
    }

    fn rebuild_filters(&mut self) {
        self.notch_frequencies_hz = resolve_notch_frequencies(
            self.sample_rate_hz,
            self.config.notch.mains_hz,
            &self.config.notch.harmonics,
        );

        self.notch_stages = self
            .notch_frequencies_hz
            .iter()
            .map(|freq_hz| {
                (0..self.channel_count)
                    .map(|_| BiquadFilter::notch(*freq_hz, self.bandwidth_hz(*freq_hz), self.sample_rate_hz))
                    .collect()
            })
            .collect();

        self.detrend_stages = if self.config.detrend.mode == DetrendMode::Highpass {
            (0..self.channel_count)
                .map(|_| {
                    BiquadFilter::highpass(
                        self.config.detrend.cutoff_hz,
                        self.sample_rate_hz,
                        self.config.detrend.q,
                    )
                })
                .collect()
        } else {
            Vec::new()
        };
    }

    fn bandwidth_hz(&self, center_hz: f32) -> f32 {
        let q = self.config.notch.q.max(0.1);
        (center_hz / q).max(0.5)
    }
}

fn resolve_notch_frequencies(
    sample_rate_hz: f32,
    mains_hz: Option<f32>,
    harmonics: &[f32],
) -> Vec<f32> {
    let Some(mains_hz) = mains_hz else {
        return Vec::new();
    };
    if mains_hz <= 0.0 || sample_rate_hz <= 0.0 {
        return Vec::new();
    }

    let nyquist_hz = sample_rate_hz / 2.0;
    let mut out = Vec::new();
    for harmonic in harmonics {
        let frequency_hz = mains_hz * *harmonic;
        if frequency_hz > 0.0 && frequency_hz < nyquist_hz - 1.0 {
            if !out.iter().any(|existing| (existing - frequency_hz).abs() < 1e-3) {
                out.push(frequency_hz);
            }
        }
    }
    out.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    out
}

fn apply_linear_detrend(rows: &mut [Vec<f32>], channel_count: usize) {
    let sample_count = rows.len();
    if sample_count < 2 || channel_count == 0 {
        return;
    }

    let mean_x = (sample_count - 1) as f32 / 2.0;
    let var_x = (0..sample_count)
        .map(|idx| {
            let centered = idx as f32 - mean_x;
            centered * centered
        })
        .sum::<f32>();
    if var_x <= f32::EPSILON {
        return;
    }

    for channel_idx in 0..channel_count {
        let mean_y = rows.iter().map(|row| row[channel_idx]).sum::<f32>() / sample_count as f32;
        let covariance = rows
            .iter()
            .enumerate()
            .map(|(sample_idx, row)| (sample_idx as f32 - mean_x) * (row[channel_idx] - mean_y))
            .sum::<f32>();
        let slope = covariance / var_x;
        let intercept = mean_y - slope * mean_x;

        for (sample_idx, row) in rows.iter_mut().enumerate() {
            let trend = intercept + slope * sample_idx as f32;
            row[channel_idx] -= trend;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    fn rms(values: &[f32]) -> f32 {
        let mean_square = values.iter().map(|value| value * value).sum::<f32>() / values.len() as f32;
        mean_square.sqrt()
    }

    #[test]
    fn common_average_reference_centers_each_row() {
        let config = EegPreprocessorConfig {
            notch: NotchConfig {
                mains_hz: None,
                ..NotchConfig::default()
            },
            detrend: DetrendConfig {
                mode: DetrendMode::Off,
                ..DetrendConfig::default()
            },
            ..EegPreprocessorConfig::default()
        };
        let mut processor = StreamingEegPreprocessor::new(256.0, 4, config);
        let out = processor.process_interleaved(&[1.0, 2.0, 3.0, 4.0]);
        assert_eq!(out.len(), 4);
        assert!((out[0] + 1.5).abs() < 1e-6);
        assert!((out[1] + 0.5).abs() < 1e-6);
        assert!((out[2] - 0.5).abs() < 1e-6);
        assert!((out[3] - 1.5).abs() < 1e-6);
    }

    #[test]
    fn notch_filter_attenuates_mains_frequency() {
        let config = EegPreprocessorConfig {
            reference: ReferenceConfig {
                mode: ReferenceMode::None,
                channels: Vec::new(),
            },
            ..EegPreprocessorConfig::default()
        };
        let mut processor = StreamingEegPreprocessor::new(256.0, 1, config);
        let data: Vec<f32> = (0..512)
            .map(|idx| {
                let t = idx as f32 / 256.0;
                (2.0 * PI * 10.0 * t).sin() + 0.8 * (2.0 * PI * 60.0 * t).sin()
            })
            .collect();

        let filtered = processor.process_interleaved(&data);
        assert!(rms(&filtered[256..]) < rms(&data[256..]));
    }

    #[test]
    fn linear_detrend_removes_ramp() {
        let config = EegPreprocessorConfig {
            notch: NotchConfig {
                mains_hz: None,
                ..NotchConfig::default()
            },
            detrend: DetrendConfig {
                mode: DetrendMode::Linear,
                ..DetrendConfig::default()
            },
            reference: ReferenceConfig {
                mode: ReferenceMode::None,
                channels: Vec::new(),
            },
            ..EegPreprocessorConfig::default()
        };
        let mut processor = StreamingEegPreprocessor::new(256.0, 1, config);
        let data: Vec<f32> = (0..128).map(|idx| idx as f32 * 0.1).collect();
        let filtered = processor.process_interleaved(&data);
        let mean = filtered.iter().sum::<f32>() / filtered.len() as f32;
        assert!(mean.abs() < 1e-3);
        assert!(filtered.iter().all(|value| value.abs() < 1e-2));
    }
}
