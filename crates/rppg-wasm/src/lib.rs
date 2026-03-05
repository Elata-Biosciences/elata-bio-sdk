//! WASM wrapper for rPPG core (thin adapter)

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

use rppg::dsp::HarmonicPrior;
use rppg::RppgPipeline;

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct WasmRppgPipeline {
    inner: RppgPipeline,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl WasmRppgPipeline {
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new(sample_rate: f32, window_sec: f32) -> WasmRppgPipeline {
        WasmRppgPipeline {
            inner: RppgPipeline::new(sample_rate, window_sec),
        }
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
    pub fn push_sample(&mut self, timestamp_ms: i64, intensity: f32) {
        self.inner.push_sample(timestamp_ms, intensity)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
    pub fn push_sample_rgb(&mut self, timestamp_ms: i64, r: f32, g: f32, b: f32, skin_ratio: f32) {
        self.inner
            .push_sample_rgb(timestamp_ms, r, g, b, skin_ratio)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
    pub fn push_sample_rgb_meta(
        &mut self,
        timestamp_ms: i64,
        r: f32,
        g: f32,
        b: f32,
        skin_ratio: f32,
        motion: f32,
        clip: f32,
    ) {
        self.inner
            .push_sample_rgb_meta(timestamp_ms, r, g, b, skin_ratio, motion, clip)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
    pub fn enable_tracker(&mut self, min_bpm: f32, max_bpm: f32, num_particles: u32) {
        let prior = HarmonicPrior::new(min_bpm, max_bpm);
        self.inner.enable_tracker(prior, num_particles as usize);
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
    pub fn get_metrics(&mut self) -> String {
        serde_json::to_string(&self.inner.get_metrics()).unwrap_or_else(|_| "null".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wasm_wrapper_estimates_bpm() {
        let mut w = WasmRppgPipeline::new(100.0, 5.0);
        let fs = 100.0;
        let freq = 1.3; // 78 bpm
        let n = 500;
        for i in 0..n {
            let t = i as f32 / fs;
            w.push_sample(i as i64, (2.0 * std::f32::consts::PI * freq * t).sin());
        }
        let s = w.get_metrics();
        assert!(s.contains("bpm"), "metrics missing bpm: {}", s);
    }
}
