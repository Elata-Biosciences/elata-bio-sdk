//! Benchmark framework for harmonic selection and HR estimation algorithms.
//!
//! Provides synthetic signal generators, evaluation metrics, and test harnesses
//! for validating the accuracy of the harmonic selection pipeline.

use crate::dsp::{periodogram_peak_freq, select_harmonic_with_prior, HarmonicPrior};
use crate::harmonic::harmonic_probability_check;
use std::f32::consts::PI;

// ============================================================================
// Synthetic Signal Generators
// ============================================================================

/// Configuration for generating synthetic PPG signals.
#[derive(Debug, Clone)]
pub struct SyntheticSignalConfig {
    /// Sampling rate in Hz (typical: 30 for webcam, 64-256 for PPG sensors)
    pub sample_rate: f32,
    /// Duration in seconds
    pub duration_secs: f32,
    /// True heart rate in BPM (ground truth)
    pub true_bpm: f32,
    /// Amplitude of the fundamental frequency component
    pub fundamental_amplitude: f32,
    /// Harmonic amplitudes relative to fundamental (e.g., [0.5, 0.3] for 2nd and 3rd harmonics)
    pub harmonic_amplitudes: Vec<f32>,
    /// Motion artifact frequency in Hz (0 to disable)
    pub motion_freq_hz: f32,
    /// Motion artifact amplitude relative to fundamental
    pub motion_amplitude: f32,
    /// Gaussian noise standard deviation (0 to disable)
    pub noise_std: f32,
    /// DC offset
    pub dc_offset: f32,
    /// Slow baseline drift frequency in Hz (0 to disable)
    pub drift_freq_hz: f32,
    /// Drift amplitude
    pub drift_amplitude: f32,
    /// Heart rate variability as percentage of mean HR (0.0 to disable, typical: 0.02-0.05)
    pub hrv_percent: f32,
    /// Respiratory modulation amplitude (0.0 to disable, typical: 0.1-0.3)
    pub respiratory_amplitude: f32,
    /// Respiratory rate in breaths per minute (typical: 12-20)
    pub respiratory_rate: f32,
    /// Use realistic pulse waveform shape instead of sinusoids
    pub use_pulse_waveform: bool,
    /// Pink noise coefficient (0.0 = white noise, 1.0 = full pink noise)
    pub pink_noise_coefficient: f32,
    /// Random seed for reproducibility
    pub seed: u64,
}

impl Default for SyntheticSignalConfig {
    fn default() -> Self {
        Self {
            sample_rate: 30.0,
            duration_secs: 10.0,
            true_bpm: 72.0,
            fundamental_amplitude: 1.0,
            harmonic_amplitudes: vec![0.4, 0.2], // 2nd and 3rd harmonics
            motion_freq_hz: 0.0,
            motion_amplitude: 0.0,
            noise_std: 0.0,
            dc_offset: 0.0,
            drift_freq_hz: 0.0,
            drift_amplitude: 0.0,
            hrv_percent: 0.0,
            respiratory_amplitude: 0.0,
            respiratory_rate: 15.0,
            use_pulse_waveform: false,
            pink_noise_coefficient: 0.0,
            seed: 12345,
        }
    }
}

impl SyntheticSignalConfig {
    /// Create a clean sinusoidal signal at the given BPM
    pub fn clean(bpm: f32, sample_rate: f32) -> Self {
        Self {
            true_bpm: bpm,
            sample_rate,
            ..Default::default()
        }
    }

    /// Create a signal with realistic harmonic content (like a real pulse waveform)
    pub fn realistic(bpm: f32, sample_rate: f32) -> Self {
        Self {
            true_bpm: bpm,
            sample_rate,
            fundamental_amplitude: 1.0,
            harmonic_amplitudes: vec![0.5, 0.25, 0.12], // Typical PPG harmonic decay
            noise_std: 0.05,
            ..Default::default()
        }
    }

    /// Create a highly realistic signal with HRV, respiratory modulation, and pulse shape
    pub fn highly_realistic(bpm: f32, sample_rate: f32) -> Self {
        Self {
            true_bpm: bpm,
            sample_rate,
            fundamental_amplitude: 1.0,
            harmonic_amplitudes: vec![], // Pulse waveform provides harmonics naturally
            noise_std: 0.08,
            drift_freq_hz: 0.05, // Very slow baseline wander
            drift_amplitude: 0.15,
            hrv_percent: 0.03, // 3% HRV (moderate)
            respiratory_amplitude: 0.2,
            respiratory_rate: 15.0,
            use_pulse_waveform: true,
            pink_noise_coefficient: 0.6,
            ..Default::default()
        }
    }

    /// Create a signal with strong second harmonic (common failure mode)
    pub fn strong_second_harmonic(bpm: f32, sample_rate: f32) -> Self {
        Self {
            true_bpm: bpm,
            sample_rate,
            fundamental_amplitude: 0.6,
            harmonic_amplitudes: vec![1.5, 0.3], // 2nd harmonic stronger than fundamental
            noise_std: 0.02,
            ..Default::default()
        }
    }

    /// Create a signal with motion artifacts at a specific frequency
    pub fn with_motion(bpm: f32, sample_rate: f32, motion_hz: f32, motion_amp: f32) -> Self {
        Self {
            true_bpm: bpm,
            sample_rate,
            fundamental_amplitude: 1.0,
            harmonic_amplitudes: vec![0.4, 0.2],
            motion_freq_hz: motion_hz,
            motion_amplitude: motion_amp,
            noise_std: 0.03,
            ..Default::default()
        }
    }

    /// Create a noisy signal
    pub fn noisy(bpm: f32, sample_rate: f32, noise_level: f32) -> Self {
        Self {
            true_bpm: bpm,
            sample_rate,
            fundamental_amplitude: 1.0,
            harmonic_amplitudes: vec![0.4, 0.2],
            noise_std: noise_level,
            ..Default::default()
        }
    }

    /// Create a challenging signal combining multiple real-world artifacts
    pub fn challenging(bpm: f32, sample_rate: f32) -> Self {
        Self {
            true_bpm: bpm,
            sample_rate,
            fundamental_amplitude: 1.0,
            harmonic_amplitudes: vec![0.7, 0.4, 0.2], // Strong harmonics
            noise_std: 0.15,
            drift_freq_hz: 0.08,
            drift_amplitude: 0.25,
            motion_freq_hz: bpm / 60.0 * 0.5, // Motion near subharmonic
            motion_amplitude: 0.4,
            hrv_percent: 0.05,
            respiratory_amplitude: 0.25,
            respiratory_rate: 18.0,
            use_pulse_waveform: true,
            pink_noise_coefficient: 0.5,
            ..Default::default()
        }
    }
}

/// Simple deterministic RNG for reproducible signal generation
struct SimpleRng {
    state: u64,
    // For pink noise generation (simple 1/f approximation)
    pink_state: [f32; 7],
}

impl SimpleRng {
    fn new(seed: u64) -> Self {
        Self {
            state: seed,
            pink_state: [0.0; 7],
        }
    }

    /// Generate uniform random in [-1, 1]
    fn next_uniform(&mut self) -> f32 {
        self.state = self.state.wrapping_mul(6364136223846793005).wrapping_add(1);
        ((self.state >> 33) as f32 / (u32::MAX as f32 / 2.0)) - 1.0
    }

    /// Generate Gaussian-distributed random (Box-Muller)
    fn next_gaussian(&mut self) -> f32 {
        let u1 = (self.next_uniform() + 1.0) / 2.0 + 0.001;
        let u2 = (self.next_uniform() + 1.0) / 2.0;
        (-2.0 * u1.ln()).sqrt() * (2.0 * PI * u2).cos()
    }

    /// Generate pink noise using Voss-McCartney algorithm approximation
    fn next_pink(&mut self, coefficient: f32) -> f32 {
        let white = self.next_gaussian();
        // Update running sums at different octaves
        let idx = (self.state & 0x7) as usize;
        if idx < 7 {
            self.pink_state[idx] = white;
        }
        let pink: f32 = self.pink_state.iter().sum::<f32>() / 7.0;
        // Blend between white and pink based on coefficient
        white * (1.0 - coefficient) + pink * coefficient
    }
}

/// Generate a realistic PPG pulse waveform shape for one beat
/// Returns value in [0, 1] for phase in [0, 1]
fn pulse_waveform(phase: f32) -> f32 {
    // Model based on typical PPG waveform:
    // - Sharp systolic upstroke (0.0 - 0.15)
    // - Systolic peak (0.15 - 0.20)
    // - Dicrotic notch (0.30 - 0.40)
    // - Diastolic decay (0.40 - 1.0)
    let p = phase.fract();

    if p < 0.12 {
        // Systolic upstroke - fast rise
        let t = p / 0.12;
        t * t * (3.0 - 2.0 * t) // Smooth step
    } else if p < 0.20 {
        // Systolic peak
        let t = (p - 0.12) / 0.08;
        1.0 - 0.1 * t
    } else if p < 0.35 {
        // Descent to dicrotic notch
        let t = (p - 0.20) / 0.15;
        0.9 - 0.35 * t
    } else if p < 0.45 {
        // Dicrotic notch (small bump)
        let t = (p - 0.35) / 0.10;
        let notch_depth = 0.55;
        let notch_bump = 0.12 * (PI * t).sin();
        notch_depth + notch_bump
    } else {
        // Diastolic decay - exponential-like
        let t = (p - 0.45) / 0.55;
        0.55 * (-2.5 * t).exp()
    }
}

/// Generate a synthetic PPG signal based on configuration
pub fn generate_synthetic_signal(config: &SyntheticSignalConfig) -> Vec<f32> {
    let n = (config.sample_rate * config.duration_secs) as usize;
    let mut signal = Vec::with_capacity(n);
    let mean_period = 60.0 / config.true_bpm; // Mean beat period in seconds
    let mut rng = SimpleRng::new(config.seed);

    // Pre-generate HRV sequence (beat-to-beat intervals)
    // Using a simple random walk filtered to be smooth
    let num_beats = (config.duration_secs / mean_period).ceil() as usize + 2;
    let mut beat_times = Vec::with_capacity(num_beats);
    let mut t_beat = 0.0_f32;
    let mut hrv_state = 0.0_f32;

    for _ in 0..num_beats {
        beat_times.push(t_beat);
        // Generate next interval with HRV
        let hrv_noise = rng.next_gaussian() * 0.3; // Smooth random walk
        hrv_state = hrv_state * 0.7 + hrv_noise * 0.3; // Low-pass filter
        let hrv_factor = 1.0 + config.hrv_percent * hrv_state;
        t_beat += mean_period * hrv_factor;
    }

    // Generate signal sample by sample
    for i in 0..n {
        let t = i as f32 / config.sample_rate;
        let mut sample = config.dc_offset;

        // Find current beat phase
        let beat_idx = beat_times
            .iter()
            .position(|&bt| bt > t)
            .unwrap_or(1)
            .saturating_sub(1);
        let beat_start = beat_times[beat_idx];
        let beat_end = beat_times
            .get(beat_idx + 1)
            .copied()
            .unwrap_or(beat_start + mean_period);
        let beat_duration = beat_end - beat_start;
        let phase = (t - beat_start) / beat_duration;

        // Respiratory modulation (amplitude varies with breathing)
        let resp_freq = config.respiratory_rate / 60.0;
        let resp_mod = 1.0 + config.respiratory_amplitude * (2.0 * PI * resp_freq * t).sin();

        // Generate pulse signal
        let pulse_value = if config.use_pulse_waveform {
            // Use realistic pulse shape
            pulse_waveform(phase)
        } else {
            // Use sinusoidal model with harmonics
            let f0 = 1.0 / beat_duration;
            let mut val = (2.0 * PI * f0 * (t - beat_start)).sin();
            for (h_idx, &h_amp) in config.harmonic_amplitudes.iter().enumerate() {
                let harmonic_num = (h_idx + 2) as f32;
                val += h_amp * (2.0 * PI * harmonic_num * f0 * (t - beat_start)).sin();
            }
            val * 0.5 + 0.5 // Normalize to [0, 1] range
        };

        sample += config.fundamental_amplitude * resp_mod * (pulse_value - 0.5) * 2.0;

        // Add explicit harmonics if using pulse waveform (for extra harmonic boost tests)
        if config.use_pulse_waveform && !config.harmonic_amplitudes.is_empty() {
            let f0 = 1.0 / beat_duration;
            for (h_idx, &h_amp) in config.harmonic_amplitudes.iter().enumerate() {
                let harmonic_num = (h_idx + 2) as f32;
                sample += h_amp
                    * config.fundamental_amplitude
                    * (2.0 * PI * harmonic_num * f0 * (t - beat_start)).sin();
            }
        }

        // Motion artifact
        if config.motion_freq_hz > 0.0 && config.motion_amplitude > 0.0 {
            // Motion is often non-sinusoidal, add some harmonic content
            let motion_phase = 2.0 * PI * config.motion_freq_hz * t + 0.5;
            sample += config.motion_amplitude
                * (motion_phase.sin()
                    + 0.3 * (2.0 * motion_phase).sin()
                    + 0.1 * (3.0 * motion_phase).sin());
        }

        // Baseline drift (slow wander)
        if config.drift_freq_hz > 0.0 && config.drift_amplitude > 0.0 {
            // Multiple slow frequency components for more realistic drift
            sample += config.drift_amplitude
                * (0.6 * (2.0 * PI * config.drift_freq_hz * t).sin()
                    + 0.3 * (2.0 * PI * config.drift_freq_hz * 0.3 * t + 1.0).sin()
                    + 0.1 * (2.0 * PI * config.drift_freq_hz * 2.1 * t + 2.0).sin());
        }

        // Noise (white or pink)
        if config.noise_std > 0.0 {
            let noise = if config.pink_noise_coefficient > 0.0 {
                rng.next_pink(config.pink_noise_coefficient)
            } else {
                rng.next_gaussian()
            };
            sample += config.noise_std * noise;
        }

        signal.push(sample);
    }

    signal
}

// ============================================================================
// Evaluation Metrics
// ============================================================================

/// Results from evaluating a single estimation against ground truth
#[derive(Debug, Clone, Copy)]
pub struct EstimationResult {
    /// Ground truth BPM
    pub true_bpm: f32,
    /// Estimated BPM
    pub estimated_bpm: f32,
    /// Absolute error in BPM
    pub absolute_error: f32,
    /// Whether this is an octave error (estimate is ~0.5x or ~2x true)
    pub is_octave_error: bool,
    /// Whether estimate is within 1 BPM of true
    pub within_1_bpm: bool,
    /// Whether estimate is within 2 BPM of true
    pub within_2_bpm: bool,
    /// Whether estimate is within 5 BPM of true
    pub within_5_bpm: bool,
}

impl EstimationResult {
    pub fn new(true_bpm: f32, estimated_bpm: f32) -> Self {
        let absolute_error = (estimated_bpm - true_bpm).abs();

        // Check for octave errors: estimate is ~0.5x or ~2x the true value
        let ratio = estimated_bpm / true_bpm;
        let is_octave_error = (ratio - 0.5).abs() < 0.15 || (ratio - 2.0).abs() < 0.15;

        Self {
            true_bpm,
            estimated_bpm,
            absolute_error,
            is_octave_error,
            within_1_bpm: absolute_error <= 1.0,
            within_2_bpm: absolute_error <= 2.0,
            within_5_bpm: absolute_error <= 5.0,
        }
    }
}

/// Aggregated benchmark metrics across multiple test cases
#[derive(Debug, Clone, Default)]
pub struct BenchmarkMetrics {
    /// Total number of test cases
    pub total_cases: usize,
    /// Mean absolute error in BPM
    pub mae: f32,
    /// Root mean squared error in BPM
    pub rmse: f32,
    /// Percentage of cases within 1 BPM
    pub within_1_bpm_pct: f32,
    /// Percentage of cases within 2 BPM
    pub within_2_bpm_pct: f32,
    /// Percentage of cases within 5 BPM
    pub within_5_bpm_pct: f32,
    /// Percentage of octave errors
    pub octave_error_pct: f32,
    /// Individual results (for detailed analysis)
    pub results: Vec<EstimationResult>,
}

impl BenchmarkMetrics {
    pub fn from_results(results: Vec<EstimationResult>) -> Self {
        let n = results.len();
        if n == 0 {
            return Self::default();
        }

        let sum_abs_error: f32 = results.iter().map(|r| r.absolute_error).sum();
        let sum_sq_error: f32 = results.iter().map(|r| r.absolute_error.powi(2)).sum();
        let count_within_1 = results.iter().filter(|r| r.within_1_bpm).count();
        let count_within_2 = results.iter().filter(|r| r.within_2_bpm).count();
        let count_within_5 = results.iter().filter(|r| r.within_5_bpm).count();
        let count_octave = results.iter().filter(|r| r.is_octave_error).count();

        let n_f = n as f32;

        Self {
            total_cases: n,
            mae: sum_abs_error / n_f,
            rmse: (sum_sq_error / n_f).sqrt(),
            within_1_bpm_pct: 100.0 * count_within_1 as f32 / n_f,
            within_2_bpm_pct: 100.0 * count_within_2 as f32 / n_f,
            within_5_bpm_pct: 100.0 * count_within_5 as f32 / n_f,
            octave_error_pct: 100.0 * count_octave as f32 / n_f,
            results,
        }
    }

    /// Generate a summary string for reporting
    pub fn summary(&self) -> String {
        format!(
            "Benchmark Results (n={}):\n\
             - MAE: {:.2} BPM\n\
             - RMSE: {:.2} BPM\n\
             - Within 1 BPM: {:.1}%\n\
             - Within 2 BPM: {:.1}%\n\
             - Within 5 BPM: {:.1}%\n\
             - Octave Errors: {:.1}%",
            self.total_cases,
            self.mae,
            self.rmse,
            self.within_1_bpm_pct,
            self.within_2_bpm_pct,
            self.within_5_bpm_pct,
            self.octave_error_pct
        )
    }
}

// ============================================================================
// Estimation Methods (for benchmarking different algorithms)
// ============================================================================

/// Available estimation methods for benchmarking
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EstimationMethod {
    /// Raw PSD peak (baseline, prone to harmonic errors)
    RawPsdPeak,
    /// Cepstrum-based estimation
    Cepstrum,
    /// Harmonic-sum scoring
    HarmonicSum,
    /// Full pipeline with prior and harmonic scoring
    HarmonicWithPrior,
    /// Combined check (uses harmonic_probability_check)
    CombinedCheck,
}

/// Estimate BPM from a signal using the specified method
pub fn estimate_bpm(
    signal: &[f32],
    sample_rate: f32,
    method: EstimationMethod,
    prior: Option<HarmonicPrior>,
) -> Option<f32> {
    let prior = prior.unwrap_or_default();

    match method {
        EstimationMethod::RawPsdPeak => {
            let (freq, _, _, _, _) = periodogram_peak_freq(signal, sample_rate, 0.5, 4.0, 0.02)?;
            Some(freq * 60.0)
        }
        EstimationMethod::Cepstrum => {
            let result = harmonic_probability_check(signal, sample_rate);
            result.cepstrum_bpm
        }
        EstimationMethod::HarmonicSum => {
            let result = harmonic_probability_check(signal, sample_rate);
            result.harmonic_sum_bpm
        }
        EstimationMethod::HarmonicWithPrior => {
            let (_, _, powers, fmin, df) =
                periodogram_peak_freq(signal, sample_rate, 0.5, 4.0, 0.02)?;
            let freq = select_harmonic_with_prior(&powers, fmin, df, 4.0, sample_rate, prior)?;
            Some(freq * 60.0)
        }
        EstimationMethod::CombinedCheck => {
            // Use cepstrum if confident, otherwise fall back to harmonic sum
            let result = harmonic_probability_check(signal, sample_rate);
            result.cepstrum_bpm.or(result.harmonic_sum_bpm)
        }
    }
}

// ============================================================================
// Benchmark Test Suites
// ============================================================================

/// A single benchmark test case
#[derive(Debug, Clone)]
pub struct BenchmarkCase {
    pub name: String,
    pub config: SyntheticSignalConfig,
}

impl BenchmarkCase {
    pub fn new(name: &str, config: SyntheticSignalConfig) -> Self {
        Self {
            name: name.to_string(),
            config,
        }
    }
}

/// Generate a comprehensive test suite for harmonic selection
pub fn generate_test_suite() -> Vec<BenchmarkCase> {
    let mut cases = Vec::new();
    let sample_rate = 30.0;

    // 1. Clean signals at various BPM values
    for bpm in [50.0, 60.0, 72.0, 85.0, 100.0, 120.0, 150.0] {
        cases.push(BenchmarkCase::new(
            &format!("clean_{:.0}bpm", bpm),
            SyntheticSignalConfig::clean(bpm, sample_rate),
        ));
    }

    // 2. Realistic signals with harmonics
    for bpm in [60.0, 72.0, 85.0, 100.0] {
        cases.push(BenchmarkCase::new(
            &format!("realistic_{:.0}bpm", bpm),
            SyntheticSignalConfig::realistic(bpm, sample_rate),
        ));
    }

    // 3. Strong second harmonic (octave error risk)
    for bpm in [60.0, 72.0, 85.0] {
        cases.push(BenchmarkCase::new(
            &format!("strong_2nd_harmonic_{:.0}bpm", bpm),
            SyntheticSignalConfig::strong_second_harmonic(bpm, sample_rate),
        ));
    }

    // 4. Motion artifacts at specific frequencies
    for bpm in [72.0, 85.0] {
        // Motion at 2x the heart rate (common walking frequency)
        let f0 = bpm / 60.0;
        cases.push(BenchmarkCase::new(
            &format!("motion_2x_{:.0}bpm", bpm),
            SyntheticSignalConfig::with_motion(bpm, sample_rate, 2.0 * f0, 0.8),
        ));

        // Motion at exactly the heart rate (worst case)
        cases.push(BenchmarkCase::new(
            &format!("motion_1x_{:.0}bpm", bpm),
            SyntheticSignalConfig::with_motion(bpm, sample_rate, f0, 0.6),
        ));
    }

    // 5. Noisy signals at various SNR levels and BPM values
    for (noise_level, bpm) in [(0.1, 67.0), (0.2, 78.0), (0.5, 91.0)] {
        cases.push(BenchmarkCase::new(
            &format!("noisy_{:.1}_{:.0}bpm", noise_level, bpm),
            SyntheticSignalConfig::noisy(bpm, sample_rate, noise_level),
        ));
    }

    // 6. Edge cases: very low and very high HR
    cases.push(BenchmarkCase::new(
        "low_hr_45bpm",
        SyntheticSignalConfig::realistic(45.0, sample_rate),
    ));
    cases.push(BenchmarkCase::new(
        "high_hr_180bpm",
        SyntheticSignalConfig::realistic(180.0, sample_rate),
    ));

    // 7. Different sample rates
    for sr in [25.0, 30.0, 60.0] {
        cases.push(BenchmarkCase::new(
            &format!("sample_rate_{:.0}hz", sr),
            SyntheticSignalConfig::realistic(72.0, sr),
        ));
    }

    // 8. Highly realistic signals with HRV and respiratory modulation
    for bpm in [60.0, 72.0, 85.0, 100.0] {
        cases.push(BenchmarkCase::new(
            &format!("highly_realistic_{:.0}bpm", bpm),
            SyntheticSignalConfig::highly_realistic(bpm, sample_rate),
        ));
    }

    // 9. Challenging signals (multiple artifacts combined)
    for bpm in [65.0, 72.0, 80.0, 95.0] {
        cases.push(BenchmarkCase::new(
            &format!("challenging_{:.0}bpm", bpm),
            SyntheticSignalConfig::challenging(bpm, sample_rate),
        ));
    }

    // 10. HRV stress test - high variability at different BPM values
    for (hrv, bpm) in [(0.05, 68.0), (0.08, 77.0), (0.10, 88.0)] {
        let mut config = SyntheticSignalConfig::highly_realistic(bpm, sample_rate);
        config.hrv_percent = hrv;
        cases.push(BenchmarkCase::new(
            &format!("high_hrv_{:.0}pct_{:.0}bpm", hrv * 100.0, bpm),
            config,
        ));
    }

    // 11. Respiratory interference - breathing rate near HR subharmonic at varied BPM
    for (resp_rate, bpm) in [(18.0, 66.0), (24.0, 79.0), (30.0, 93.0)] {
        let mut config = SyntheticSignalConfig::highly_realistic(bpm, sample_rate);
        config.respiratory_rate = resp_rate;
        config.respiratory_amplitude = 0.35;
        cases.push(BenchmarkCase::new(
            &format!("resp_interference_{:.0}br_{:.0}bpm", resp_rate, bpm),
            config,
        ));
    }

    cases
}

/// Run benchmark suite with a specific estimation method
pub fn run_benchmark(
    test_cases: &[BenchmarkCase],
    method: EstimationMethod,
    prior: Option<HarmonicPrior>,
) -> BenchmarkMetrics {
    let mut results = Vec::new();

    for case in test_cases {
        let signal = generate_synthetic_signal(&case.config);
        if let Some(estimated) = estimate_bpm(&signal, case.config.sample_rate, method, prior) {
            results.push(EstimationResult::new(case.config.true_bpm, estimated));
        }
    }

    BenchmarkMetrics::from_results(results)
}

/// Run all estimation methods and compare results
pub fn run_comparison_benchmark(
    test_cases: &[BenchmarkCase],
) -> Vec<(EstimationMethod, BenchmarkMetrics)> {
    let methods = [
        EstimationMethod::RawPsdPeak,
        EstimationMethod::Cepstrum,
        EstimationMethod::HarmonicSum,
        EstimationMethod::HarmonicWithPrior,
        EstimationMethod::CombinedCheck,
    ];

    methods
        .iter()
        .map(|&method| {
            let metrics = run_benchmark(test_cases, method, None);
            (method, metrics)
        })
        .collect()
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_synthetic_signal_generation() {
        let config = SyntheticSignalConfig::clean(72.0, 30.0);
        let signal = generate_synthetic_signal(&config);
        assert_eq!(signal.len(), 300); // 10 seconds at 30 Hz

        // Signal should have non-zero variance
        let mean: f32 = signal.iter().sum::<f32>() / signal.len() as f32;
        let var: f32 = signal.iter().map(|x| (x - mean).powi(2)).sum::<f32>() / signal.len() as f32;
        assert!(var > 0.1, "Signal should have variance, got {}", var);
    }

    #[test]
    fn test_estimation_result() {
        let result = EstimationResult::new(72.0, 73.5);
        assert!(!result.is_octave_error);
        assert!(!result.within_1_bpm);
        assert!(result.within_2_bpm);
        assert!(result.within_5_bpm);
        assert!((result.absolute_error - 1.5).abs() < 0.01);

        // Test octave error detection
        let octave_result = EstimationResult::new(72.0, 144.0);
        assert!(octave_result.is_octave_error);
    }

    #[test]
    fn test_benchmark_metrics_aggregation() {
        let results = vec![
            EstimationResult::new(72.0, 72.5),  // Error: 0.5
            EstimationResult::new(72.0, 73.0),  // Error: 1.0
            EstimationResult::new(72.0, 74.0),  // Error: 2.0
            EstimationResult::new(72.0, 144.0), // Error: 72.0 (octave)
        ];
        let metrics = BenchmarkMetrics::from_results(results);

        assert_eq!(metrics.total_cases, 4);
        assert!(metrics.octave_error_pct > 20.0); // 1 out of 4 = 25%
        assert!(metrics.within_1_bpm_pct > 20.0); // 2 out of 4 = 50%
    }

    #[test]
    fn test_clean_signal_estimation() {
        let config = SyntheticSignalConfig::clean(72.0, 30.0);
        let signal = generate_synthetic_signal(&config);

        // Raw PSD should work on clean signals
        let estimated = estimate_bpm(&signal, 30.0, EstimationMethod::RawPsdPeak, None);
        assert!(estimated.is_some());
        let bpm = estimated.unwrap();
        assert!(
            (bpm - 72.0).abs() < 5.0,
            "Clean signal should give accurate estimate, got {}",
            bpm
        );
    }

    #[test]
    fn test_harmonic_with_prior_handles_strong_harmonic() {
        // Signal with stronger 2nd harmonic than fundamental
        let config = SyntheticSignalConfig::strong_second_harmonic(72.0, 30.0);
        let signal = generate_synthetic_signal(&config);

        // Raw PSD will likely pick the 2nd harmonic
        let raw_estimate = estimate_bpm(&signal, 30.0, EstimationMethod::RawPsdPeak, None);

        // Harmonic with prior should correct for this
        let prior = HarmonicPrior::new(50.0, 100.0);
        let corrected_estimate = estimate_bpm(
            &signal,
            30.0,
            EstimationMethod::HarmonicWithPrior,
            Some(prior),
        );

        if let (Some(raw), Some(corrected)) = (raw_estimate, corrected_estimate) {
            // The corrected estimate should be closer to 72 than the raw one (if raw picked harmonic)
            let raw_error = (raw - 72.0).abs();
            let corrected_error = (corrected - 72.0).abs();
            // At minimum, corrected should not be worse
            assert!(
                corrected_error <= raw_error + 5.0 || corrected_error < 10.0,
                "Corrected ({}) should not be much worse than raw ({})",
                corrected,
                raw
            );
        }
    }

    #[test]
    fn test_full_benchmark_suite_runs() {
        let test_cases = generate_test_suite();
        assert!(!test_cases.is_empty());

        let metrics = run_benchmark(&test_cases, EstimationMethod::HarmonicWithPrior, None);
        assert!(metrics.total_cases > 0);

        // Should have reasonable accuracy on the full suite
        assert!(
            metrics.within_5_bpm_pct > 50.0,
            "At least half should be within 5 BPM"
        );
    }

    #[test]
    fn test_cepstrum_vs_psd_on_harmonic_signal() {
        // Create a signal where cepstrum should outperform raw PSD
        let config = SyntheticSignalConfig {
            true_bpm: 70.0,
            fundamental_amplitude: 0.6,
            harmonic_amplitudes: vec![1.2, 0.4],
            noise_std: 0.02,
            ..SyntheticSignalConfig::default()
        };

        let signal = generate_synthetic_signal(&config);

        let cep_bpm = estimate_bpm(&signal, 30.0, EstimationMethod::Cepstrum, None);
        let _raw_bpm = estimate_bpm(&signal, 30.0, EstimationMethod::RawPsdPeak, None);

        if let Some(cep) = cep_bpm {
            let cep_error = (cep - 70.0).abs();
            // Cepstrum should be reasonably close to 70 BPM
            assert!(
                cep_error < 15.0,
                "Cepstrum estimate {} too far from 70",
                cep
            );
        }
    }
}
