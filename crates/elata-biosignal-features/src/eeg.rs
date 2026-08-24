//! EEG features derived from a precomputed Welch PSD, plus Hjorth parameters.

use crate::config::BandsConfig;
use crate::spectral::Psd;
use serde::{Deserialize, Serialize};

/// Per-band values keyed by canonical band name.
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BandValues {
    pub delta: f64,
    pub theta: f64,
    pub alpha: f64,
    pub beta: f64,
    pub gamma: f64,
}

/// Absolute (µV²), relative (fraction of 5-band total), and log10 band powers.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BandPowersFromPsd {
    pub abs: BandValues,
    pub rel: BandValues,
    pub log: BandValues,
}

/// Floor used before taking log10 so silent bands stay finite.
pub const LOG_POWER_FLOOR: f64 = 1e-12;

/// Band power integration from a one-sided PSD. `algorithm: eeg_band_power@2`.
///
/// Absolute power per band = `sum(psd[bin] for low <= f < high) * df`
/// (rectangular integration, right-exclusive edges so adjacent bands never
/// share a bin). Relative powers are fractions of the 5-band total (zeros when
/// the total is zero); log powers are `log10(max(abs, 1e-12))`.
pub fn band_powers_from_psd(psd: &Psd, bands: &BandsConfig) -> BandPowersFromPsd {
    let df = psd.df();
    let integrate = |band: [f64; 2]| -> f64 {
        let [low, high] = band;
        let mut sum = 0.0f64;
        for (&freq, &power) in psd.freqs_hz.iter().zip(psd.psd.iter()) {
            if freq >= low && freq < high {
                sum += power;
            }
        }
        sum * df
    };

    let abs = BandValues {
        delta: integrate(bands.delta),
        theta: integrate(bands.theta),
        alpha: integrate(bands.alpha),
        beta: integrate(bands.beta),
        gamma: integrate(bands.gamma),
    };
    let total = abs.delta + abs.theta + abs.alpha + abs.beta + abs.gamma;
    let rel = if total > 0.0 {
        BandValues {
            delta: abs.delta / total,
            theta: abs.theta / total,
            alpha: abs.alpha / total,
            beta: abs.beta / total,
            gamma: abs.gamma / total,
        }
    } else {
        BandValues::default()
    };
    let log = BandValues {
        delta: abs.delta.max(LOG_POWER_FLOOR).log10(),
        theta: abs.theta.max(LOG_POWER_FLOOR).log10(),
        alpha: abs.alpha.max(LOG_POWER_FLOOR).log10(),
        beta: abs.beta.max(LOG_POWER_FLOOR).log10(),
        gamma: abs.gamma.max(LOG_POWER_FLOOR).log10(),
    };
    BandPowersFromPsd { abs, rel, log }
}

/// Hjorth parameters. `algorithm: hjorth@1`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Hjorth {
    /// Signal variance (population, ddof = 0).
    pub activity: f64,
    /// `sqrt(var(dx) / var(x))`.
    pub mobility: f64,
    /// `mobility(dx) / mobility(x)`.
    pub complexity: f64,
}

fn population_variance(values: impl Iterator<Item = f64> + Clone) -> f64 {
    let mut count = 0usize;
    let mut sum = 0.0f64;
    for value in values.clone() {
        sum += value;
        count += 1;
    }
    if count == 0 {
        return 0.0;
    }
    let mean = sum / count as f64;
    let mut acc = 0.0f64;
    for value in values {
        let delta = value - mean;
        acc += delta * delta;
    }
    acc / count as f64
}

/// Hjorth activity/mobility/complexity over a raw window (f64 accumulation).
///
/// Degenerate denominators yield 0 for the affected ratio.
pub fn hjorth(signal: &[f32]) -> Hjorth {
    if signal.len() < 3 {
        return Hjorth {
            activity: 0.0,
            mobility: 0.0,
            complexity: 0.0,
        };
    }
    let x = || signal.iter().map(|&v| f64::from(v));
    let dx = || signal.windows(2).map(|w| f64::from(w[1]) - f64::from(w[0]));
    let ddx = || {
        signal
            .windows(3)
            .map(|w| (f64::from(w[2]) - f64::from(w[1])) - (f64::from(w[1]) - f64::from(w[0])))
    };

    let var_x = population_variance(x());
    let var_dx = population_variance(dx());
    let var_ddx = population_variance(ddx());

    let mobility = if var_x > 0.0 {
        (var_dx / var_x).sqrt()
    } else {
        0.0
    };
    let mobility_dx = if var_dx > 0.0 {
        (var_ddx / var_dx).sqrt()
    } else {
        0.0
    };
    let complexity = if mobility > 0.0 {
        mobility_dx / mobility
    } else {
        0.0
    };

    Hjorth {
        activity: var_x,
        mobility,
        complexity,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::WelchConfig;
    use crate::spectral::welch_psd;
    use std::f64::consts::PI;

    #[test]
    fn band_powers_concentrate_in_the_right_band() {
        let n = 2048;
        let signal: Vec<f32> = (0..n)
            .map(|i| (20.0 * (2.0 * PI * 10.0 * i as f64 / 256.0).sin()) as f32)
            .collect();
        let psd = welch_psd(&signal, 256.0, &WelchConfig::default());
        let powers = band_powers_from_psd(&psd, &BandsConfig::default());
        assert!(powers.rel.alpha > 0.95, "alpha rel {}", powers.rel.alpha);
        let rel_sum = powers.rel.delta
            + powers.rel.theta
            + powers.rel.alpha
            + powers.rel.beta
            + powers.rel.gamma;
        assert!((rel_sum - 1.0).abs() < 1e-9);
        assert!((powers.log.alpha - powers.abs.alpha.log10()).abs() < 1e-12);
    }

    #[test]
    fn band_edges_are_right_exclusive() {
        // Energy exactly at 13 Hz belongs to beta ([13,30)), not alpha ([8,13)).
        let n = 4096;
        let signal: Vec<f32> = (0..n)
            .map(|i| (10.0 * (2.0 * PI * 13.0 * i as f64 / 256.0).sin()) as f32)
            .collect();
        let psd = welch_psd(&signal, 256.0, &WelchConfig::default());
        let powers = band_powers_from_psd(&psd, &BandsConfig::default());
        assert!(powers.abs.beta > powers.abs.alpha);
    }

    #[test]
    fn zero_psd_gives_zero_rel_and_floored_log() {
        let psd = Psd {
            freqs_hz: vec![0.0, 1.0, 2.0],
            psd: vec![0.0, 0.0, 0.0],
        };
        let powers = band_powers_from_psd(&psd, &BandsConfig::default());
        assert_eq!(powers.rel, BandValues::default());
        assert!((powers.log.alpha - LOG_POWER_FLOOR.log10()).abs() < 1e-12);
    }

    #[test]
    fn hjorth_pure_sine_matches_theory() {
        // For a sampled sine at frequency f, mobility ≈ 2*sin(pi*f/fs) and
        // complexity ≈ 1 (a sine is maximally "simple").
        let fs = 256.0;
        let f = 10.0;
        let n = 2560;
        let signal: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * f * i as f64 / fs).sin() as f32)
            .collect();
        let h = hjorth(&signal);
        let expected_mobility = 2.0 * (PI * f / fs).sin();
        assert!((h.activity - 0.5).abs() < 0.01, "activity {}", h.activity);
        assert!(
            (h.mobility - expected_mobility).abs() / expected_mobility < 0.01,
            "mobility {} vs {}",
            h.mobility,
            expected_mobility
        );
        assert!(
            (h.complexity - 1.0).abs() < 0.02,
            "complexity {}",
            h.complexity
        );
    }

    #[test]
    fn hjorth_degenerate_inputs_are_safe() {
        assert_eq!(
            hjorth(&[]),
            Hjorth {
                activity: 0.0,
                mobility: 0.0,
                complexity: 0.0
            }
        );
        assert_eq!(
            hjorth(&[1.0, 2.0]),
            Hjorth {
                activity: 0.0,
                mobility: 0.0,
                complexity: 0.0
            }
        );
        let flat = hjorth(&[2.0; 100]);
        assert_eq!(flat.activity, 0.0);
        assert_eq!(flat.mobility, 0.0);
        assert_eq!(flat.complexity, 0.0);
    }
}
