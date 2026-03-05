//! Minimal FFI wrapper for rPPG pipeline (non-generated API for tests)

use rppg::RppgPipeline;
use std::sync::Mutex;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RppgMetricsRecord {
    pub bpm: Option<f32>,
    pub confidence: f32,
    pub signal_quality: f32,
}

pub struct RppgPipelineFFI {
    inner: Mutex<RppgPipeline>,
}

impl RppgPipelineFFI {
    pub fn new(sample_rate: u16, window_sec: f32) -> Self {
        Self {
            inner: Mutex::new(RppgPipeline::new(sample_rate as f32, window_sec)),
        }
    }

    pub fn push_sample(&self, timestamp_ms: i64, intensity: f32) {
        if let Ok(mut p) = self.inner.lock() {
            p.push_sample(timestamp_ms, intensity);
        }
    }

    pub fn get_metrics(&self) -> RppgMetricsRecord {
        if let Ok(mut p) = self.inner.lock() {
            let m = p.get_metrics();
            RppgMetricsRecord {
                bpm: m.bpm,
                confidence: m.confidence,
                signal_quality: m.signal_quality,
            }
        } else {
            RppgMetricsRecord {
                bpm: None,
                confidence: 0.0,
                signal_quality: 0.0,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ffi_wrapper_basic() {
        let s = RppgPipelineFFI::new(100, 5.0);
        let fs = 100.0;
        for i in 0..500 {
            let t = i as f32 / fs;
            let ts_ms = (t * 1000.0) as i64;
            s.push_sample(ts_ms, (2.0 * std::f32::consts::PI * 1.6 * t).sin());
        }
        let m = s.get_metrics();
        assert!(m.bpm.is_some());
        assert!(m.confidence > 0.0 || m.signal_quality > 0.0);
    }
}
