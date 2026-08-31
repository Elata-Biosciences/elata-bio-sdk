//! Per-window EEG signal-quality flags. `algorithm: eeg_quality_flags@1`.

use crate::config::QualityConfig;
use crate::spectral::Psd;
use serde::{Deserialize, Serialize};

/// Quality fractions plus the aggregate `usable` verdict.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QualityFlags {
    /// Fraction of successive-sample steps below the flatline epsilon.
    pub flatline_fraction: f64,
    /// Fraction of samples at/above the clip amplitude.
    pub clipped_fraction: f64,
    /// Fraction of samples at/above the extreme amplitude.
    pub extreme_amplitude_fraction: f64,
    /// PSD power within ±halfWidth of the configured mains frequencies,
    /// as a fraction of total PSD power.
    pub line_noise_ratio: f64,
    pub usable: bool,
}

/// Compute [`QualityFlags`] over a raw window plus its already-computed PSD.
///
/// The PSD must be the same-window Welch estimate (the analyzer computes it
/// once and shares it across all spectral consumers).
pub fn eeg_window_quality(signal: &[f32], psd: &Psd, cfg: &QualityConfig) -> QualityFlags {
    let n = signal.len();
    let (flatline_fraction, clipped_fraction, extreme_amplitude_fraction) = if n == 0 {
        (1.0, 0.0, 0.0)
    } else {
        let mut clipped = 0usize;
        let mut extreme = 0usize;
        for &raw in signal {
            let magnitude = f64::from(raw).abs();
            if magnitude >= cfg.clip_uv {
                clipped += 1;
            }
            if magnitude >= cfg.extreme_amplitude_uv {
                extreme += 1;
            }
        }
        let flatline = if n < 2 {
            1.0
        } else {
            let mut flat_steps = 0usize;
            for pair in signal.windows(2) {
                if (f64::from(pair[1]) - f64::from(pair[0])).abs() < cfg.flatline_eps_uv {
                    flat_steps += 1;
                }
            }
            flat_steps as f64 / (n - 1) as f64
        };
        (
            flatline,
            clipped as f64 / n as f64,
            extreme as f64 / n as f64,
        )
    };

    let total_power: f64 = psd.psd.iter().sum();
    let line_noise_ratio = if total_power > 0.0 {
        let mut line_power = 0.0f64;
        for (&freq, &power) in psd.freqs_hz.iter().zip(psd.psd.iter()) {
            let near_mains = cfg
                .line_noise_hz
                .iter()
                .any(|&mains| (freq - mains).abs() <= cfg.line_noise_half_width_hz);
            if near_mains {
                line_power += power;
            }
        }
        line_power / total_power
    } else {
        0.0
    };

    let usable = clipped_fraction < cfg.max_clipped_fraction
        && flatline_fraction < cfg.max_flatline_fraction
        && extreme_amplitude_fraction < cfg.max_extreme_fraction
        && line_noise_ratio < cfg.max_line_noise_ratio;

    QualityFlags {
        flatline_fraction,
        clipped_fraction,
        extreme_amplitude_fraction,
        line_noise_ratio,
        usable,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::WelchConfig;
    use crate::spectral::welch_psd;
    use std::f64::consts::PI;

    fn analyze(signal: &[f32], cfg: &QualityConfig) -> QualityFlags {
        let psd = welch_psd(signal, 256.0, &WelchConfig::default());
        eeg_window_quality(signal, &psd, cfg)
    }

    fn sine(freq_hz: f64, amplitude: f64, n: usize) -> Vec<f32> {
        (0..n)
            .map(|i| (amplitude * (2.0 * PI * freq_hz * i as f64 / 256.0).sin()) as f32)
            .collect()
    }

    #[test]
    fn clean_sine_is_usable() {
        let flags = analyze(&sine(10.0, 30.0, 2048), &QualityConfig::default());
        assert!(flags.usable);
        assert_eq!(flags.clipped_fraction, 0.0);
        assert_eq!(flags.extreme_amplitude_fraction, 0.0);
        assert!(flags.flatline_fraction < 0.05);
        assert!(flags.line_noise_ratio < 0.05);
    }

    #[test]
    fn flatline_signal_is_flagged() {
        let mut signal = sine(10.0, 30.0, 2048);
        for value in signal.iter_mut().take(1024) {
            *value = 5.0;
        }
        let flags = analyze(&signal, &QualityConfig::default());
        assert!(
            flags.flatline_fraction > 0.4,
            "flatline {}",
            flags.flatline_fraction
        );
        assert!(!flags.usable);
    }

    #[test]
    fn clipping_is_flagged() {
        let signal: Vec<f32> = sine(10.0, 800.0, 2048)
            .iter()
            .map(|&x| x.clamp(-500.0, 500.0))
            .collect();
        let flags = analyze(&signal, &QualityConfig::default());
        assert!(
            flags.clipped_fraction > 0.2,
            "clipped {}",
            flags.clipped_fraction
        );
        assert!(!flags.usable);
    }

    #[test]
    fn mains_contamination_is_flagged() {
        let mixed: Vec<f32> = sine(10.0, 5.0, 2048)
            .iter()
            .zip(sine(60.0, 40.0, 2048))
            .map(|(&a, b)| a + b)
            .collect();
        let flags = analyze(&mixed, &QualityConfig::default());
        assert!(
            flags.line_noise_ratio > 0.5,
            "line {}",
            flags.line_noise_ratio
        );
        assert!(!flags.usable);
    }

    #[test]
    fn empty_window_is_unusable() {
        let flags = eeg_window_quality(
            &[],
            &Psd {
                freqs_hz: vec![],
                psd: vec![],
            },
            &QualityConfig::default(),
        );
        assert_eq!(flags.flatline_fraction, 1.0);
        assert!(!flags.usable);
    }
}
