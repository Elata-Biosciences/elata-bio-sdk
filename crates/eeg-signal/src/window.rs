//! Windowing functions for FFT preprocessing

use std::f32::consts::PI;

/// Windowing functions
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Window {
    /// No windowing (rectangular)
    Rectangular,
    /// Hann window (good general purpose)
    Hann,
    /// Hamming window (good for frequency analysis)
    Hamming,
    /// Blackman window (excellent frequency resolution)
    Blackman,
}

impl Window {
    /// Compute window coefficient for a given index
    pub fn coefficient(&self, i: usize, n: usize) -> f32 {
        let n = n as f32;
        let i = i as f32;

        match self {
            Window::Rectangular => 1.0,
            Window::Hann => 0.5 * (1.0 - (2.0 * PI * i / (n - 1.0)).cos()),
            Window::Hamming => 0.54 - 0.46 * (2.0 * PI * i / (n - 1.0)).cos(),
            Window::Blackman => {
                0.42 - 0.5 * (2.0 * PI * i / (n - 1.0)).cos()
                    + 0.08 * (4.0 * PI * i / (n - 1.0)).cos()
            }
        }
    }

    /// Generate window coefficients for a given length
    pub fn coefficients(&self, n: usize) -> Vec<f32> {
        (0..n).map(|i| self.coefficient(i, n)).collect()
    }
}

/// Apply a window function to a signal (in-place)
pub fn apply_window(signal: &mut [f32], window: Window) {
    let n = signal.len();
    for (i, sample) in signal.iter_mut().enumerate() {
        *sample *= window.coefficient(i, n);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hann_window() {
        let coeffs = Window::Hann.coefficients(5);
        // Hann window should be 0 at edges, 1 at center
        assert!((coeffs[0] - 0.0).abs() < 1e-6);
        assert!((coeffs[2] - 1.0).abs() < 1e-6);
        assert!((coeffs[4] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_apply_window() {
        let mut signal = vec![1.0, 1.0, 1.0, 1.0, 1.0];
        apply_window(&mut signal, Window::Hann);
        assert!((signal[0] - 0.0).abs() < 1e-6);
        assert!((signal[2] - 1.0).abs() < 1e-6);
    }
}
