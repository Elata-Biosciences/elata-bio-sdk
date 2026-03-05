use rustfft::{num_complex::Complex, FftPlanner};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct HarmonicCheckResult {
    pub cepstrum_bpm: Option<f32>,
    pub harmonic_sum_bpm: Option<f32>,
    pub raw_psd_peak_bpm: Option<f32>,
}

/// Analyze a PPG window and return cepstrum, harmonic-sum and raw-PSD peak estimates (BPM).
/// - samples: raw PPG samples (preferably few seconds long, e.g., 8–12s)
/// - fs: sampling rate in Hz
pub fn harmonic_probability_check(samples: &[f32], fs: f32) -> HarmonicCheckResult {
    let n = samples.len();
    if n < 8 {
        return HarmonicCheckResult {
            cepstrum_bpm: None,
            harmonic_sum_bpm: None,
            raw_psd_peak_bpm: None,
        };
    }

    // FFT length (power of two >= 1024 for decent resolution, but not smaller than n)
    let mut nfft = 1024usize;
    while nfft < n {
        nfft *= 2;
    }

    // Hamming window + zero-pad
    let mut buf: Vec<Complex<f32>> = vec![Complex::new(0.0, 0.0); nfft];
    for i in 0..n {
        let w = 0.54 - 0.46 * ((2.0 * std::f32::consts::PI * i as f32) / (n as f32 - 1.0)).cos();
        buf[i].re = samples[i] * w;
    }

    // forward fft
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(nfft);
    fft.process(&mut buf);

    let pos_len = nfft / 2 + 1;
    let mut psd_pos: Vec<f32> = Vec::with_capacity(pos_len);
    for k in 0..pos_len {
        let c = buf[k];
        psd_pos.push((c.norm_sqr()) / (n as f32));
    }

    // frequency vector
    let freqs: Vec<f32> = (0..pos_len)
        .map(|k| (k as f32) * fs / (nfft as f32))
        .collect();

    // Raw PSD peak in physiologic range 0.7 - 3.5 Hz
    let (raw_peak_bpm, min_idx, max_idx) = {
        let min_idx = freqs.iter().position(|&f| f >= 0.7).unwrap_or(0);
        let max_idx = freqs.iter().position(|&f| f > 3.5).unwrap_or(pos_len - 1);
        let mut best = min_idx;
        for i in min_idx..=max_idx {
            if psd_pos[i] > psd_pos[best] {
                best = i;
            }
        }
        (Some(freqs[best] * 60.0), min_idx, max_idx)
    };

    // Cepstrum: log-PSD (symmetrize to full-length) -> inverse FFT
    let eps = 1e-10_f32;
    let mut psd_full: Vec<f32> = vec![0.0; nfft];
    for k in 0..nfft {
        let idx = if k <= nfft / 2 { k } else { nfft - k };
        psd_full[k] = psd_pos[idx];
    }

    let mut log_spec: Vec<Complex<f32>> = psd_full
        .iter()
        .map(|&p| Complex {
            re: (p + eps).ln(),
            im: 0.0,
        })
        .collect();
    let ifft = planner.plan_fft_inverse(nfft);
    ifft.process(&mut log_spec);
    let cepstrum: Vec<f32> = log_spec.iter().map(|c| c.re.abs()).collect();

    // quefrency index range in samples: 60/200..60/40 seconds -> times fs
    let min_q = ((60.0 / 200.0) * fs).max(1.0) as usize;
    let max_q = (((60.0 / 40.0) * fs).min((nfft / 2 - 1) as f32)) as usize;
    let cepstrum_bpm = if max_q > min_q {
        let mut best = min_q;
        for i in min_q..=max_q {
            if cepstrum[i] > cepstrum[best] {
                best = i;
            }
        }
        // period in samples = best -> period_seconds = best / fs -> bpm = 60 / period_seconds = 60 * fs / best
        Some(60.0 * fs / (best as f32))
    } else {
        None
    };

    // Harmonic sum: add contributions from k=2,3 (downsampled PSD alignment)
    let mut h_sum = psd_pos.clone();
    for k in 2..=3 {
        for i in 0..pos_len {
            let j = i * k;
            if j < pos_len {
                h_sum[i] += psd_pos[j] / (k as f32);
            }
        }
    }

    let mut best = min_idx;
    for i in min_idx..=max_idx {
        if h_sum[i] > h_sum[best] {
            best = i;
        }
    }
    let harmonic_sum_bpm = Some(freqs[best] * 60.0);

    HarmonicCheckResult {
        cepstrum_bpm,
        harmonic_sum_bpm,
        raw_psd_peak_bpm: raw_peak_bpm,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn python_like_synthetic_test() {
        let fs = 30.0_f32;
        let tlen = (10.0 * fs) as usize;
        let mut samples: Vec<f32> = Vec::with_capacity(tlen);
        for i in 0..tlen {
            let t = i as f32 / fs;
            let true_pulse = (2.0 * std::f32::consts::PI * 1.16 * t).sin();
            let motion_noise = 0.8 * (2.0 * std::f32::consts::PI * 2.32 * t + 0.5).sin();
            // deterministic small noise
            let noise = 0.02 * ((i % 7) as f32 / 7.0);
            samples.push(true_pulse + motion_noise + noise);
        }

        let res = harmonic_probability_check(&samples, fs);
        // Cepstrum should prefer the true fundamental ~70 BPM
        let cep = res.cepstrum_bpm.unwrap();
        // (raw PSD peak may be dominated by strong motion harmonic depending on exact windowing/phase)
        assert!((cep - 70.0).abs() < 8.0, "cepstrum {} not near 70", cep);
        // harmonic sum should prefer the true fundamental too
        let hs = res.harmonic_sum_bpm.unwrap();
        assert!((hs - 70.0).abs() < 8.0, "harmonic sum {} not near 70", hs);
    }
}
