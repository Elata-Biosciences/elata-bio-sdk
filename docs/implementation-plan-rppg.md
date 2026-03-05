# rPPG + Ocular Proxy Implementation Plan

Status: In progress

## Scope
Deliver a hybrid system: cross-device rPPG DSP core in Rust with WASM/FFI bindings, plus a thin TS abstraction for capture pipelines (MediaPipe and native). Optional JS fallbacks can exist for web-only use. Optional fusion/sentiment remains modular.

## Phase 0: Ground truth + baselines
- Identify target output metrics: `bpm`, `confidence`, `signal_quality`, optional `fatigue_index`.
- Select baseline algorithms to port (POS/CHROM/GREEN + temporal normalization + ACF).
- Capture or curate small internal test clips for regression.

## Phase 1: Rust DSP core
- [x] Create `crates/rppg` (or extend `crates/eeg-signal`).
- Port DSP blocks from the existing reference implementation:
  - [x] Temporal normalization.
  - [x] Bandpass filter (0.7-4.0 Hz).
  - [x] Periodogram HR estimator + harmonic checks (basic implementation).
  - [x] Autocorrelation HR fallback.
- [x] Implement `RppgPipeline` with windowed buffering and quality gating (basic `get_metrics`).
- [x] Add unit tests that mirror reference implementation expectations (buffering, DSP units, HR estimator, SQI).

## Phase 2: WASM + FFI bindings
- [x] Expose `RppgPipeline` from `crates/eeg-wasm` (wrapper added; tests passing on native target).
- [x] Add minimal JS API:
  - `new RppgPipeline(sample_rate, window_sec)` (WASM wrapper constructor implemented)
  - `push_sample(timestamp, intensity)` (implemented)
  - `get_metrics()` or `on_metric(cb)` (returns JSON string; will add `on_metric` event later)
- [x] Expose the same API via `crates/eeg-ffi` for native apps (FFI wrapper added; UniFFI bindings present in demo projects).

- [x] Add `crates/rppg-wasm` (thin, feature-specific wrapper crate).
- [x] Add `crates/rppg-ffi` (thin, feature-specific wrapper crate).

## Phase 2.5: Web wrapper package
- [x] Scaffold `packages/rppg-web` as a TS wrapper around WASM outputs. (estimator, demo, FrameSource, wasm loader implemented)
- [x] Add a sync step / build step to copy generated wasm JS/.wasm into the wrapper package demo (`packages/rppg-web/scripts/build-demo.mjs` + CI job).
- [x] Export a stable init helper and re-export WASM APIs (see `initDemo` + `wasmBackend` loader).

## Phase 3: TS abstraction layer (hybrid)
- [x] Implement interfaces:
  - `FrameSource` (MediaPipe web + native bridge) (implemented: `packages/rppg-web/src/mediaPipeFrameSource.ts`).
  - `RppgProcessor` (WASM/FFI wrapper) (implemented in `packages/rppg-web`).
- [x] Provide a reference `MediaPipeFrameSource` for web (demo uses getUserMedia + ROI averaging as a reference implementation).
- [x] Optional: JS-only fallback `RppgProcessor` that mirrors the Rust API for rapid iteration (demo estimator + JS backend provided).
- [x] Add a demo adapter that averages ROI RGB → intensity samples (added `packages/rppg-web/demo/index.html`).
- [x] Integrate MediaPipe-based face/ROI tracking (MediaPipe FaceMesh + ROI-aware runner).

## Phase 4: Quality + calibration
- [x] Add signal quality index (SQI) for gating.
- [ ] Add baseline calibration flow (60-120s) and user-relative metrics. (next priority — TDD test + UI flow)
- [~] Expose confidence intervals or probabilistic outputs (basic `confidence` scalar implemented; full CI planned).

## Phase 5: Optional fusion / sentiment
- Define a feature schema for ocular + rPPG inputs.
- Integrate a lightweight model (ONNX or JS) behind `SentimentProvider`.
- Ensure outputs are labeled as proxies (not clinical EEG).

## Phase 6: Validation
- Compare Rust outputs vs reference implementation and pyVHR baselines on the same clips.
- Stress test across lighting/motion conditions.
- Enforce leave-one-subject/context evaluation for any learned model.

## Deliverables
- [x] `crates/rppg` with tests.
- [x] WASM + FFI bindings for `RppgPipeline` (wrappers and build + wasm-bindgen integration in CI).
- [x] `packages/rppg-web` wrapper for the WASM bindings (includes wasm loader, `initDemo`, demo page, and packaging script).
- [x] TS abstraction layer + web demo (MediaPipe FrameSource, estimator, demo runner, Playwright E2E).
- [~] Quality/calibration guidance in docs (basic guidance exists; calibration flow planned).

## Success criteria
- Stable BPM within acceptable error on internal clips.
- Consistent outputs across web/iOS/Android.
- Clear quality/confidence gating in APIs.

## Development workflow (TDD & incremental commits)
- Follow TDD: write failing unit tests for each algorithm/component, then implement to pass tests.
- Commit frequently with focused messages:
  - `rppg: add crate scaffold and tests` (initial scaffold) ✅
  - `rppg: implement RppgPipeline buffering and mean test` ✅
  - `rppg: add bandpass filter and passing HR estimator tests` ✅
  - `rppg: add temporal normalization and FIR bandpass; tests` ✅
  - `rppg: add SQI, ACF fallback; improve filter & metrics; tests` ✅
- Milestone 1: Add `crates/rppg` with tests for buffering and basic metrics. ✅
- Milestone 2: Port temporal normalization and bandpass filter, add unit tests. ✅
- Milestone 3: Add periodogram & ACF fallback tests and implementation. ✅
- Milestone 4: Expose `RppgPipeline` to `crates/eeg-wasm` and `crates/eeg-ffi`, add integration tests. ✅ (WASM build, FFI wrapper tests added; Playwright E2E added)
- [x] CI: Run `cargo test` and `npm test` (for TS wrappers) on PRs (GitHub Actions CI workflow added).

## Progress & next steps
- Completed: core DSP units, `RppgPipeline`, SQI, periodogram with interpolation, ACF fallback, and unit tests (see commits above). ✅
- Next (TDD): Add failing integration tests for WASM and FFI exports, then implement the bindings in `crates/eeg-wasm` and `crates/eeg-ffi`. 🚀
