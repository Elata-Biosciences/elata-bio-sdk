//! Basic time-domain window statistics. `algorithm: window_stats@1`.

use serde::{Deserialize, Serialize};

/// Time-domain statistics over one window (f64 accumulation).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WindowStats {
    pub mean: f64,
    /// Root mean square, `sqrt(mean(x^2))`.
    pub rms: f64,
    /// Population variance (ddof = 0).
    pub variance: f64,
    /// Population standard deviation.
    pub std: f64,
    /// Peak-to-peak amplitude, `max - min`.
    pub ptp: f64,
}

/// Compute [`WindowStats`]; all zeros for an empty window.
pub fn window_stats(signal: &[f32]) -> WindowStats {
    if signal.is_empty() {
        return WindowStats {
            mean: 0.0,
            rms: 0.0,
            variance: 0.0,
            std: 0.0,
            ptp: 0.0,
        };
    }
    let n = signal.len() as f64;
    let mut sum = 0.0f64;
    let mut sum_sq = 0.0f64;
    let mut min = f64::INFINITY;
    let mut max = f64::NEG_INFINITY;
    for &raw in signal {
        let x = f64::from(raw);
        sum += x;
        sum_sq += x * x;
        if x < min {
            min = x;
        }
        if x > max {
            max = x;
        }
    }
    let mean = sum / n;
    let rms = (sum_sq / n).sqrt();
    // Two-pass variance for numerical robustness (matches numpy `var`).
    let mut acc = 0.0f64;
    for &raw in signal {
        let delta = f64::from(raw) - mean;
        acc += delta * delta;
    }
    let variance = acc / n;
    WindowStats {
        mean,
        rms,
        variance,
        std: variance.sqrt(),
        ptp: max - min,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_small_case() {
        let stats = window_stats(&[1.0, 2.0, 3.0, 4.0]);
        assert!((stats.mean - 2.5).abs() < 1e-12);
        assert!((stats.variance - 1.25).abs() < 1e-12);
        assert!((stats.std - 1.25f64.sqrt()).abs() < 1e-12);
        assert!((stats.rms - (30.0f64 / 4.0).sqrt()).abs() < 1e-12);
        assert!((stats.ptp - 3.0).abs() < 1e-12);
    }

    #[test]
    fn constant_signal() {
        let stats = window_stats(&[-3.0; 64]);
        assert!((stats.mean + 3.0).abs() < 1e-12);
        assert_eq!(stats.variance, 0.0);
        assert_eq!(stats.std, 0.0);
        assert!((stats.rms - 3.0).abs() < 1e-12);
        assert_eq!(stats.ptp, 0.0);
    }

    #[test]
    fn empty_signal_is_all_zero() {
        let stats = window_stats(&[]);
        assert_eq!(
            stats,
            WindowStats {
                mean: 0.0,
                rms: 0.0,
                variance: 0.0,
                std: 0.0,
                ptp: 0.0
            }
        );
    }
}
