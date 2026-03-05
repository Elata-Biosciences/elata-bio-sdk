# Sentiment Analysis Implementation Plan

Status: In progress

## Scope
Extract facial sentiment logic from the existing reference implementation into a reusable, platform-agnostic module that
consumes face landmarks and emits calibrated labels plus quality signals.

## Phase 0: Baseline definition
- Confirm output labels: `Neutral|Happy|Stressed|Surprised|Focused|Fatigue`.
- Decide required outputs: label, confidence, feature deltas, acute stress counter.
- Lock thresholds from the reference implementation or define configuration knobs.

## Phase 1: Core sentiment module (pure logic)
- Create a pure module (TS preferred) that accepts:
  - Landmarks or precomputed metrics (smile, browHeight, browDistance, eyeOpenness).
  - Calibration state and optional baseline.
- Implement:
  - Feature normalization (scale by inter-eye distance).
  - Baseline calibration buffer + averaging.
  - Rolling history smoothing (last ~15 samples).
  - Acute stress detection (brow distance drop or brow height spike).
  - Label classification thresholds.
- Export a small API:
  - `update(landmarks, timestamp)` -> `SentimentResult`
  - `startCalibration()` / `finalizeCalibration()`
  - `reset()`

## Phase 2: MediaPipe adapter
- Build a `MediaPipeSentimentAdapter` that:
  - Owns camera + FaceMesh.
  - Emits `SentimentInput` frames to the core module.
  - Emits `SentimentResult` to app listeners.
- Handle face-not-found cases with a quality flag.

## Phase 3: Integration hooks
- Wire output into stress/tilt models (same as the reference implementation):
  - Use `Stressed`/`Surprised`/`Fatigue` as soft risk cues.
  - Expose acute stress counter for panic detection.

## Phase 4: Tests + fixtures
- Capture representative landmark fixtures (neutral, smile, brow furrow, fatigue).
- Unit test:
  - Baseline calibration stability.
  - Label classification thresholds.
  - Acute stress counter behavior.
- Compare outputs to the current reference implementation behavior.

## Phase 5: Optional WASM path
- Only if needed: port the pure core to Rust and expose via WASM/FFI.
- Keep adapters in JS/native and feed landmarks to WASM.

## Deliverables
- Pure sentiment core module.
- MediaPipe adapter and sample usage.
- Test fixtures + unit tests.
- Docs and examples.
- Optional web wrapper package if distributed alongside WASM APIs.
