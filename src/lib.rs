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
//! use elata_eeg_hal::{EegDevice, SampleBuffer};
//! use elata_dev_eeg_synthetic::SyntheticDevice;
//! use elata_eeg_models::{AlphaBumpDetector, CalmnessModel, Model};
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
//! - `elata-eeg-hal` - Core traits and types
//! - `elata-eeg-signal` - Signal processing utilities
//! - `elata-eeg-models` - Analysis models
//! - `elata-muse-proto` - Muse protocol constants and packet helpers
//! - `elata-rppg` - rPPG processing core
//!
//! Public `crates.io` support is intentionally narrower than the full workspace.
//! The main public Rust surfaces are `elata-eeg-hal`, `elata-eeg-signal`, `elata-eeg-models`,
//! `elata-muse-proto`, and `elata-rppg`.

pub use elata_eeg_hal::*;
