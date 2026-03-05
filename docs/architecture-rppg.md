# rPPG + Ocular Proxy Architecture

Status: In progress

## Summary
Build a cross-device pipeline that extracts rPPG from camera video and optional ocular features, then produces calibrated, probabilistic "EEG-like" bandpower proxies (trend indices with confidence). Use a hybrid model: capture/vision stays in JS/native, while DSP + metrics live in shared Rust/WASM/FFI modules.

## Goals
- Single processing core for web, iOS, Android, desktop.
- On-device processing (no raw video leaves the device).
- Stable metrics with explicit confidence and quality gating.
- Clear separation between capture/vision and DSP.

## Non-goals
- Replacing clinical EEG or producing diagnostic-grade signals.
- Reconstructing full multi-channel EEG from webcam.
- Shipping training pipelines in production builds.

## High-level pipeline
1) Camera capture
2) Face/ROI tracking (MediaPipe)
3) ROI pixel stats (avg RGB / green channel)
4) rPPG DSP core (bandpass, temporal normalization, HR/HRV estimation)
5) Optional fusion (ocular + rPPG) and sentiment models
6) Metrics + confidence for apps

## Components

### Capture and ROI (platform-specific)
- Web: `getUserMedia` + MediaPipe tasks (face/landmarks).
- Native: iOS/Android camera APIs + native MediaPipe.
- Output: timestamped ROI statistics (avg R/G/B, quality flags).

### rPPG DSP core (shared)
- Rust module that consumes `{timestamp, intensity}` samples.
- Algorithms to port from the existing reference implementation:
  - Temporal normalization.
  - Bandpass (0.7-4.0 Hz for HR).
  - Periodogram HR + ACF fallback + harmonic checks.
- Output:
  - `bpm`, `confidence`, `signal_quality`, optional debug.

### Ocular features (optional, capture-side)
- Blink rate, PERCLOS, gaze stability, pupil dynamics.
- Used for fatigue/arousal fusion, not for "EEG replacement."

### Fusion + sentiment (optional, modular)
- Separate module that consumes rPPG + ocular features.
- Outputs coarse indices: `fatigue_index`, `arousal_score`, `focus_proxy`.
- Can be JS/ONNX or native ML; keep independent of rPPG core.

## Distribution strategy (hybrid)
- Web: Rust -> WASM via `rppg-wasm` (or `eeg-wasm` for the full SDK), wrapped by `packages/rppg-web` for a stable TS API.
- Native: Rust -> FFI via `eeg-ffi`, with native camera + MediaPipe feeding samples.
- Keep camera + MediaPipe outside WASM (browser/native APIs).

## Quality, calibration, and uncertainty
- Always publish a signal quality index (SQI).
- Require per-user baseline (60-120s) for proxies.
- Emit confidence or prediction intervals for proxy metrics.
- Gate app behavior on SQI and confidence.

## Benchmarking plan
- Use pyVHR offline for algorithm validation and regression tests.
- Compare HR error under motion, lighting, and elevated HR.
- Use strict splits (leave-one-subject/context out).

## Implementation notes for this repo
- Add `crates/rppg` (or extend `crates/eeg-signal` with rPPG DSP).
- Expose `RppgPipeline` to `crates/rppg-wasm` (or `crates/eeg-wasm`) and `crates/eeg-ffi`.
- Provide a TS wrapper (`packages/rppg-web`) for FrameSource + RppgProcessor interfaces.
