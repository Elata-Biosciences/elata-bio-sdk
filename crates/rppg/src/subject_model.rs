use crate::dsp::HarmonicPrior;

/// Simple online SubjectModel using exponential moving average (EMA) to track per-user resting BPM.
/// Intended to be light-weight and easily serializable (small struct).
#[derive(Debug, Clone)]
pub struct SubjectModel {
    pub mean_bpm: f32,
    pub var_bpm: f32,
    pub alpha: f32, // EMA learning rate (0..1)
}

impl SubjectModel {
    pub fn new(initial_mean: f32, initial_var: f32, alpha: f32) -> Self {
        Self {
            mean_bpm: initial_mean,
            var_bpm: initial_var.max(1e-3),
            alpha,
        }
    }

    pub fn update(&mut self, bpm: f32) {
        // simple EMA for mean and a running variance using EMA
        let delta = bpm - self.mean_bpm;
        self.mean_bpm += self.alpha * delta;
        // update variance (biased EMA variant)
        self.var_bpm = (1.0 - self.alpha) * self.var_bpm + self.alpha * (delta * delta);
        if self.var_bpm < 1e-3 {
            self.var_bpm = 1e-3;
        }
    }

    /// Return a HarmonicPrior shaped around the subject mean and ~2 sigma bounds
    pub fn prior_range(&self) -> HarmonicPrior {
        let sigma = self.var_bpm.sqrt();
        let min_bpm = (self.mean_bpm - 2.0 * sigma).max(30.0);
        let max_bpm = (self.mean_bpm + 2.0 * sigma).min(200.0);
        HarmonicPrior::new(min_bpm, max_bpm)
    }
}

impl Default for SubjectModel {
    fn default() -> Self {
        Self::new(75.0, 36.0, 0.1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subject_model_update_moves_mean_and_var() {
        let mut s = SubjectModel::default();
        let initial = s.mean_bpm;
        for _ in 0..20 {
            s.update(70.0);
        }
        assert!((s.mean_bpm - 70.0).abs() < (initial - 70.0).abs());
        // variance should be finite and reasonable
        assert!(s.var_bpm > 0.0 && s.var_bpm < 1000.0);
        let p = s.prior_range();
        assert!(p.min_bpm <= p.max_bpm);
    }
}
