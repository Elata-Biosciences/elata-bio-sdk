//! WASM wrapper for `elata-biosignal-features` (thin adapter).
//!
//! Mirrors the `elata-rppg-wasm` `cfg_attr` style so `cargo test` exercises
//! the same code natively.
//!
//! The boundary is deliberately COARSE — one call per unit of work, never one
//! per metric or per sample. Crossing into WASM copies a typed array and
//! serializes a result; doing that per metric would cost more than the maths.
//! So each analyzer takes one typed array plus a versioned JSON config and
//! returns ONE JSON document carrying every metric it computed, together with
//! the `configId` and `algorithmVersions` provenance a persisted observation
//! needs to stay attributable:
//!
//! - [`WasmEegWindowAnalyzer`] — one interleaved `Float32Array` per window.
//! - [`WasmPrvAnalyzer`] — one `Float64Array` of PP intervals in ms.
//! - [`WasmActivationEpochAnalyzer`] — one `Float64Array` index series per
//!   session.
//!
//! Intervals and index series are `f64`, not `f32`: unlike raw sensor samples
//! they are already-derived values, and quantizing them at the boundary would
//! throw away precision the engine then cannot recover.

use elata_biosignal_features::{ActivationEpochAnalyzer, EegWindowAnalyzer, PrvAnalyzer};

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

/// Pulse-rate-variability analyzer exposed to JavaScript.
///
/// PRV, not HRV: the intervals are camera-derived peak-to-peak intervals, and
/// the payload says so throughout.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct WasmPrvAnalyzer {
    inner: PrvAnalyzer,
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
impl WasmPrvAnalyzer {
    /// Build an analyzer. `config_json` is an optional `PrvConfig` JSON
    /// document; missing fields default to the standard profile.
    #[wasm_bindgen(constructor)]
    pub fn new(config_json: Option<String>) -> Result<WasmPrvAnalyzer, JsValue> {
        let inner = PrvAnalyzer::new(config_json.as_deref())
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(WasmPrvAnalyzer { inner })
    }

    /// Analyze one PP-interval series (milliseconds, acquisition order).
    /// Returns `PrvSummaryV1` JSON with both domains in a single document.
    pub fn analyze_intervals(&mut self, intervals_ms: &[f64]) -> String {
        analyze_intervals_json(&self.inner, intervals_ms)
    }

    /// Stable hash of the resolved configuration (provenance).
    pub fn config_id(&self) -> String {
        self.inner.config_id().to_string()
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl WasmPrvAnalyzer {
    pub fn new(config_json: Option<String>) -> Result<WasmPrvAnalyzer, String> {
        let inner = PrvAnalyzer::new(config_json.as_deref()).map_err(|e| e.to_string())?;
        Ok(WasmPrvAnalyzer { inner })
    }

    pub fn analyze_intervals(&mut self, intervals_ms: &[f64]) -> String {
        analyze_intervals_json(&self.inner, intervals_ms)
    }

    pub fn config_id(&self) -> String {
        self.inner.config_id().to_string()
    }
}

fn analyze_intervals_json(analyzer: &PrvAnalyzer, intervals_ms: &[f64]) -> String {
    serde_json::to_string(&analyzer.analyze_intervals(intervals_ms))
        .unwrap_or_else(|_| "null".to_string())
}

/// Activation-epoch analyzer exposed to JavaScript.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct WasmActivationEpochAnalyzer {
    inner: ActivationEpochAnalyzer,
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
impl WasmActivationEpochAnalyzer {
    /// Build an analyzer. `sample_rate_hz` is the rate of the DERIVED index
    /// series (typically well under 1 Hz — one value per analysis window),
    /// not the sensor's sample rate. `config_json` is an optional
    /// `ActivationEpochConfig` JSON document.
    #[wasm_bindgen(constructor)]
    pub fn new(
        sample_rate_hz: f64,
        config_json: Option<String>,
    ) -> Result<WasmActivationEpochAnalyzer, JsValue> {
        let inner = ActivationEpochAnalyzer::new(sample_rate_hz, config_json.as_deref())
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(WasmActivationEpochAnalyzer { inner })
    }

    /// Analyze one session-length index series. Returns
    /// `ActivationEpochResultV1` JSON. A withheld epoch or recovery block
    /// comes back as `null` with a machine-readable reason — never as a 0 a
    /// consumer would mistake for a measurement.
    pub fn analyze_series(&mut self, values: &[f64]) -> String {
        analyze_series_json(&self.inner, values)
    }

    /// Stable hash of the resolved configuration (provenance).
    pub fn config_id(&self) -> String {
        self.inner.config_id().to_string()
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl WasmActivationEpochAnalyzer {
    pub fn new(
        sample_rate_hz: f64,
        config_json: Option<String>,
    ) -> Result<WasmActivationEpochAnalyzer, String> {
        let inner = ActivationEpochAnalyzer::new(sample_rate_hz, config_json.as_deref())
            .map_err(|e| e.to_string())?;
        Ok(WasmActivationEpochAnalyzer { inner })
    }

    pub fn analyze_series(&mut self, values: &[f64]) -> String {
        analyze_series_json(&self.inner, values)
    }

    pub fn config_id(&self) -> String {
        self.inner.config_id().to_string()
    }
}

fn analyze_series_json(analyzer: &ActivationEpochAnalyzer, values: &[f64]) -> String {
    serde_json::to_string(&analyzer.analyze_series(values)).unwrap_or_else(|_| "null".to_string())
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

    // ---------------------------------------------------------------- PRV --

    fn modulated_intervals(duration_s: f64, mean_ms: f64, amp_ms: f64, hz: f64) -> Vec<f64> {
        let mut out = Vec::new();
        let mut t = 0.0f64;
        while t < duration_s {
            let nn = mean_ms + amp_ms * (2.0 * std::f64::consts::PI * hz * t).sin();
            out.push(nn);
            t += nn / 1000.0;
        }
        out
    }

    #[test]
    fn prv_constructor_rejects_invalid_config() {
        assert!(WasmPrvAnalyzer::new(Some("{bad".into())).is_err());
        assert!(WasmPrvAnalyzer::new(Some(r#"{"v":9}"#.into())).is_err());
        assert!(WasmPrvAnalyzer::new(None).is_ok());
    }

    #[test]
    fn prv_analyze_returns_one_document_with_both_domains() {
        let mut analyzer = WasmPrvAnalyzer::new(None).unwrap();
        let json = analyzer.analyze_intervals(&modulated_intervals(300.0, 850.0, 40.0, 0.10));
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["schema"], "elata.prv-summary/v1");
        assert_eq!(value["configId"].as_str().unwrap(), analyzer.config_id());
        assert!(value["algorithmVersions"]["prv_time_domain"].is_string());
        // One call, every metric — the boundary is coarse by design.
        assert!(value["timeDomain"]["sdnnMs"].is_number());
        assert!(value["timeDomain"]["sd1Ms"].is_number());
        assert!(value["timeDomain"]["pnn50Percent"].is_number());
        assert!(value["frequencyDomain"]["lfMs2"].is_number());
        assert!(value["frequencyDomain"]["lfHfRatio"].is_number());
    }

    #[test]
    fn prv_withholding_crosses_the_boundary_as_null_plus_a_reason() {
        let mut analyzer = WasmPrvAnalyzer::new(None).unwrap();
        let json = analyzer.analyze_intervals(&modulated_intervals(90.0, 800.0, 30.0, 0.25));
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(value["frequencyDomain"]["lfMs2"].is_null());
        assert_eq!(
            value["frequencyDomain"]["lfWithheldReason"],
            "recordingTooShort"
        );
        // Never substituted with 0 on the way across.
        assert!(value["frequencyDomain"]["lfHfRatio"].is_null());
        assert!(value["frequencyDomain"]["hfMs2"].is_number());
    }

    #[test]
    fn prv_config_json_is_honored() {
        let mut analyzer =
            WasmPrvAnalyzer::new(Some(r#"{"emitCleanedIntervals":true}"#.into())).unwrap();
        let json = analyzer.analyze_intervals(&[800.0, 810.0, 2500.0, 795.0]);
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["cleanedIntervalsMs"].as_array().unwrap().len(), 3);
        assert_eq!(value["implausibleIntervalCount"], 1);
    }

    // --------------------------------------------------- Activation epoch --

    fn trapezoid_series() -> Vec<f64> {
        (0..400)
            .map(|t| {
                let t = t as f64;
                if t <= 100.0 {
                    10.0
                } else if t <= 140.0 {
                    10.0 + (t - 100.0)
                } else if t <= 180.0 {
                    50.0
                } else if t <= 340.0 {
                    50.0 - 0.25 * (t - 180.0)
                } else {
                    10.0
                }
            })
            .collect()
    }

    #[test]
    fn activation_constructor_rejects_invalid_inputs() {
        assert!(WasmActivationEpochAnalyzer::new(0.0, None).is_err());
        assert!(WasmActivationEpochAnalyzer::new(1.0, Some("{bad".into())).is_err());
        assert!(WasmActivationEpochAnalyzer::new(1.0, None).is_ok());
    }

    #[test]
    fn activation_analyze_returns_the_full_contract_in_one_document() {
        let mut analyzer = WasmActivationEpochAnalyzer::new(1.0, None).unwrap();
        let json = analyzer.analyze_series(&trapezoid_series());
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["schema"], "elata.activation-epoch/v1");
        assert_eq!(value["configId"].as_str().unwrap(), analyzer.config_id());
        assert!(value["algorithmVersions"]["activation_epoch"].is_string());
        assert_eq!(value["epoch"]["peakValue"], 50.0);
        assert_eq!(value["epoch"]["timeToPeakSeconds"], 39.0);
        assert_eq!(value["epoch"]["recovery"]["timeToBaselineSeconds"], 184.0);
        assert_eq!(value["epoch"]["recovery"]["recoveryCompleted"], true);
        assert!(value["withheldReason"].is_null());
    }

    #[test]
    fn activation_withholding_crosses_the_boundary_as_null_plus_a_reason() {
        let mut analyzer = WasmActivationEpochAnalyzer::new(1.0, None).unwrap();
        let json = analyzer.analyze_series(&vec![10.0; 400]);
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(value["epoch"].is_null());
        assert_eq!(value["withheldReason"], "noQualifyingActivation");
        // The baseline still crossed intact — withholding is per-level.
        assert!(value["baseline"]["level"].is_number());
    }

    #[test]
    fn activation_config_json_is_honored() {
        let mut analyzer =
            WasmActivationEpochAnalyzer::new(1.0, Some(r#"{"activationK":4.0}"#.into())).unwrap();
        let default = WasmActivationEpochAnalyzer::new(1.0, None).unwrap();
        assert_ne!(analyzer.config_id(), default.config_id());
        let json = analyzer.analyze_series(&trapezoid_series());
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        // A flat baseline has scale 0, so k does not move the threshold.
        assert_eq!(value["baseline"]["activationThreshold"], 10.0);
    }
}
