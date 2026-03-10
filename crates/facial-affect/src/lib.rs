//! Facial affect core: calibration-based classifier for facial sentiment.
//!
//! API summary:
//! - `SentimentCore::new(cfg)`
//! - `update_from_metrics(&mut self, metrics, timestamp_ms)` -> `SentimentResult`
//! - `start_calibration`, `finalize_calibration`, `reset`

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct LandmarkMetrics {
    /// Smile metric (0..1), higher -> more smile
    pub smile: f32,
    /// Brow height (normalized to inter-eye distance)
    pub brow_height: f32,
    /// Inner brow distance (normalized)
    pub brow_distance: f32,
    /// Eye openness (0..1)
    pub eye_openness: f32,
}

impl Default for LandmarkMetrics {
    fn default() -> Self {
        Self { smile: 0.0, brow_height: 0.0, brow_distance: 0.0, eye_openness: 0.0 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentimentConfig {
    pub smooth_window: usize,
    pub baseline_window: usize,
    pub smile_threshold: f32,
    pub brow_height_threshold: f32,
    pub brow_distance_threshold: f32,
    pub eye_openness_threshold: f32,
    pub acute_stress_drop: f32,
}

impl Default for SentimentConfig {
    fn default() -> Self {
        Self {
            smooth_window: 15,
            baseline_window: 120,
            smile_threshold: 0.15,
            brow_height_threshold: 0.12,
            brow_distance_threshold: 0.10,
            eye_openness_threshold: 0.15,
            acute_stress_drop: 0.06,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SentimentLabel {
    Neutral,
    Happy,
    Surprised,
    Stressed,
    Focused,
    Fatigue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentimentResult {
    pub label: SentimentLabel,
    pub confidence: f32,
    /// Quality 0..1 (face found, landmarks stable)
    pub quality: f32,
    pub metrics: LandmarkMetrics,
}

pub struct SentimentCore {
    cfg: SentimentConfig,
    buffer: VecDeque<LandmarkMetrics>,
    baseline_buffer: VecDeque<LandmarkMetrics>,
    baseline: Option<LandmarkMetrics>,
    last_metrics: Option<LandmarkMetrics>,
}

impl SentimentCore {
    pub fn new(cfg: SentimentConfig) -> Self {
        // avoid using cfg after moving by extracting capacities first
        let smooth_cap = cfg.smooth_window;
        let baseline_cap = cfg.baseline_window;
        Self { cfg, buffer: VecDeque::with_capacity(smooth_cap), baseline_buffer: VecDeque::with_capacity(baseline_cap), baseline: None, last_metrics: None }
    }

    /// Start filling baseline buffer (useful to call when user starts calibration)
    pub fn start_calibration(&mut self) {
        self.baseline_buffer.clear();
        self.baseline = None;
    }

    /// Finalize calibration: compute baseline mean
    pub fn finalize_calibration(&mut self) {
        if self.baseline_buffer.is_empty() { self.baseline = None; return; }
        let mut sum = LandmarkMetrics::default();
        for m in &self.baseline_buffer {
            sum.smile += m.smile; sum.brow_height += m.brow_height; sum.brow_distance += m.brow_distance; sum.eye_openness += m.eye_openness;
        }
        let n = self.baseline_buffer.len() as f32;
        self.baseline = Some(LandmarkMetrics { smile: sum.smile / n, brow_height: sum.brow_height / n, brow_distance: sum.brow_distance / n, eye_openness: sum.eye_openness / n });
    }

    pub fn reset(&mut self) {
        self.buffer.clear(); self.baseline_buffer.clear(); self.baseline = None; self.last_metrics = None;
    }

    /// Update from precomputed metrics (landmarks -> metrics should be done upstream)
    pub fn update_from_metrics(&mut self, metrics: LandmarkMetrics, _timestamp_ms: i64) -> SentimentResult {
        // add to smoothing buffer
        self.buffer.push_back(metrics);
        if self.buffer.len() > self.cfg.smooth_window { self.buffer.pop_front(); }
        // update baseline buffer if calibrating
        if self.baseline_buffer.capacity() == self.cfg.baseline_window {
            // Only add to baseline buffer when it's still being filled
            if self.baseline.is_none() {
                self.baseline_buffer.push_back(metrics);
                if self.baseline_buffer.len() > self.cfg.baseline_window { self.baseline_buffer.pop_front(); }
            }
        }
        // compute smoothed metrics
        let mut s = LandmarkMetrics::default();
        for m in &self.buffer { s.smile += m.smile; s.brow_height += m.brow_height; s.brow_distance += m.brow_distance; s.eye_openness += m.eye_openness; }
        let n = self.buffer.len() as f32;
        if n > 0.0 { s.smile/=n; s.brow_height/=n; s.brow_distance/=n; s.eye_openness/=n; }

        // compute deltas against baseline if present (using smoothed metrics)
        let delta_smile = match self.baseline { Some(b) => s.smile - b.smile, None => s.smile };
        let delta_brow_height = match self.baseline { Some(b) => s.brow_height - b.brow_height, None => s.brow_height };
        let delta_brow_distance = match self.baseline { Some(b) => s.brow_distance - b.brow_distance, None => s.brow_distance };
        let delta_eye = match self.baseline { Some(b) => s.eye_openness - b.eye_openness, None => s.eye_openness };

        // rules
        let mut label = SentimentLabel::Neutral;
        let mut conf = 0.0f32;

        // Immediate checks against baseline using raw (latest) metrics to detect acute events
        if let Some(b) = self.baseline {
            // acute brow distance drop
            if metrics.brow_distance < b.brow_distance - self.cfg.brow_distance_threshold {
                label = SentimentLabel::Stressed;
                conf = 0.9;
            }
            // acute brow height spike (surprise)
            if metrics.brow_height > b.brow_height + self.cfg.brow_height_threshold {
                label = SentimentLabel::Surprised;
                conf = conf.max(0.9);
            }
        }

        // happiness and other sustained labels rely on smoothed deltas
        // happy
        if delta_smile > self.cfg.smile_threshold {
            label = SentimentLabel::Happy; conf = conf.max((delta_smile / (self.cfg.smile_threshold*2.0)).min(1.0));
        }
        // surprised: brow height spike (sustained)
        if delta_brow_height > self.cfg.brow_height_threshold {
            label = SentimentLabel::Surprised; conf = conf.max((delta_brow_height / (self.cfg.brow_height_threshold*2.0)).min(1.0));
        }
        // stressed: brow distance drop or lowered brow height (sustained)
        if delta_brow_distance < -self.cfg.brow_distance_threshold || delta_brow_height < -self.cfg.brow_height_threshold {
            label = SentimentLabel::Stressed; conf = conf.max(((-delta_brow_distance).max(-delta_brow_height) / (self.cfg.brow_distance_threshold*2.0)).min(1.0));
        }
        // focused: eye openness high
        if delta_eye > self.cfg.eye_openness_threshold {
            label = SentimentLabel::Focused; conf = conf.max((delta_eye / (self.cfg.eye_openness_threshold*2.0)).min(1.0));
        }
        // fatigue: sustained low eye openness
        if delta_eye < -self.cfg.eye_openness_threshold {
            label = SentimentLabel::Fatigue; conf = conf.max(((-delta_eye) / (self.cfg.eye_openness_threshold*2.0)).min(1.0));
        }

        // acute stress detector (quick heuristic): sharp drop in brow distance compared to last
        if let Some(last) = self.last_metrics {
            if last.brow_distance - s.brow_distance > self.cfg.acute_stress_drop {
                label = SentimentLabel::Stressed; conf = conf.max(0.8);
            }
        }

        self.last_metrics = Some(s);

        let quality = 1.0; // placeholder (face-found checks should be done upstream)
        SentimentResult { label, confidence: conf, quality, metrics: s }
    }
}

impl Default for SentimentCore {
    fn default() -> Self {
        Self::new(SentimentConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_smile_detection() {
        let mut core = SentimentCore::default();
        let mut res = core.update_from_metrics(LandmarkMetrics { smile: 0.0, brow_height:0.0, brow_distance:0.0, eye_openness:0.0 }, 0);
        assert_eq!(res.label, SentimentLabel::Neutral);
        // raise smile
        for _ in 0..10 { res = core.update_from_metrics(LandmarkMetrics { smile: 0.4, brow_height:0.0, brow_distance:0.0, eye_openness:0.0 }, 0); }
        assert_eq!(res.label, SentimentLabel::Happy);
        assert!(res.confidence > 0.0);
    }

    #[test]
    fn test_stress_by_brow_drop() {
        let mut core = SentimentCore::default();
        // baseline higher brow_distance
        core.start_calibration();
        for _ in 0..120 { core.update_from_metrics(LandmarkMetrics { smile:0.0, brow_height:0.5, brow_distance:0.5, eye_openness:0.5 }, 0); }
        core.finalize_calibration();
        let res = core.update_from_metrics(LandmarkMetrics { smile:0.0, brow_height:0.3, brow_distance:0.3, eye_openness:0.5 }, 0);
        assert_eq!(res.label, SentimentLabel::Stressed);
    }
}
