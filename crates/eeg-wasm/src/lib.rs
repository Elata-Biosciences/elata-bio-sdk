//! WebAssembly bindings for EEG SDK
//!
//! Provides JavaScript-accessible APIs for:
//! - Signal processing (FFT, band power)
//! - Analysis models (alpha bump detection, alpha peak, calmness)

use wasm_bindgen::prelude::*;

mod athena;
mod models;
mod rppg;
mod signal;

pub use athena::*;
pub use models::*;
pub use rppg::*;
pub use signal::*;

/// Initialize the WASM module (call once at startup)
#[wasm_bindgen(start)]
pub fn init() {
    // Set up better panic messages in debug builds
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Get the SDK version
#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
