//! Streaming EEG preprocessing bindings for WASM.

use eeg_signal::{
    DetrendMode, EegPreprocessorConfig, ReferenceMode, StreamingEegPreprocessor,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmEegPreprocessor {
    inner: StreamingEegPreprocessor,
}

#[wasm_bindgen]
impl WasmEegPreprocessor {
    #[wasm_bindgen(constructor)]
    pub fn new(
        sample_rate_hz: f32,
        channel_count: usize,
        config_json: Option<String>,
    ) -> Result<WasmEegPreprocessor, JsValue> {
        let config = parse_config(config_json)?;
        Ok(Self {
            inner: StreamingEegPreprocessor::new(sample_rate_hz, channel_count, config),
        })
    }

    pub fn process(&mut self, data: &[f32]) -> Vec<f32> {
        self.inner.process_interleaved(data)
    }

    pub fn update_layout(&mut self, sample_rate_hz: f32, channel_count: usize) {
        self.inner.update_layout(sample_rate_hz, channel_count);
    }

    pub fn reset(&mut self) {
        self.inner.reset();
    }

    #[wasm_bindgen(getter)]
    pub fn enabled(&self) -> bool {
        self.inner.config().enabled
    }

    #[wasm_bindgen(getter)]
    pub fn preserve_raw(&self) -> bool {
        self.inner.config().preserve_raw
    }

    pub fn reference_mode(&self) -> String {
        match self.inner.config().reference.mode {
            ReferenceMode::None => "none",
            ReferenceMode::CommonAverage => "common-average",
            ReferenceMode::CustomAverage => "custom-average",
        }
        .to_string()
    }

    pub fn detrend_mode(&self) -> String {
        match self.inner.config().detrend.mode {
            DetrendMode::Off => "off",
            DetrendMode::Highpass => "highpass",
            DetrendMode::Linear => "linear",
        }
        .to_string()
    }

    pub fn notch_frequencies_hz(&self) -> Vec<f32> {
        self.inner.notch_frequencies_hz().to_vec()
    }
}

fn parse_config(config_json: Option<String>) -> Result<EegPreprocessorConfig, JsValue> {
    match config_json {
        Some(config_json) => serde_json::from_str::<EegPreprocessorConfig>(&config_json)
            .map_err(|err| JsValue::from_str(&format!("Invalid EEG preprocessing config: {err}"))),
        None => Ok(EegPreprocessorConfig::default()),
    }
}
