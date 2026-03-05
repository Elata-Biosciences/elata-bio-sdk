use crate::dsp::HarmonicPrior;
use rand::prelude::*;

/// Lightweight particle filter sketch for HR tracking. Particles represent candidate frequencies (Hz).
#[derive(Debug)]
pub struct ParticleFilter {
    pub particles: Vec<f32>,
    pub weights: Vec<f32>,
    pub process_noise: f32,
    pub prior: HarmonicPrior,
    // extra tunable weight on prior probability to increase inertia against octaves
    pub prior_weight: f32,
}

impl ParticleFilter {
    pub fn new(num_particles: usize, prior: HarmonicPrior) -> Self {
        let mut rng = thread_rng();
        let mut particles = Vec::with_capacity(num_particles);
        let weights = vec![1.0 / num_particles as f32; num_particles];
        // sample uniformly within prior range
        for _ in 0..num_particles {
            let bpm = rng.gen_range(prior.min_bpm..prior.max_bpm);
            particles.push(bpm / 60.0); // store in Hz
        }
        // reduce process noise slightly and increase prior weight to resist octave-dominant updates
        Self {
            particles,
            weights,
            process_noise: 0.015,
            prior,
            prior_weight: 2.0,
        }
    }

    pub fn predict(&mut self) {
        let mut rng = thread_rng();
        for p in self.particles.iter_mut() {
            let normal = rand_distr::Normal::<f32>::new(0.0_f32, self.process_noise).unwrap();
            let noise: f32 = rng.sample(normal);
            *p = (*p + noise).max(0.1);
        }
    }

    /// Update weights using a candidate list (freq Hz, score float) and normalize.
    /// candidates: pairs (freq_hz, score) where score is non-negative and relative.
    pub fn update_with_candidates(&mut self, candidates: &[(f32, f32)]) {
        if candidates.is_empty() {
            return;
        }
        let sigma = 0.07; // in Hz, matching expected smoothing
        for (i, p) in self.particles.iter().enumerate() {
            let mut likelihood = 1e-8;
            for (cf, score) in candidates.iter() {
                let diff = p - cf;
                let l = (-0.5 * (diff * diff) / (sigma * sigma)).exp();
                // include prior probability for candidate to discourage extreme octaves
                let cand_bpm = cf * 60.0;
                let prior_p = self.prior.probability(cand_bpm).powf(self.prior_weight);
                likelihood += l * (score + 1e-6) * prior_p;
            }
            self.weights[i] *= likelihood;
        }
        // normalize
        let sum: f32 = self.weights.iter().sum();
        if sum <= 0.0 {
            let n = self.weights.len();
            for w in self.weights.iter_mut() {
                *w = 1.0 / n as f32;
            }
            return;
        }
        for w in self.weights.iter_mut() {
            *w /= sum;
        }
        // resample if effective sample size low
        let ess = 1.0 / self.weights.iter().map(|w| w * w).sum::<f32>();
        if ess < (self.particles.len() as f32) * 0.5 {
            self.resample();
        }
    }

    pub fn estimate_hz(&self) -> f32 {
        self.particles
            .iter()
            .zip(self.weights.iter())
            .map(|(p, w)| p * w)
            .sum()
    }

    pub fn estimate_bpm(&self) -> f32 {
        self.estimate_hz() * 60.0
    }

    fn resample(&mut self) {
        let mut rng = thread_rng();
        let n = self.particles.len();
        let mut cum: Vec<f32> = Vec::with_capacity(n);
        let mut s = 0.0;
        for w in self.weights.iter() {
            s += *w;
            cum.push(s);
        }
        // systematic resampling
        let mut new_particles = Vec::with_capacity(n);
        let step = 1.0 / n as f32;
        let mut r: f32 = rng.gen::<f32>() * step;
        let mut i = 0;
        for _ in 0..n {
            while r > cum[i] {
                i += 1;
                if i >= n {
                    i = n - 1;
                    break;
                }
            }
            new_particles.push(self.particles[i]);
            r += step;
        }
        self.particles = new_particles;
        for w in self.weights.iter_mut() {
            *w = 1.0 / n as f32;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dsp::HarmonicPrior;

    #[test]
    fn particle_filter_resists_single_noisy_update() {
        let prior = HarmonicPrior::new(55.0, 90.0);
        let mut pf = ParticleFilter::new(400, prior);
        // candidates: strong harmonic at 2x (Hz), weak fundamental at 1x
        let cand1 = vec![(1.16_f32, 0.2_f32), (2.32_f32, 0.9_f32)];
        // run several predict/update cycles but starting prior centers on ~70 bpm
        for _ in 0..6 {
            pf.predict();
            pf.update_with_candidates(&cand1);
        }
        let est = pf.estimate_bpm();
        // Expect estimate still to be closer to fundamental (70) than harmonic (140)
        assert!((est - 70.0).abs() < 30.0, "est {} too far from 70", est);
    }
}
