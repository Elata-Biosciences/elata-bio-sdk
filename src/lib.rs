//! EEG SDK - Hardware Abstraction Layer for EEG Devices
//!
//! This SDK provides a unified interface for working with EEG devices
//! and running analysis models on the data.
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────────┐
//! │                        EEG SDK                                  │
//! ├─────────────────────────────────────────────────────────────────┤
//! │  Models Layer                                                   │
//! │  ┌─────────────────┐  ┌─────────────────┐                      │
//! │  │ Alpha Bump      │  │ Calmness        │                      │
//! │  │ Detector        │  │ Model           │                      │
//! │  └────────┬────────┘  └────────┬────────┘                      │
//! │           │                    │                               │
//! │           └────────┬───────────┘                               │
//! │                    ▼                                           │
//! │  Signal Processing Layer                                       │
//! │  ┌─────────────────────────────────────────────────────┐      │
//! │  │ FFT │ Band Power │ Filtering │ Windowing            │      │
//! │  └─────────────────────────────────────────────────────┘      │
//! │                    ▲                                           │
//! │                    │                                           │
//! │  HAL Layer         │                                           │
//! │  ┌─────────────────┴───────────────────────────────────┐      │
//! │  │              EegDevice Trait                         │      │
//! │  │   connect() │ start_stream() │ read_samples()       │      │
//! │  └─────────────────────────────────────────────────────┘      │
//! │           ▲                    ▲                               │
//! │           │                    │                               │
//! │  ┌────────┴────────┐  ┌───────┴────────┐                      │
//! │  │ Synthetic       │  │ Muse S         │                      │
//! │  │ Device          │  │ (future)       │                      │
//! │  └─────────────────┘  └────────────────┘                      │
//! └─────────────────────────────────────────────────────────────────┘
//! ```
//!
//! # Quick Start
//!
//! ```no_run
//! use eeg_hal::{EegDevice, SampleBuffer};
//! use eeg_hal_synthetic::SyntheticDevice;
//! use eeg_models::{AlphaBumpDetector, CalmnessModel, Model};
//!
//! // Create a synthetic device for testing
//! let mut device = SyntheticDevice::new();
//! device.connect().unwrap();
//! device.start_stream().unwrap();
//!
//! // Create analysis models
//! let mut alpha_detector = AlphaBumpDetector::new(256);
//! let mut calmness = CalmnessModel::new(256);
//!
//! // Read and analyze data
//! let mut buffer = SampleBuffer::new(256, 4);
//! device.read_samples(&mut buffer).unwrap();
//!
//! // Process with models (need enough samples first)
//! // if let Some(output) = alpha_detector.process(&buffer) { ... }
//! ```
//!
//! # Crates
//!
//! - `eeg-hal` - Core traits and types
//! - `eeg-hal-synthetic` - Synthetic device for testing
//! - `eeg-signal` - Signal processing utilities
//! - `eeg-models` - Analysis models
//! - `eeg-ffi` - iOS/Android bindings via UniFFI
//! - `eeg-wasm` - Browser bindings via WebAssembly
//! - `bridge-proto` - BLE protocol definitions
//! - `synthetic-ble-bridge` - BLE bridge application

pub use eeg_hal::*;
