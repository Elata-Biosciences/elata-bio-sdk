//! Spectral estimation: scipy-compatible Welch PSD and PSD-derived features.
//!
//! The FFT itself is reused from `elata_eeg_signal` (radix-2, zero-padding to
//! the next power of two). Everything layered on top matches
//! `scipy.signal.welch(x, fs, window="hann", nperseg, noverlap=nperseg//2,
//! nfft=next_pow2(nperseg), detrend="constant", scaling="density")`:
//! periodic Hann window, constant detrend per segment, one-sided density
//! scaling `1 / (fs * sum(w^2))` with doubling of the interior bins, and mean
//! averaging across segments.

use crate::config::{AlphaPeakConfig, WelchConfig};
use elata_eeg_signal::{fft, power_spectrum};

/// One-sided power spectral density (units²/Hz) with its frequency grid.
#[derive(Debug, Clone, PartialEq)]
pub struct Psd {
    pub freqs_hz: Vec<f64>,
    pub psd: Vec<f64>,
}

impl Psd {
    /// Frequency-grid resolution in Hz (0 for degenerate grids).
    pub fn df(&self) -> f64 {
        if self.freqs_hz.len() < 2 {
            return 0.0;
        }
        self.freqs_hz[1] - self.freqs_hz[0]
    }
}

/// Periodic Hann window (scipy `get_window("hann", n)` / `fftbins=True`).
///
/// NOTE: deliberately not `elata_eeg_signal::Window::Hann`, which is the
/// symmetric variant (`/(n-1)`); scipy's Welch default is periodic (`/n`).
fn periodic_hann(n: usize) -> Vec<f64> {
    (0..n)
        .map(|i| 0.5 * (1.0 - (2.0 * std::f64::consts::PI * i as f64 / n as f64).cos()))
        .collect()
}

/// Welch PSD estimate. `algorithm: welch_psd@1`.
///
/// Returns an empty [`Psd`] for signals shorter than 2 samples.
pub fn welch_psd(signal: &[f32], sample_rate_hz: f64, cfg: &WelchConfig) -> Psd {
    let n = signal.len();
    if n < 2 || sample_rate_hz.is_nan() || sample_rate_hz <= 0.0 {
        return Psd {
            freqs_hz: Vec::new(),
            psd: Vec::new(),
        };
    }

    let mut nperseg = (cfg.segment_seconds * sample_rate_hz).round() as usize;
    nperseg = nperseg.clamp(2, n);
    let noverlap = ((nperseg as f64) * cfg.overlap_ratio).floor() as usize;
    let step = nperseg - noverlap;
    let nfft = nperseg.next_power_of_two();
    let n_bins = nfft / 2 + 1;

    let window = periodic_hann(nperseg);
    let win_sumsq: f64 = window.iter().map(|w| w * w).sum();
    let scale = 1.0 / (sample_rate_hz * win_sumsq);

    let mut acc = vec![0.0f64; n_bins];
    let mut segment_count = 0usize;
    let mut windowed = vec![0.0f32; nperseg];

    let mut start = 0usize;
    while start + nperseg <= n {
        let segment = &signal[start..start + nperseg];
        // Constant detrend (mean removal), computed in f64.
        let mean: f64 = segment.iter().map(|&x| f64::from(x)).sum::<f64>() / nperseg as f64;
        for (i, &x) in segment.iter().enumerate() {
            windowed[i] = ((f64::from(x) - mean) * window[i]) as f32;
        }
        // `fft` zero-pads to `nfft` (next power of two) internally.
        let spectrum = fft(&windowed);
        debug_assert_eq!(spectrum.len(), nfft);
        let power = power_spectrum(&spectrum);
        for (k, &p) in power.iter().enumerate() {
            let mut value = f64::from(p) * scale;
            if k != 0 && k != n_bins - 1 {
                value *= 2.0;
            }
            acc[k] += value;
        }
        segment_count += 1;
        start += step;
    }

    if segment_count == 0 {
        return Psd {
            freqs_hz: Vec::new(),
            psd: Vec::new(),
        };
    }
    for value in &mut acc {
        *value /= segment_count as f64;
    }
    let freqs_hz = (0..n_bins)
        .map(|k| k as f64 * sample_rate_hz / nfft as f64)
        .collect::<Vec<f64>>();
    Psd { freqs_hz, psd: acc }
}

/// Normalized Shannon spectral entropy over the one-sided PSD.
/// `algorithm: spectral_entropy@1`.
///
/// `H = -sum(p * ln p) / ln(nBins)` where `p = psd / sum(psd)`; zero-power
/// bins contribute nothing. Returns 0 for degenerate inputs.
pub fn spectral_entropy(psd: &[f64]) -> f64 {
    if psd.len() < 2 {
        return 0.0;
    }
    let total: f64 = psd.iter().filter(|p| p.is_finite() && **p > 0.0).sum();
    if total <= 0.0 {
        return 0.0;
    }
    let mut entropy = 0.0f64;
    for &value in psd {
        if value > 0.0 && value.is_finite() {
            let p = value / total;
            entropy -= p * p.ln();
        }
    }
    entropy / (psd.len() as f64).ln()
}

/// Frequency of the largest PSD bin within `[low_hz, high_hz]` (inclusive).
/// `algorithm: dominant_frequency@1`. `None` when no bins fall in the range.
pub fn dominant_frequency(psd: &Psd, low_hz: f64, high_hz: f64) -> Option<f64> {
    let mut best: Option<(f64, f64)> = None;
    for (&freq, &power) in psd.freqs_hz.iter().zip(psd.psd.iter()) {
        if freq < low_hz || freq > high_hz {
            continue;
        }
        match best {
            Some((_, best_power)) if power <= best_power => {}
            _ => best = Some((freq, power)),
        }
    }
    best.map(|(freq, _)| freq)
}

/// Prominence-qualified alpha-peak (IAF) frequency. `algorithm: alpha_peak@2`.
///
/// Restricts the PSD to the inclusive search band, finds strict local maxima
/// (never the band edges), computes scipy-style prominence within the band
/// slice, and returns the frequency of the highest peak that satisfies both
/// gates: prominence >= `min_prominence_ratio * peakHeight`, and
/// peakHeight >= `min_peak_to_spectrum_max_ratio * max(full psd)`.
/// `None` when no peak qualifies.
pub fn alpha_peak(psd: &Psd, cfg: &AlphaPeakConfig) -> Option<f64> {
    let [low, high] = cfg.search_hz;
    let indices: Vec<usize> = psd
        .freqs_hz
        .iter()
        .enumerate()
        .filter(|(_, &f)| f >= low && f <= high)
        .map(|(i, _)| i)
        .collect();
    if indices.len() < 3 {
        return None;
    }
    let band: Vec<f64> = indices.iter().map(|&i| psd.psd[i]).collect();
    let spectrum_max = psd.psd.iter().cloned().fold(0.0f64, f64::max);
    let height_floor = cfg.min_peak_to_spectrum_max_ratio * spectrum_max;

    let mut best: Option<(usize, f64)> = None;
    for i in 1..band.len() - 1 {
        if !(band[i] > band[i - 1] && band[i] > band[i + 1]) {
            continue;
        }
        if band[i] < height_floor {
            continue;
        }
        let prominence = scipy_prominence(&band, i);
        if prominence < cfg.min_prominence_ratio * band[i] {
            continue;
        }
        match best {
            Some((_, best_height)) if band[i] <= best_height => {}
            _ => best = Some((i, band[i])),
        }
    }
    best.map(|(i, _)| psd.freqs_hz[indices[i]])
}

/// scipy `peak_prominences` for a single peak within `values`.
///
/// On each side, walk outward until a value higher than the peak (or the array
/// edge); the base is the minimum over that stretch. Prominence is the peak
/// height minus the higher of the two bases.
fn scipy_prominence(values: &[f64], peak: usize) -> f64 {
    let height = values[peak];

    let mut left_base = height;
    let mut i = peak;
    while i > 0 {
        i -= 1;
        if values[i] > height {
            break;
        }
        if values[i] < left_base {
            left_base = values[i];
        }
    }

    let mut right_base = height;
    let mut j = peak;
    while j + 1 < values.len() {
        j += 1;
        if values[j] > height {
            break;
        }
        if values[j] < right_base {
            right_base = values[j];
        }
    }

    height - left_base.max(right_base)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::EegWindowConfig;
    use std::f64::consts::PI;

    fn sine(freq_hz: f64, amplitude: f64, sample_rate_hz: f64, n: usize) -> Vec<f32> {
        (0..n)
            .map(|i| (amplitude * (2.0 * PI * freq_hz * i as f64 / sample_rate_hz).sin()) as f32)
            .collect()
    }

    #[test]
    fn welch_psd_grid_matches_scipy_shape() {
        let cfg = WelchConfig::default();
        let signal = sine(10.0, 20.0, 256.0, 2048);
        let out = welch_psd(&signal, 256.0, &cfg);
        // nperseg = 1024, nfft = 1024 -> 513 one-sided bins, df = 0.25 Hz.
        assert_eq!(out.psd.len(), 513);
        assert_eq!(out.freqs_hz.len(), 513);
        assert!((out.df() - 0.25).abs() < 1e-12);
        assert!((out.freqs_hz[512] - 128.0).abs() < 1e-9);
    }

    #[test]
    fn welch_psd_peaks_at_signal_frequency() {
        let cfg = WelchConfig::default();
        let out = welch_psd(&sine(10.0, 20.0, 256.0, 2048), 256.0, &cfg);
        let peak_bin = out
            .psd
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
            .map(|(i, _)| i)
            .unwrap();
        assert!((out.freqs_hz[peak_bin] - 10.0).abs() < 0.26);
    }

    #[test]
    fn welch_psd_density_integrates_to_signal_power() {
        // Parseval sanity: integral of the one-sided density approximates the
        // signal variance (A^2/2 for a sine).
        let cfg = WelchConfig::default();
        let amplitude = 20.0;
        let out = welch_psd(&sine(10.0, amplitude, 256.0, 4096), 256.0, &cfg);
        let integral: f64 = out.psd.iter().sum::<f64>() * out.df();
        let expected = amplitude * amplitude / 2.0;
        assert!(
            (integral - expected).abs() / expected < 0.05,
            "integral {integral} vs expected {expected}"
        );
    }

    #[test]
    fn welch_psd_short_signal_uses_full_length_segment() {
        let cfg = WelchConfig::default();
        let out = welch_psd(&sine(10.0, 1.0, 256.0, 256), 256.0, &cfg);
        // nperseg clamps to 256 -> nfft 256 -> 129 bins.
        assert_eq!(out.psd.len(), 129);
    }

    #[test]
    fn welch_psd_empty_or_flat_inputs_are_safe() {
        let cfg = WelchConfig::default();
        assert!(welch_psd(&[], 256.0, &cfg).psd.is_empty());
        assert!(welch_psd(&[1.0], 256.0, &cfg).psd.is_empty());
        let flat = welch_psd(&vec![3.5f32; 2048], 256.0, &cfg);
        // Constant detrend removes everything: all-zero PSD.
        assert!(flat.psd.iter().all(|p| *p == 0.0));
    }

    #[test]
    fn spectral_entropy_bounds() {
        // Single-bin concentration -> 0; uniform -> 1.
        let mut concentrated = vec![0.0f64; 128];
        concentrated[10] = 5.0;
        assert!(spectral_entropy(&concentrated) < 1e-12);
        let uniform = vec![2.0f64; 128];
        assert!((spectral_entropy(&uniform) - 1.0).abs() < 1e-12);
        assert_eq!(spectral_entropy(&[]), 0.0);
        assert_eq!(spectral_entropy(&[0.0, 0.0]), 0.0);
    }

    #[test]
    fn dominant_frequency_respects_range() {
        let cfg = WelchConfig::default();
        // 0.5 Hz drift is huge but outside the 1-40 Hz range.
        let n = 2048;
        let signal: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f64 / 256.0;
                (100.0 * (2.0 * PI * 0.5 * t).sin() + 5.0 * (2.0 * PI * 22.0 * t).sin()) as f32
            })
            .collect();
        let psd = welch_psd(&signal, 256.0, &cfg);
        let dominant = dominant_frequency(&psd, 1.0, 40.0).unwrap();
        assert!((dominant - 22.0).abs() < 0.26, "dominant {dominant}");
        assert!(dominant_frequency(&psd, 500.0, 600.0).is_none());
    }

    #[test]
    fn alpha_peak_found_for_clear_bump_and_none_for_flat() {
        let config = EegWindowConfig::default();
        let n = 4096;
        // Alpha bump at 10.25 Hz on top of broadband-ish content.
        let signal: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f64 / 256.0;
                (8.0 * (2.0 * PI * 10.25 * t).sin()
                    + 1.0 * (2.0 * PI * 3.0 * t).sin()
                    + 1.0 * (2.0 * PI * 27.0 * t).sin()) as f32
            })
            .collect();
        let psd = welch_psd(&signal, 256.0, &config.welch);
        let peak = alpha_peak(&psd, &config.alpha_peak).expect("peak expected");
        assert!((peak - 10.25).abs() <= 0.25, "peak {peak}");

        // A pure non-alpha tone yields no qualified alpha peak.
        let no_alpha = welch_psd(&sine(25.0, 10.0, 256.0, 4096), 256.0, &config.welch);
        assert!(alpha_peak(&no_alpha, &config.alpha_peak).is_none());
    }

    #[test]
    fn scipy_prominence_matches_hand_computed_case() {
        // Peak of height 5 with bases 1 (left) and 2 (right) -> prominence 3.
        let values = [1.0, 5.0, 2.0, 6.0, 0.5];
        assert!((scipy_prominence(&values, 1) - 3.0).abs() < 1e-12);
        // Highest peak: bases run to the edges; prominence = 6 - max(1, 0.5).
        assert!((scipy_prominence(&values, 3) - 5.0).abs() < 1e-12);
    }
}
