//! WASM wrapper for `elata-biosignal-features` (thin adapter).
//!
//! Mirrors the `elata-rppg-wasm` `cfg_attr` style so `cargo test` exercises
//! the same code natively. One coarse call per window: the caller passes one
//! interleaved `Float32Array` and receives the full `EegWindowFeaturesV1`
//! serialized as JSON (no serde-wasm-bindgen dependency).

use elata_biosignal_features::EegWindowAnalyzer;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

/// Windowed EEG feature analyzer exposed to JavaScript.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct WasmEegWindowAnalyzer {
    inner: EegWindowAnalyzer,
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
impl WasmEegWindowAnalyzer {
    /// Build an analyzer. `config_json` is an optional `EegWindowConfig`
    /// JSON document; missing fields default to the standard profile.
    #[wasm_bindgen(constructor)]
    pub fn new(
        sample_rate_hz: f32,
        channel_count: usize,
        config_json: Option<String>,
    ) -> Result<WasmEegWindowAnalyzer, JsValue> {
        let inner = EegWindowAnalyzer::new(sample_rate_hz, channel_count, config_json.as_deref())
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(WasmEegWindowAnalyzer { inner })
    }

    /// Analyze one window of interleaved samples
    /// (`samples[sampleIdx][channelIdx]` flattened). Returns
    /// `EegWindowFeaturesV1` JSON.
    pub fn analyze_window(&mut self, interleaved: &[f32]) -> String {
        analyze_window_json(&self.inner, interleaved)
    }

    /// Change the stream layout without re-parsing the configuration.
    pub fn update_layout(&mut self, sample_rate_hz: f32, channel_count: usize) {
        self.inner.update_layout(sample_rate_hz, channel_count);
    }

    /// Stable hash of the resolved configuration (provenance).
    pub fn config_id(&self) -> String {
        self.inner.config_id().to_string()
    }
}

// Native (non-wasm) mirror of the same surface so `cargo test` covers the
// exact call paths the bindings use.
#[cfg(not(target_arch = "wasm32"))]
impl WasmEegWindowAnalyzer {
    pub fn new(
        sample_rate_hz: f32,
        channel_count: usize,
        config_json: Option<String>,
    ) -> Result<WasmEegWindowAnalyzer, String> {
        let inner = EegWindowAnalyzer::new(sample_rate_hz, channel_count, config_json.as_deref())
            .map_err(|e| e.to_string())?;
        Ok(WasmEegWindowAnalyzer { inner })
    }

    pub fn analyze_window(&mut self, interleaved: &[f32]) -> String {
        analyze_window_json(&self.inner, interleaved)
    }

    pub fn update_layout(&mut self, sample_rate_hz: f32, channel_count: usize) {
        self.inner.update_layout(sample_rate_hz, channel_count);
    }

    pub fn config_id(&self) -> String {
        self.inner.config_id().to_string()
    }
}

fn analyze_window_json(analyzer: &EegWindowAnalyzer, interleaved: &[f32]) -> String {
    serde_json::to_string(&analyzer.analyze_window(interleaved))
        .unwrap_or_else(|_| "null".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn interleaved_alpha(n: usize, channels: usize) -> Vec<f32> {
        let mut out = Vec::with_capacity(n * channels);
        for i in 0..n {
            let t = i as f64 / 256.0;
            for _ in 0..channels {
                out.push((20.0 * (2.0 * std::f64::consts::PI * 10.0 * t).sin()) as f32);
            }
        }
        out
    }

    #[test]
    fn constructor_rejects_invalid_inputs() {
        assert!(WasmEegWindowAnalyzer::new(0.0, 4, None).is_err());
        assert!(WasmEegWindowAnalyzer::new(256.0, 0, None).is_err());
        assert!(WasmEegWindowAnalyzer::new(256.0, 4, Some("{bad".into())).is_err());
    }

    #[test]
    fn analyze_window_returns_features_json() {
        let mut analyzer = WasmEegWindowAnalyzer::new(256.0, 2, None).unwrap();
        let json = analyzer.analyze_window(&interleaved_alpha(2048, 2));
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["schema"], "elata.eeg-window-features/v1");
        assert_eq!(value["channelCount"], 2);
        assert_eq!(value["configId"].as_str().unwrap(), analyzer.config_id());
        let alpha_rel = value["bandPowersRel"][0]["alpha"].as_f64().unwrap();
        assert!(alpha_rel > 0.9, "alpha rel {alpha_rel}");
    }

    #[test]
    fn config_json_is_honored() {
        let mut analyzer = WasmEegWindowAnalyzer::new(
            256.0,
            1,
            Some(r#"{"emitPsd":true,"welch":{"segmentSeconds":2.0}}"#.into()),
        )
        .unwrap();
        let json = analyzer.analyze_window(&interleaved_alpha(1024, 1));
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        // segmentSeconds 2 @ 256 Hz -> nperseg 512 -> 257 one-sided bins.
        assert_eq!(value["psd"]["freqsHz"].as_array().unwrap().len(), 257);
    }

    #[test]
    fn update_layout_takes_effect() {
        let mut analyzer = WasmEegWindowAnalyzer::new(256.0, 2, None).unwrap();
        analyzer.update_layout(256.0, 1);
        let json = analyzer.analyze_window(&interleaved_alpha(1024, 1));
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["channelCount"], 1);
        assert_eq!(value["sampleCount"], 1024);
    }
}
