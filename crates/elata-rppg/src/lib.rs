//! Remote photoplethysmography (rPPG) core for the Elata SDK.
//!
//! This crate contains the Rust-side processing pipeline used to estimate
//! pulse-related metrics from RGB intensity samples captured over time.
//!
//! # Main entry points
//!
//! - [`RppgPipeline`] buffers timestamped samples and computes windowed metrics
//! - [`harmonic_probability_check`] provides harmonic validation helpers
//! - [`SubjectModel`] and [`ParticleFilter`] expose supporting estimation tools
//!
//! # Example
//!
//! ```rust
//! use elata_rppg::RppgPipeline;
//!
//! let mut pipeline = RppgPipeline::new(30.0, 8.0);
//!
//! for i in 0..300 {
//!     let t_ms = i * 33;
//!     pipeline.push_sample_rgb(t_ms, 0.52, 0.61, 0.47, 0.95);
//! }
//!
//! let metrics = pipeline.get_metrics();
//! let _ = metrics.bpm;
//! ```
//!
//! This crate is intended to be embedded by higher-level WASM, FFI, or native
//! application layers rather than used as an end-user camera capture API.

pub mod benchmark;
pub mod dsp;
pub mod harmonic;
pub mod pipeline;
pub mod subject_model;
pub mod tracker;

pub use harmonic::{harmonic_probability_check, HarmonicCheckResult};
pub use pipeline::RppgPipeline;
pub use subject_model::SubjectModel;
pub use tracker::ParticleFilter;
