// rPPG DSP building blocks: filtering, temporal normalization, HR estimation helpers.

use std::f32::consts::PI;

/// Simple temporal normalization: subtract DC and scale by mean absolute.
pub fn temporal_normalize(samples: &[f32]) -> Vec<f32> {
    let mut out = Vec::with_capacity(samples.len());
    temporal_normalize_into(samples, &mut out);
    out
}

pub fn temporal_normalize_into(samples: &[f32], out: &mut Vec<f32>) {
    out.clear();
    if samples.is_empty() {
        return;
    }
    let n = samples.len() as f32;
    let mean: f32 = samples.iter().sum::<f32>() / n;
    let mean_abs: f32 = samples.iter().map(|x| x.abs()).sum::<f32>() / n;
    let denom = if mean_abs.abs() < 1e-8 { 1.0 } else { mean_abs };
    out.reserve(samples.len());
    for &x in samples {
        out.push((x - mean) / denom);
    }
}

/// A second-order IIR bandpass filter (RBJ biquad implementation).
/// FIR bandpass implemented with a windowed sinc design (Hamming).
#[derive(Clone, Copy, Debug)]
pub struct BandpassFilter {
    sections: [Biquad; 4],
}

impl BandpassFilter {
    pub fn new(low_hz: f32, high_hz: f32, sample_rate: f32) -> Self {
        let q = 0.707;
        let hp1 = Biquad::highpass(low_hz.max(0.01), q, sample_rate);
        let hp2 = Biquad::highpass(low_hz.max(0.01), q, sample_rate);
        let lp1 = Biquad::lowpass(high_hz.min(sample_rate * 0.45), q, sample_rate);
        let lp2 = Biquad::lowpass(high_hz.min(sample_rate * 0.45), q, sample_rate);
        Self {
            sections: [hp1, hp2, lp1, lp2],
        }
    }

    pub fn process(&mut self, x: f32) -> f32 {
        let mut y = x;
        for s in self.sections.iter_mut() {
            y = s.process(y);
        }
        y
    }

    /// Filter an entire signal using linear convolution (returns output with same length)
    pub fn filter(&self, input: &[f32]) -> Vec<f32> {
        let mut out = Vec::with_capacity(input.len());
        self.filter_into(input, &mut out);
        out
    }

    pub fn filter_into(&self, input: &[f32], out: &mut Vec<f32>) {
        out.clear();
        out.reserve(input.len());
        let mut s1 = self.sections[0];
        let mut s2 = self.sections[1];
        let mut s3 = self.sections[2];
        let mut s4 = self.sections[3];
        for &x in input {
            let y = s4.process(s3.process(s2.process(s1.process(x))));
            out.push(y);
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1: f32,
    z2: f32,
}

impl Biquad {
    fn lowpass(f0: f32, q: f32, fs: f32) -> Self {
        let w0 = 2.0 * PI * f0 / fs;
        let alpha = w0.sin() / (2.0 * q);
        let cos_w0 = w0.cos();
        let b0 = (1.0 - cos_w0) * 0.5;
        let b1 = 1.0 - cos_w0;
        let b2 = (1.0 - cos_w0) * 0.5;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_w0;
        let a2 = 1.0 - alpha;
        let b0 = b0 / a0;
        let b1 = b1 / a0;
        let b2 = b2 / a0;
        let a1 = a1 / a0;
        let a2 = a2 / a0;
        Self {
            b0,
            b1,
            b2,
            a1,
            a2,
            z1: 0.0,
            z2: 0.0,
        }
    }

    fn highpass(f0: f32, q: f32, fs: f32) -> Self {
        let w0 = 2.0 * PI * f0 / fs;
        let alpha = w0.sin() / (2.0 * q);
        let cos_w0 = w0.cos();
        let b0 = (1.0 + cos_w0) * 0.5;
        let b1 = -(1.0 + cos_w0);
        let b2 = (1.0 + cos_w0) * 0.5;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_w0;
        let a2 = 1.0 - alpha;
        let b0 = b0 / a0;
        let b1 = b1 / a0;
        let b2 = b2 / a0;
        let a1 = a1 / a0;
        let a2 = a2 / a0;
        Self {
            b0,
            b1,
            b2,
            a1,
            a2,
            z1: 0.0,
            z2: 0.0,
        }
    }

    fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }
}

pub fn signal_quality_index(filtered: &[f32], norm: &[f32]) -> f32 {
    // SQI = band_energy / total_energy (clamped 0..1)
    if filtered.is_empty() || norm.is_empty() {
        return 0.0;
    }
    let band_energy: f32 = filtered.iter().map(|x| x * x).sum::<f32>();
    let total_energy: f32 = norm.iter().map(|x| x * x).sum::<f32>();
    if total_energy.abs() < 1e-12 {
        return 0.0;
    }
    (band_energy / total_energy).min(1.0)
}

/// Autocorrelation-based HR estimator. Returns (freq_hz, score) where score is normalized autocorr peak.
pub fn autocorr_peak_freq(
    samples: &[f32],
    sample_rate: f32,
    fmin: f32,
    fmax: f32,
) -> Option<(f32, f32)> {
    if samples.len() < 8 {
        return None;
    }
    let min_lag = (sample_rate / fmax).floor() as usize;
    let max_lag = (sample_rate / fmin).ceil() as usize;
    if max_lag <= min_lag || max_lag >= samples.len() {
        return None;
    }

    // mean-normalized
    let mean = samples.iter().sum::<f32>() / (samples.len() as f32);
    let s: Vec<f32> = samples.iter().map(|x| x - mean).collect();

    // compute autocorrelation for lags in range
    let mut best_lag = 0usize;
    let mut best_val = -1.0_f32;
    for lag in min_lag..=max_lag {
        let mut num = 0.0_f32;
        let mut den = 0.0_f32;
        for i in 0..(s.len() - lag) {
            num += s[i] * s[i + lag];
            den += s[i] * s[i] + s[i + lag] * s[i + lag];
        }
        if den.abs() < 1e-12 {
            continue;
        }
        let corr = 2.0 * num / den; // normalized roughly between -1 and 1
        if corr > best_val {
            best_val = corr;
            best_lag = lag;
        }
    }
    if best_val <= 0.0 {
        return None;
    }
    let freq = sample_rate / (best_lag as f32);
    Some((freq, best_val.min(1.0)))
}

/// Periodogram-based peak finder with Hann windowing and parabolic interpolation.
/// Returns (frequency_hz, peak_power, powers_vector, fmin, df)
pub fn periodogram_peak_freq(
    samples: &[f32],
    sample_rate: f32,
    fmin: f32,
    fmax: f32,
    df: f32,
) -> Option<(f32, f32, Vec<f32>, f32, f32)> {
    if samples.len() < 8 {
        return None;
    }
    let n = samples.len();
    let ns = n as f32;
    // mean-normalize
    let mean = samples.iter().sum::<f32>() / ns;
    let mut x: Vec<f32> = samples.iter().map(|v| v - mean).collect();
    // Hann window
    for i in 0..n {
        let w = 0.5 * (1.0 - ((2.0 * PI * i as f32) / (ns - 1.0)).cos());
        x[i] *= w as f32;
    }

    let mut powers = Vec::new();
    let mut best_idx: isize = -1;
    let mut best_p = 0.0_f32;
    for k in 0..(((fmax - fmin) / df) as usize + 1) {
        let f = fmin + k as f32 * df;
        let mut re = 0.0_f32;
        let mut im = 0.0_f32;
        for (i, &v) in x.iter().enumerate() {
            let t = i as f32 / sample_rate;
            let ang = 2.0 * PI * f * t;
            re += v * ang.cos();
            im += v * ang.sin();
        }
        let pwr = (re * re + im * im) / ns;
        powers.push(pwr);
        if pwr > best_p {
            best_p = pwr;
            best_idx = k as isize;
        }
    }
    if best_idx < 0 {
        return None;
    }
    // parabolic interpolation
    let mut best_f = fmin + best_idx as f32 * df;
    if (best_idx as usize) > 0 && (best_idx as usize) + 1 < powers.len() {
        let p_m = powers[(best_idx as usize) - 1];
        let p_0 = powers[best_idx as usize];
        let p_p = powers[(best_idx as usize) + 1];
        let denom = p_m - 2.0 * p_0 + p_p;
        if denom.abs() > 1e-12 {
            let delta = 0.5 * (p_m - p_p) / denom;
            best_f += delta * df;
        }
    }
    Some((best_f, best_p, powers, fmin, df))
}

/// Welch-style periodogram: split into overlapping segments, average spectra.
pub fn welch_periodogram_peak_freq(
    samples: &[f32],
    sample_rate: f32,
    fmin: f32,
    fmax: f32,
    df: f32,
    segment_len: usize,
    overlap: f32,
) -> Option<(f32, f32, Vec<f32>, f32, f32)> {
    if samples.len() < 8 {
        return None;
    }
    let n = samples.len();
    let seg_len = segment_len.min(n);
    if seg_len < 8 {
        return None;
    }
    let step = ((seg_len as f32) * (1.0 - overlap)).round() as usize;
    let step = step.max(1);

    let mut acc: Vec<f32> = Vec::new();
    let mut count = 0usize;
    let mut start = 0usize;
    while start + seg_len <= n {
        let seg = &samples[start..(start + seg_len)];
        if let Some((_pf, _pp, powers, _fmin, _df)) =
            periodogram_peak_freq(seg, sample_rate, fmin, fmax, df)
        {
            if acc.is_empty() {
                acc = vec![0.0_f32; powers.len()];
            }
            for i in 0..powers.len() {
                acc[i] += powers[i];
            }
            count += 1;
        }
        start += step;
    }
    if count == 0 {
        return None;
    }
    for v in acc.iter_mut() {
        *v /= count as f32;
    }

    // find peak
    let mut best_idx = 0usize;
    let mut best_p = -1.0_f32;
    for (i, &p) in acc.iter().enumerate() {
        if p > best_p {
            best_p = p;
            best_idx = i;
        }
    }
    let best_f = fmin + best_idx as f32 * df;
    Some((best_f, best_p, acc, fmin, df))
}

/// Prior over plausible BPM ranges to resolve harmonic ambiguity.
#[derive(Debug, Clone, Copy)]
pub struct HarmonicPrior {
    pub min_bpm: f32,
    pub max_bpm: f32,
    pub floor: f32,
}

impl HarmonicPrior {
    pub fn new(min_bpm: f32, max_bpm: f32) -> Self {
        let min = min_bpm.min(max_bpm);
        let max = min_bpm.max(max_bpm);
        Self {
            min_bpm: min,
            max_bpm: max,
            floor: 0.05,
        }
    }

    pub fn probability(&self, bpm: f32) -> f32 {
        if bpm <= 0.0 {
            return 0.0;
        }
        let center = (self.min_bpm + self.max_bpm) * 0.5;
        let span = (self.max_bpm - self.min_bpm).max(1.0);
        let sigma = span / 4.0; // ~95% mass inside [min,max]
        let z = (bpm - center) / sigma;
        let p = (-0.5 * z * z).exp();
        if p < self.floor {
            self.floor
        } else {
            p
        }
    }
}

impl Default for HarmonicPrior {
    fn default() -> Self {
        Self::new(55.0, 150.0)
    }
}

/// Compute a cepstrum-based fundamental estimate and a confidence score from a power vector.
/// - `powers`: power spectrum samples (PSD) sampled at f = fmin + k*df
/// - returns (freq_hz, confidence 0..1) or None if insufficient data
pub fn cepstrum_from_powers(
    powers: &[f32],
    _fmin: f32,
    df: f32,
    _fmax: f32,
    _sample_rate: f32,
) -> Option<(f32, f32)> {
    if powers.len() < 8 {
        return None;
    }
    let m = powers.len();
    let eps = 1e-12_f32;
    // log-spectrum
    let log_spec: Vec<f32> = powers.iter().map(|&p| (p + eps).ln()).collect();
    // pad / use length M for IDFT
    let m_f = m as f32;
    // inverse DFT (real) -> cepstrum (we compute only real part)
    let mut cep: Vec<f32> = vec![0.0_f32; m];
    for n in 0..m {
        let mut sum = 0.0_f32;
        for k in 0..m {
            let angle = 2.0 * PI * (k as f32) * (n as f32) / m_f;
            sum += log_spec[k] * angle.cos();
        }
        cep[n] = sum / m_f;
    }

    // quefrency (seconds) per index = 1 / (M * df)
    let qdt = 1.0_f32 / (m_f * df);
    let min_period = 60.0 / 200.0; // s
    let max_period = 60.0 / 30.0; // s
    let min_idx = ((min_period / qdt).ceil() as usize).max(1);
    let max_idx = ((max_period / qdt).floor() as usize).min(m - 1);
    if max_idx <= min_idx {
        return None;
    }

    // find peak in cepstrum in valid range
    let mut best = min_idx;
    for i in min_idx..=max_idx {
        if cep[i] > cep[best] {
            best = i;
        }
    }
    let best_quef = best as f32 * qdt;
    let freq_hz = 1.0 / best_quef;

    // confidence: peak relative to median in valid window
    let mut window: Vec<f32> = cep[min_idx..=max_idx].to_vec();
    window.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median = window[window.len() / 2];
    let peak = cep[best];
    let confidence = if peak <= median {
        0.0
    } else {
        ((peak - median) / (peak.max(1e-6))).min(1.0)
    };

    Some((freq_hz, confidence))
}

pub fn power_at_freq(powers: &[f32], fmin: f32, df: f32, freq: f32) -> Option<f32> {
    if freq < fmin {
        return None;
    }
    let idx = ((freq - fmin) / df).round() as isize;
    if idx < 0 || (idx as usize) >= powers.len() {
        return None;
    }
    Some(powers[idx as usize])
}

/// Select the most likely harmonic using spectral evidence and a BPM prior.
///
/// Improvements:
/// - Generate candidate fundamentals from local PSD peaks and their harmonics/subharmonics.
/// - Compute a harmonic-sum evidence term that aggregates PSD energy at integer harmonics.
/// - Add lightweight SNR and peak-width heuristics to prefer narrow, harmonic-supported fundamentals.
/// - Combine evidence with the prior probability to rank candidates.
pub fn select_harmonic_with_prior(
    powers: &[f32],
    fmin: f32,
    df: f32,
    fmax: f32,
    sample_rate: f32,
    prior: HarmonicPrior,
) -> Option<f32> {
    if powers.len() < 3 {
        return None;
    }

    // Get ranked candidates
    let candidates = rank_harmonic_candidates(powers, fmin, df, fmax, sample_rate, prior, 6);
    if candidates.is_empty() {
        return None;
    }

    // pick the highest-scoring candidate as a baseline
    let top_score = candidates[0].1;
    let mut best_freq = candidates[0].0;
    let best_support = harmonic_support_for(powers, fmin, df, fmax, sample_rate, best_freq, 6);
    // prefer a higher-frequency candidate if it's the true fundamental disguised by a strong octave
    const OCTAVE_RATIO: f32 = 2.0;
    const OCTAVE_TOLERANCE: f32 = 0.2; // allow ±10% slop
    const SCORE_RATIO_THRESHOLD: f32 = 0.55;
    const SUPPORT_RATIO_THRESHOLD: f32 = 1.1;
    for &(cand, score) in candidates.iter().skip(1) {
        if cand <= best_freq {
            continue;
        }
        let ratio = cand / best_freq;
        if (ratio - OCTAVE_RATIO).abs() > OCTAVE_TOLERANCE {
            continue;
        }
        let cand_support = harmonic_support_for(powers, fmin, df, fmax, sample_rate, cand, 6);
        let support_ratio = if best_support.abs() < 1e-6 {
            1.0
        } else {
            cand_support / best_support
        };
        let score_ratio = score / top_score.max(1e-6);
        if score_ratio >= SCORE_RATIO_THRESHOLD && support_ratio >= SUPPORT_RATIO_THRESHOLD {
            best_freq = cand;
            break;
        }
    }
    let best_peak = power_at_freq(powers, fmin, df, best_freq).unwrap_or(0.0);
    let total_power: f32 = powers.iter().sum();

    // If the top choice looks like a harmonic of a lower candidate, prefer the lower
    // when it has reasonable harmonic support and a non-trivial direct peak.
    const SUBHARMONIC_TOLERANCE: f32 = 0.15; // +/-15%
    const LOWER_PEAK_RATIO: f32 = 0.18;
    const LOWER_SUPPORT_MIN: f32 = 0.10;
    const SUPPORT_RATIO_MAX: f32 = 1.25;
    let best_support = harmonic_support_for(powers, fmin, df, fmax, sample_rate, best_freq, 6);
    for &(cand, _score) in candidates.iter() {
        if cand >= best_freq {
            continue;
        }
        let ratio = best_freq / cand;
        if (ratio - 2.0).abs() > SUBHARMONIC_TOLERANCE
            && (ratio - 3.0).abs() > SUBHARMONIC_TOLERANCE
        {
            continue;
        }
        let lower_peak = power_at_freq(powers, fmin, df, cand).unwrap_or(0.0);
        let lower_support = harmonic_support_for(powers, fmin, df, fmax, sample_rate, cand, 6);
        let support_ratio = if lower_support.abs() < 1e-6 {
            f32::INFINITY
        } else {
            best_support / lower_support
        };
        let lower_bpm = cand * 60.0;
        let prior_ok = prior.probability(lower_bpm) > (prior.floor + 1e-6);
        if prior_ok
            && lower_support >= LOWER_SUPPORT_MIN
            && lower_peak >= best_peak * LOWER_PEAK_RATIO
            && support_ratio <= SUPPORT_RATIO_MAX
        {
            return Some(cand);
        }
    }

    // post-hoc tie-break: if a non-best candidate has harmonic support and explains a
    // reasonable fraction of the strongest peak (and has a modest direct peak), prefer it.
    for (cand, _score) in candidates.iter() {
        // compute harmonic-sum and support count for this candidate
        let mut harmonic_sum = 0.0_f32;
        const HMAX: usize = 6;
        let weights: [f32; HMAX] = [1.0, 0.8, 0.6, 0.4, 0.3, 0.2];
        for h in 1..=HMAX {
            let fh = cand * (h as f32);
            if fh > fmax {
                break;
            }
            if let Some(p) = power_at_freq(powers, fmin, df, fh) {
                harmonic_sum += p * weights[(h - 1) as usize];
            }
        }
        // support count
        let mut support = 0usize;
        for h in 2..=6 {
            let fh = cand * (h as f32);
            if fh > fmax {
                break;
            }
            if let Some(p) = power_at_freq(powers, fmin, df, fh) {
                if p > (total_power / powers.len() as f32) * 1.2 {
                    support += 1;
                }
            }
        }
        let peak_power = power_at_freq(powers, fmin, df, *cand).unwrap_or(0.0);
        let explains_peak = harmonic_sum >= best_peak * 0.20;
        let harmonic_ratio = if total_power > 0.0 {
            harmonic_sum / total_power
        } else {
            0.0
        };
        let has_peak = peak_power >= best_peak * 0.20;
        if support > 0 && has_peak && (explains_peak || harmonic_ratio > 0.12) {
            return Some(*cand);
        }
    }

    Some(best_freq)
}

/// Rank harmonic candidates and return up to `max_candidates` of (freq_hz, score)
pub fn rank_harmonic_candidates(
    powers: &[f32],
    fmin: f32,
    df: f32,
    fmax: f32,
    sample_rate: f32,
    prior: HarmonicPrior,
    max_candidates: usize,
) -> Vec<(f32, f32)> {
    if powers.len() < 3 {
        return Vec::new();
    }

    // find local peaks
    let mut peaks: Vec<(usize, f32)> = Vec::new();
    for i in 1..(powers.len() - 1) {
        if powers[i] > powers[i - 1] && powers[i] > powers[i + 1] {
            peaks.push((i, powers[i]));
        }
    }
    if peaks.is_empty() {
        return Vec::new();
    }

    peaks.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    let mut candidates = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let max_peaks = 6usize;
    for (idx, _p) in peaks.into_iter().take(max_peaks) {
        let f_peak = fmin + idx as f32 * df;
        for k in 1..=3 {
            let f = f_peak / (k as f32);
            if f < fmin || f > fmax {
                continue;
            }
            let f_idx = ((f - fmin) / df).round() as isize;
            if f_idx >= 0 && seen.insert(f_idx as usize) {
                candidates.push(fmin + f_idx as f32 * df);
            }
        }
        for k in 2..=4 {
            let f = f_peak * (k as f32);
            if f < fmin || f > fmax {
                continue;
            }
            let f_idx = ((f - fmin) / df).round() as isize;
            if f_idx >= 0 && seen.insert(f_idx as usize) {
                candidates.push(fmin + f_idx as f32 * df);
            }
        }
    }

    // baseline stats
    let mut tmp = powers.to_vec();
    tmp.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median_power = tmp[tmp.len() / 2];
    let noise_floor = median_power + 1e-12;

    #[derive(Clone)]
    struct C {
        freq: f32,
        score: f32,
    }
    let mut infos: Vec<C> = Vec::new();

    for cand in candidates {
        // harmonic-sum
        let mut harmonic_sum = 0.0_f32;
        const HMAX: usize = 6;
        let weights: [f32; HMAX] = [1.0, 0.8, 0.6, 0.4, 0.3, 0.2];
        for h in 1..=HMAX {
            let fh = cand * (h as f32);
            if fh > fmax {
                break;
            }
            if let Some(p) = power_at_freq(powers, fmin, df, fh) {
                harmonic_sum += p * weights[(h - 1) as usize];
            }
        }
        let peak_power = power_at_freq(powers, fmin, df, cand).unwrap_or(0.0);
        let snr = peak_power / noise_floor;
        // width heuristic
        let idx = ((cand - fmin) / df).round() as isize;
        let mut width_bins = 0usize;
        if idx >= 0 {
            let idx = idx as isize as usize;
            let thresh = peak_power * 0.5;
            let mut i = idx as isize;
            while i > 0 {
                if powers[i as usize] >= thresh {
                    width_bins += 1;
                    i -= 1
                } else {
                    break;
                }
            }
            let mut i = idx as isize + 1;
            while i < powers.len() as isize {
                if powers[i as usize] >= thresh {
                    width_bins += 1;
                    i += 1
                } else {
                    break;
                }
            }
        }
        let width_score = 1.0 / (1.0 + width_bins as f32);
        let mut evidence = harmonic_sum;
        evidence *= 1.0 + 0.5 * (snr - 1.0).max(0.0);
        evidence *= width_score;
        // harmonic support count
        let mut support = 0usize;
        for h in 2..=6 {
            let fh = cand * (h as f32);
            if fh > fmax {
                break;
            }
            if let Some(p) = power_at_freq(powers, fmin, df, fh) {
                if p > noise_floor * 1.2 {
                    support += 1
                }
            }
        }
        evidence *= 1.0 + 0.6 * (support as f32);
        // cepstrum boost — strong preference when cepstrum confidence is high
        if let Some((cep_f, cep_c)) = cepstrum_from_powers(powers, fmin, df, fmax, sample_rate) {
            let diff = (cep_f - cand).abs();
            if diff < 0.10 {
                // high-confidence cepstrum should dominate (fast overriding validator)
                if cep_c >= 0.8 {
                    evidence *= 1.0 + 3.0 * cep_c; // strong boost
                } else {
                    evidence *= 1.0 + 1.2 * cep_c; // modest boost
                }
            }
        }
        let bpm = cand * 60.0;
        let score = evidence * prior.probability(bpm);
        infos.push(C { freq: cand, score });
    }

    infos.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
    infos
        .iter()
        .take(max_candidates.min(infos.len()))
        .map(|c| (c.freq, c.score))
        .collect()
}

/// Compute harmonic support for a given cepstrum-derived frequency (Hz) using the
/// ranked PSD candidates. Returns a non-negative support score (higher is better).
pub fn harmonic_support_for(
    powers: &[f32],
    fmin: f32,
    df: f32,
    fmax: f32,
    sample_rate: f32,
    cep_hz: f32,
    top_n: usize,
) -> f32 {
    let cands = rank_harmonic_candidates(
        powers,
        fmin,
        df,
        fmax,
        sample_rate,
        HarmonicPrior::default(),
        top_n,
    );
    let mut support = 0.0_f32;
    for (f_cand, score) in cands.iter() {
        let rel = (f_cand - cep_hz).abs() / cep_hz.max(1e-6);
        if rel < 0.08 {
            support += *score;
        }
        let rel_sub = (f_cand - (cep_hz * 0.5)).abs() / (cep_hz * 0.5).max(1e-6);
        let rel_h = (f_cand - (cep_hz * 2.0)).abs() / (cep_hz * 2.0).max(1e-6);
        if rel_sub < 0.08 || rel_h < 0.08 {
            support += *score * 0.8;
        }
    }
    support
}

/// Backwards-compatible helper: select a harmonic using the default prior.
pub fn detect_fundamental_from_powers(
    powers: &[f32],
    fmin: f32,
    df: f32,
    fmax: f32,
    sample_rate: f32,
) -> Option<f32> {
    select_harmonic_with_prior(
        powers,
        fmin,
        df,
        fmax,
        sample_rate,
        HarmonicPrior::default(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn temporal_normalize_removes_dc() {
        let fs = 100.0_f32;
        let duration = 2.0_f32;
        let n = (fs * duration) as usize;
        // DC offset + small sine at 1.5Hz
        let offset = 1.0_f32;
        let amp = 0.2_f32;
        let freq = 1.5_f32;
        let mut sig = Vec::with_capacity(n);
        for i in 0..n {
            let t = i as f32 / fs;
            sig.push(offset + amp * (2.0 * PI * freq * t).sin());
        }
        let norm = temporal_normalize(&sig);
        let mean: f32 = norm.iter().sum::<f32>() / (n as f32);
        let rms: f32 = (norm.iter().map(|x| x * x).sum::<f32>() / (n as f32)).sqrt();
        assert!(mean.abs() < 1e-6, "mean not removed: {}", mean);
        assert!(rms > 0.1, "signal vanished after normalization: {}", rms);
    }

    #[test]
    fn temporal_normalize_constant_signal() {
        let v = vec![2.0_f32; 100];
        let norm = temporal_normalize(&v);
        // all zeros after removing DC
        assert!(norm.iter().all(|x| x.abs() < 1e-6));
    }

    #[test]
    fn bandpass_filter_passes_midband_and_rejects_others() {
        let fs = 100.0_f32;
        let duration = 5.0_f32;
        let n = (fs * duration) as usize;
        let low = 0.7_f32;
        let high = 4.0_f32;
        let bp = BandpassFilter::new(low, high, fs);

        let make_sine = |freq: f32| {
            let mut v = Vec::with_capacity(n);
            for i in 0..n {
                let t = i as f32 / fs;
                v.push((2.0 * PI * freq * t).sin());
            }
            v
        };

        let sig_mid = make_sine(1.5);
        let sig_low = make_sine(0.2);
        let sig_high = make_sine(8.0);

        let rms =
            |v: &[f32]| -> f32 { (v.iter().map(|x| x * x).sum::<f32>() / (v.len() as f32)).sqrt() };

        let out_mid: Vec<f32> = bp.filter(&sig_mid);
        // reset filter state and test low
        let bp_low = BandpassFilter::new(low, high, fs);
        let out_low: Vec<f32> = bp_low.filter(&sig_low);
        let bp_high = BandpassFilter::new(low, high, fs);
        let out_high: Vec<f32> = bp_high.filter(&sig_high);

        let rms_mid = rms(&out_mid);
        let rms_low = rms(&out_low);
        let rms_high = rms(&out_high);

        // Expect midband energy to be significantly larger than out-of-band
        assert!(rms_mid > 0.2, "midband too small: {}", rms_mid);
        assert!(rms_low < 0.1, "lowband leaked: {}", rms_low);
        assert!(rms_high < 0.1, "highband leaked: {}", rms_high);
        assert!(
            rms_mid > rms_low * 3.0 && rms_mid > rms_high * 3.0,
            "mid not sufficiently larger: mid={} low={} high={}",
            rms_mid,
            rms_low,
            rms_high
        );
    }

    #[test]
    fn harmonic_support_detects_matching_candidate() {
        // build a simple sinusoid at 1.66 Hz (~99.6 bpm) and check that harmonic_support is positive
        let fs = 100.0_f32;
        let dur = 5.0_f32;
        let n = (fs * dur) as usize;
        let mut sig = Vec::with_capacity(n);
        for i in 0..n {
            let t = i as f32 / fs;
            sig.push((2.0 * PI * 1.66_f32 * t).sin());
        }
        // compute periodogram powers
        let fmin = 0.7_f32;
        let fmax = 4.0_f32;
        let df = 0.01_f32;
        let (_peak_f, _peak_p, powers, _fmin, _df) =
            periodogram_peak_freq(&sig, fs, fmin, fmax, df).unwrap();
        let support = harmonic_support_for(&powers, fmin, df, fmax, fs, 1.66_f32, 6);
        assert!(support > 0.0, "expected harmonic support > 0",);
    }

    #[test]
    fn sqi_reflects_band_energy() {
        let fs = 100.0_f32;
        let n = 4096; // long signal to avoid FIR startup transients
        let freq = 1.5_f32;
        let mut sig: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * freq * (i as f32 / fs)).sin())
            .collect();
        let norm = temporal_normalize(&sig);
        let bp = BandpassFilter::new(0.7, 4.0, fs);
        let filtered: Vec<f32> = bp.filter(&norm);
        let sqi = signal_quality_index(&filtered, &norm);
        assert!(sqi > 0.2, "sqi too low for clean tone: {}", sqi);

        // add out-of-band noise, sqi should reduce
        for i in 0..n {
            sig[i] += 0.5 * (2.0 * PI * 8.0 * (i as f32 / fs)).sin();
        }
        let norm2 = temporal_normalize(&sig);
        let mut bp2 = BandpassFilter::new(0.7, 4.0, fs);
        let filtered2: Vec<f32> = norm2.iter().map(|&x| bp2.process(x)).collect();
        let sqi2 = signal_quality_index(&filtered2, &norm2);
        assert!(
            sqi2 < sqi,
            "sqi didn't drop with high-frequency noise: {} vs {}",
            sqi2,
            sqi
        );
    }

    #[test]
    fn autocorr_estimates_frequency() {
        let fs = 200.0_f32;
        let freq = 1.8_f32; // 108 bpm
        let n = 400;
        let sig: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * freq * (i as f32 / fs)).sin())
            .collect();
        let res = autocorr_peak_freq(&sig, fs, 0.7, 4.0);
        assert!(res.is_some(), "autocorr returned None");
        let (f_est, score) = res.unwrap();
        assert!(
            (f_est - freq).abs() < 0.05,
            "autocorr freq {} vs {}",
            f_est,
            freq
        );
        assert!(score > 0.5, "low autocorr score: {}", score);
    }

    #[test]
    fn periodogram_interpolation_accuracy() {
        let fs = 200.0_f32;
        let n = 4000;
        let freq = 1.3333_f32; // 80 bpm
        let sig: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * freq * (i as f32 / fs)).sin())
            .collect();
        let res = periodogram_peak_freq(&sig, fs, 0.7, 4.0, 0.02);
        assert!(res.is_some(), "periodogram returned none");
        let (f_est, _p, _powers, _fmin, _df) = res.unwrap();
        assert!(
            (f_est - freq).abs() < 0.02,
            "periodogram interpolation too coarse: {} vs {}",
            f_est,
            freq
        );
    }

    #[test]
    fn harmonic_selection_uses_prior() {
        let fs = 200.0_f32;
        let n = 4000;
        let f0 = 1.2_f32;
        // fundamental weak, second harmonic stronger
        let sig: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f32 / fs;
                0.6 * (2.0 * PI * f0 * t).sin() + 2.0 * (2.0 * PI * 2.0 * f0 * t).sin()
            })
            .collect();
        let (_f_est, _p, powers, fmin, df) =
            periodogram_peak_freq(&sig, fs, 0.7, 4.0, 0.02).unwrap();
        let freq = select_harmonic_with_prior(&powers, fmin, df, 4.0, fs, HarmonicPrior::default())
            .unwrap();
        assert!(
            (freq - 2.0 * f0).abs() < 0.02,
            "expected harmonic to win: {} vs {}",
            freq,
            2.0 * f0
        );

        let tight_prior = HarmonicPrior::new(50.0, 90.0);
        let freq2 = select_harmonic_with_prior(&powers, fmin, df, 4.0, fs, tight_prior).unwrap();
        assert!(
            (freq2 - f0).abs() < 0.02,
            "expected fundamental under low prior: {} vs {}",
            freq2,
            f0
        );
    }

    #[test]
    fn harmonic_selection_prefers_harmonic_support() {
        // Construct signal with fundamental + multiple harmonics where the 2nd harmonic
        // has higher amplitude than the fundamental alone. The harmonic-sum should
        // favor the true fundamental that explains harmonics.
        let fs = 200.0_f32;
        let n = 4000usize;
        let f0 = 1.2_f32;
        let sig: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f32 / fs;
                1.0 * (2.0 * PI * f0 * t).sin()
                    + 1.6 * (2.0 * PI * 2.0 * f0 * t).sin()
                    + 0.9 * (2.0 * PI * 3.0 * f0 * t).sin()
            })
            .collect();
        let (_f_est, _p, powers, fmin, df) =
            periodogram_peak_freq(&sig, fs, 0.7, 4.0, 0.02).unwrap();
        let freq = select_harmonic_with_prior(&powers, fmin, df, 4.0, fs, HarmonicPrior::default())
            .unwrap();
        assert!(
            (freq - f0).abs() < 0.03,
            "expected fundamental to win via harmonic support: {} vs {}",
            freq,
            f0
        );
    }

    #[test]
    fn harmonic_selection_penalizes_broad_peaks() {
        // Broad hump (multiple nearby frequencies) vs narrow harmonic-supported candidate.
        let fs = 200.0_f32;
        let n = 4000usize;
        let f0 = 1.0_f32;
        let sig: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f32 / fs;
                // cluster around 1.5 to create a wide hump
                1.2 * (2.0 * PI * 1.48 * t).sin()
            + 1.2 * (2.0 * PI * 1.50 * t).sin()
            + 1.2 * (2.0 * PI * 1.52 * t).sin()
            // narrow fundamental with harmonic support
            + 0.9 * (2.0 * PI * f0 * t).sin()
            + 0.7 * (2.0 * PI * 2.0 * f0 * t).sin()
            })
            .collect();
        let (_f_est, _p, powers, fmin, df) =
            periodogram_peak_freq(&sig, fs, 0.7, 4.0, 0.02).unwrap();
        let freq = select_harmonic_with_prior(&powers, fmin, df, 4.0, fs, HarmonicPrior::default())
            .unwrap();
        // expect algorithm to prefer harmonic-supported narrow f0 rather than the broad hump near 1.5
        assert!(
            (freq - f0).abs() < 0.05,
            "expected narrow harmonic-supported candidate ({}), got {}",
            f0,
            freq
        );
    }
}
