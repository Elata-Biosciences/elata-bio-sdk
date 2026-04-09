# elata-eeg-models

Reference EEG analysis models for the Elata SDK.

This crate consumes `elata-eeg-hal::SampleBuffer` inputs and produces higher-level outputs that applications can use directly.

Currently included:

- `AlphaBumpDetector` for alpha-band state transitions
- `AlphaPeakModel` for dominant alpha-frequency tracking
- `CalmnessModel` for a continuous calmness-oriented score
- the shared `Model` and `ModelOutput` traits

## What it is for

Use `elata-eeg-models` when you already have buffered EEG samples and want to run device-agnostic analysis without depending on a specific headset transport.

## Basic example

```rust
use elata_eeg_hal::SampleBuffer;
use elata_eeg_models::{AlphaPeakModel, Model};

let mut model = AlphaPeakModel::new(256);
let buffer = SampleBuffer::new(256, 4);

let _maybe_output = model.process(&buffer);
```

`elata-eeg-models` is intended to sit above `elata-eeg-hal` and `elata-eeg-signal` in the stack.
