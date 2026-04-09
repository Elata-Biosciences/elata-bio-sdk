# elata-eeg-signal

Signal-processing utilities for EEG data in the Elata SDK.

This crate builds on `elata-eeg-hal` and provides reusable DSP helpers for common EEG workflows:

- FFT and spectrum helpers
- band-power calculations
- biquad-based filtering, including band-pass and notch filters
- windowing functions for spectral analysis
- EEG band constants re-exported from `elata-eeg-hal`

## What it is for

Use `elata-eeg-signal` when you need to transform buffered EEG samples into frequency-domain features or cleaned time-domain signals before model inference.

## Basic example

```rust
use elata_eeg_signal::{band_power, bands};

let sample_rate = 256.0;
let signal = vec![0.0; 256];

let alpha_power = band_power(&signal, sample_rate, bands::ALPHA);

assert!(alpha_power >= 0.0);
```

For device integration and sample buffering, start with `elata-eeg-hal`. For end-user EEG metrics and state estimation, layer `elata-eeg-models` on top.
