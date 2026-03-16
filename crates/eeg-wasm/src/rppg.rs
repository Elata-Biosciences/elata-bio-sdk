use rppg::RppgPipeline;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

/// Simple WASM-friendly wrapper around `RppgPipeline`.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = "RppgPipeline"))]
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
        self.inner.push_sample(timestamp_ms, intensity);
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
    pub fn get_metrics(&mut self) -> String {
        let m = self.inner.get_metrics();
        // Serialize to JSON string for portability to JS
        serde_json::to_string(&m).unwrap_or_else(|_| "null".to_string())
    }
}

// Unit tests (run on native targets)
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wasm_wrapper_basic() {
        let mut w = WasmRppgPipeline::new(100.0, 5.0);
        let n = 500;
        for i in 0..n {
            let t = i as f32 / 100.0;
            let v = (2.0 * std::f32::consts::PI * 1.3 * t).sin();
            w.push_sample(i as i64, v);
        }
        let s = w.get_metrics();
        assert!(!s.is_empty());
    }
}
