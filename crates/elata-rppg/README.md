# elata-rppg

Remote photoplethysmography (rPPG) core for the Elata SDK.

This crate provides the Rust-side signal-processing pipeline used to estimate pulse-related metrics from RGB intensity samples.

## Included components

- `RppgPipeline` for buffering samples and producing windowed metrics
- DSP utilities in `dsp`
- harmonic checks and priors in `harmonic`
- subject and tracker helpers for estimation support

## Basic example

```rust
use elata_rppg::RppgPipeline;

let mut pipeline = RppgPipeline::new(30.0, 8.0);

for i in 0..300 {
    let t_ms = i * 33;
    pipeline.push_sample_rgb(t_ms, 0.52, 0.61, 0.47, 0.95);
}

let metrics = pipeline.get_metrics();
let _ = metrics.bpm;
```

This crate is the core Rust processing layer. For browser and native integration surfaces in this repository, see the WASM and FFI companion crates.
