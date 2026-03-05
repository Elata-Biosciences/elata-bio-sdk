//! FFT implementation using Cooley-Tukey algorithm
//!
//! This is a simple, dependency-free FFT implementation suitable for
//! real-time EEG processing. For production use, consider using a more
//! optimized library like RustFFT.

use std::f32::consts::PI;

/// Complex number for FFT computation
#[derive(Debug, Clone, Copy)]
pub struct Complex {
    pub re: f32,
    pub im: f32,
}

impl Complex {
    pub fn new(re: f32, im: f32) -> Self {
        Self { re, im }
    }

    pub fn from_real(re: f32) -> Self {
        Self { re, im: 0.0 }
    }

    pub fn magnitude(&self) -> f32 {
        (self.re * self.re + self.im * self.im).sqrt()
    }

    pub fn magnitude_squared(&self) -> f32 {
        self.re * self.re + self.im * self.im
    }

    fn add(self, other: Self) -> Self {
        Self {
            re: self.re + other.re,
            im: self.im + other.im,
        }
    }

    fn sub(self, other: Self) -> Self {
        Self {
            re: self.re - other.re,
            im: self.im - other.im,
        }
    }

    fn mul(self, other: Self) -> Self {
        Self {
            re: self.re * other.re - self.im * other.im,
            im: self.re * other.im + self.im * other.re,
        }
    }
}

/// Compute FFT of a real-valued signal
///
/// Input length must be a power of 2. If not, it will be zero-padded.
pub fn fft(signal: &[f32]) -> Vec<Complex> {
    let n = signal.len().next_power_of_two();
    let mut data: Vec<Complex> = signal.iter().map(|&x| Complex::from_real(x)).collect();
    data.resize(n, Complex::new(0.0, 0.0));

    fft_inplace(&mut data);
    data
}

/// In-place FFT using Cooley-Tukey algorithm
fn fft_inplace(data: &mut [Complex]) {
    let n = data.len();
    if n <= 1 {
        return;
    }

    // Bit-reversal permutation
    let mut j = 0;
    for i in 0..n {
        if i < j {
            data.swap(i, j);
        }
        let mut m = n >> 1;
        while m > 0 && j >= m {
            j -= m;
            m >>= 1;
        }
        j += m;
    }

    // Cooley-Tukey iterative FFT
    let mut len = 2;
    while len <= n {
        let half = len / 2;
        let angle_step = -2.0 * PI / len as f32;

        for start in (0..n).step_by(len) {
            let mut angle: f32 = 0.0;
            for k in 0..half {
                let w = Complex::new(angle.cos(), angle.sin());
                let t = w.mul(data[start + k + half]);
                let u = data[start + k];
                data[start + k] = u.add(t);
                data[start + k + half] = u.sub(t);
                angle += angle_step;
            }
        }
        len *= 2;
    }
}

/// Compute frequencies corresponding to FFT bins
pub fn fft_frequencies(n: usize, sample_rate: f32) -> Vec<f32> {
    let freq_resolution = sample_rate / n as f32;
    (0..n / 2 + 1).map(|i| i as f32 * freq_resolution).collect()
}

/// Compute magnitude spectrum from FFT output
pub fn magnitude_spectrum(fft_output: &[Complex]) -> Vec<f32> {
    let n = fft_output.len();
    fft_output[..n / 2 + 1]
        .iter()
        .map(|c| c.magnitude())
        .collect()
}

/// Compute power spectrum (magnitude squared) from FFT output
pub fn power_spectrum(fft_output: &[Complex]) -> Vec<f32> {
    let n = fft_output.len();
    fft_output[..n / 2 + 1]
        .iter()
        .map(|c| c.magnitude_squared())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fft_dc_signal() {
        // Constant signal should have all energy at DC (bin 0)
        let signal = vec![1.0; 8];
        let result = fft(&signal);

        // DC component should be N (sum of all samples)
        assert!((result[0].re - 8.0).abs() < 1e-5);
        assert!(result[0].im.abs() < 1e-5);

        // All other bins should be near zero
        for c in &result[1..] {
            assert!(c.magnitude() < 1e-5);
        }
    }

    #[test]
    fn test_fft_sine_wave() {
        // Sine wave at Nyquist/4 should show peak at bin N/4
        let n = 64;
        let freq = 4.0; // 4 cycles in N samples
        let signal: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * freq * i as f32 / n as f32).sin())
            .collect();

        let result = fft(&signal);
        let magnitudes = magnitude_spectrum(&result);

        // Find the peak (excluding DC)
        let peak_bin = magnitudes[1..]
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .map(|(i, _)| i + 1)
            .unwrap();

        assert_eq!(peak_bin, freq as usize);
    }
}
