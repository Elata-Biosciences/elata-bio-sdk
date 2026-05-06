# rPPG Implementation Plan

Status: mostly implemented for the original Rust/WASM/browser rPPG scope; the
active roadmap is now quality, multi-ROI signal construction, validation, and
optional learned waveform reconstruction. Browser apps should prefer
**`createRppgSession()`** per package README. This plan still includes historical
crate and lower-level milestones for context.

This is a planning document with some historical checkpoints. For the current
repo state, treat `crates/elata-rppg-wasm`, `crates/elata-rppg-ffi`, `packages/rppg-web`,
and `run.sh` as the source of truth.

## Scope
Deliver a hybrid system: cross-device rPPG DSP core in Rust with WASM/FFI
bindings, plus a TypeScript abstraction for browser capture pipelines
(MediaPipe FaceMesh, fallback frame sources, lifecycle helpers, diagnostics, and
consumer-facing session APIs). Optional JS fallbacks can exist for web-only use.

## Phase 0: Ground truth + baselines
- [x] Identify target output metrics: `bpm`, `confidence`, `signal_quality`,
  agreement/debug evidence, and quality reason codes.
- [~] Select baseline algorithms to port.
  - Implemented: POS-style RGB pipeline, temporal normalization, Welch/SNR,
    harmonic checks, autocorrelation/peaks/Bayesian helpers in the TS layer.
  - Planned: CHROM and GREEN/GRGB as first-class Rust-side candidate views for
    multi-ROI fusion.
- [ ] Capture or curate small internal test clips for regression.

## Phase 1: Rust DSP core
- [x] Create `crates/elata-rppg` (or extend `crates/elata-eeg-signal`).
- Port DSP blocks from the existing reference implementation:
  - [x] Temporal normalization.
  - [x] Bandpass filter (0.7-4.0 Hz).
  - [x] Periodogram HR estimator + harmonic checks (basic implementation).
  - [x] Autocorrelation HR fallback.
- [x] Implement `RppgPipeline` with windowed buffering and quality gating (basic `get_metrics`).
- [x] Add unit tests that mirror reference implementation expectations (buffering, DSP units, HR estimator, SQI).

## Phase 2: WASM + FFI bindings
- [x] Expose `RppgPipeline` through dedicated `crates/elata-rppg-wasm`. Compatibility constructors also remain available from `crates/elata-eeg-wasm`.
- [x] Add JS/WASM API:
  - `new WasmRppgPipeline(sample_rate, window_sec)` (implemented).
  - `push_sample(timestamp, intensity)` for compatibility.
  - `push_sample_rgb(timestamp, r, g, b, skin_ratio)` for RGB ingestion.
  - `push_sample_rgb_meta(timestamp, r, g, b, skin_ratio, motion, clip)` for
    quality-aware ingestion.
  - `enable_tracker(min_bpm, max_bpm, num_particles)` compatibility hook.
  - `get_metrics()` returning serialized metrics JSON.
- [~] Expose the same API through dedicated `crates/elata-rppg-ffi`.
  - Dedicated FFI currently exposes intensity ingestion and compact metrics.
  - Compatibility `RppgPipelineFFI` remains available via `crates/elata-eeg-ffi`
    for shared SDK consumers.

- [x] Add `crates/elata-rppg-wasm` (thin, feature-specific wrapper crate).
- [x] Add `crates/elata-rppg-ffi` (thin, feature-specific wrapper crate).

## Phase 2.5: Web wrapper package
- [x] Scaffold `packages/rppg-web` as a TS wrapper around WASM outputs. (estimator, demo, FrameSource, wasm loader implemented)
- [x] Add a sync step / build step to copy generated wasm JS/.wasm into the wrapper package demo (`packages/rppg-web/scripts/build-demo.mjs` + CI job).
- [x] Export a stable init helper and re-export WASM APIs (in-repo demo uses `initDemo` + `wasmBackend`; **consumer apps use `createRppgSession()`** and related session helpers).

## Phase 3: TS abstraction layer (hybrid)
- [x] Implement interfaces:
  - `FrameSource` (MediaPipe web + native bridge) (implemented in
    `packages/rppg-web/src/mediaPipeFrameSource.ts` and
    `packages/rppg-web/src/mediaPipeFaceFrameSource.ts`).
  - `RppgProcessor` (WASM/FFI wrapper) (implemented in `packages/rppg-web`).
- [x] Provide reference web frame sources and demo runner paths for browser
  capture, fallback ROI sampling, and FaceMesh ROI sampling.
- [x] Add normalized WASM loading, graceful unavailable-backend behavior,
  diagnostics, errors, lifecycle helpers, and consumer session wrappers.
- [x] Add app-facing helpers (`createRppgSession()`,
  `createManagedRppgSession()`, `createRppgAppAdapter()`, and
  `createRppgAppMonitor()`).
- [x] Optional JS-side estimator/fallback paths exist for rapid iteration and
  diagnostics.

## Phase 4: Quality + calibration
- [x] Add signal quality index (SQI) for gating.
- [~] Add baseline calibration and user-relative metrics.
  - Implemented: rolling baseline BPM, baseline delta, online camera
    calibration model, calibration reset/snapshot behavior, and gating support.
  - Still planned: explicit user-facing calibration flow and guidance.
- [~] Expose confidence/probabilistic outputs.
  - Implemented: confidence scalar, agreement score, Bayesian tracker fields,
    winning sources, alias flag, and low-quality reason codes.
  - Still planned: formal confidence intervals and calibration reports.

## Phase 4.5: Multi-ROI waveform construction

Detailed design note:
[rppg-multi-roi-learned-reconstruction.md](rppg-multi-roi-learned-reconstruction.md).

Context: the current browser capture path can emit face sub-ROIs, but
`DemoRunner` merges them into one RGB sample before the Rust core sees them.
The Rust pipeline therefore computes SNR and quality on the already-merged
waveform rather than selecting or weighting regions by their own signal quality.

This phase keeps multiple weak rPPG views alive longer so the Rust/WASM core can
reject noisy regions before they corrupt the aggregate signal.

Reference paper: Rodrigo Castellano Ontiveros, Mohamed Elgendi, and Carlo Menon,
"A machine learning-based approach for constructing remote photoplethysmogram
signals from video cameras," Communications Medicine 4, 109 (2024),
https://doi.org/10.1038/s43856-024-00519-6.

- [ ] Add a `MultiRoiRppgPipeline` in `crates/elata-rppg`.
  - Input: timestamp plus compact per-region RGB samples and metadata.
  - Start with 3 regions matching the existing forehead / left cheek / right
    cheek ROIs.
  - Keep the API extensible for 30 MediaPipe landmark patches:
    10 forehead, 10 left cheek, 10 right cheek.
- [ ] Update the web frame path to optionally emit named ROI samples instead of
  only a merged RGB sample.
  - Preserve the existing merged path for compatibility and fallback.
  - Keep camera, canvas, and MediaPipe execution in TypeScript.
  - Send only compact RGB/stat samples into WASM, not video pixels.
- [ ] Add per-region rolling buffers in Rust.
  - Track RGB traces, skin ratio, clipping, motion, variance, and freshness.
  - Compute lightweight region quality continuously.
  - Compute heavier spectral quality/SNR on a cadence, e.g. once per second,
    not every frame.
- [ ] Add classical candidate signals per region or region group.
  - POS first, matching the current Rust pipeline.
  - Add CHROM and GREEN/GRGB baselines as cheap additional views.
  - Consider LGI/ICA only after the POS+CHROM ensemble is measured.
- [ ] Add deterministic fusion before BPM estimation.
  - Weight regions by skin ratio, clipping, motion, variance, SNR, peak
    sharpness, and agreement with neighboring regions.
  - Fall back to current aggregate behavior during warmup or low evidence.
  - Output a reconstructed waveform plus diagnostics.
- [ ] Extend metrics and diagnostics.
  - Include per-region quality, winning regions, dropped regions, region SNR,
    and candidate-method agreement.
  - Keep the public app-facing API simple; expose detailed diagnostics through
    the existing diagnostics/debug surfaces.
- [ ] Validate against current aggregate pipeline.
  - Compare BPM stability, null-window rate, low-SNR rate, and confidence
    calibration.
  - Include motion/talking/rotation clips, not only steady clips.

Expected benefit: small in ideal frontal lighting, but meaningful when one face
region is corrupted by shadow, glare, hair, partial face turn, talking, or
localized motion. The main target is fewer bad windows and fewer confidently
wrong estimates, not only higher average SNR.

## Phase 4.6: Learned reconstruction and distilled low-latency models

Detailed design note:
[rppg-multi-roi-learned-reconstruction.md](rppg-multi-roi-learned-reconstruction.md).

The paper's strongest idea is to train against contact PPG to reconstruct a
cleaner PPG-like waveform, while using classical rPPG methods as inputs. We can
use that idea without running a large model in the browser.

The recommended shape is an offline teacher/student workflow:

- [ ] Build an offline training harness outside the runtime hot path.
  - Use public datasets such as PURE, LGI-PPGI, and MR-NIRP where licensing
    permits.
  - Generate training features with the same Rust code used in production:
    per-region POS, CHROM, GREEN/GRGB, quality, motion, clipping, and SNR.
  - Align contact PPG and rPPG windows with cross-correlation or DTW for
    training/evaluation, while keeping runtime inference causal.
- [ ] Train a larger "teacher" model in the background.
  - The teacher can be Python/PyTorch or TensorFlow and does not need to run in
    WASM.
  - It can use non-causal context, more features, and slower evaluation.
  - Objective: reconstruct normalized PPG morphology, not only BPM.
- [ ] Distill to a small causal "student" model for production.
  - Prefer a tiny temporal convolution network, causal 1D conv stack, or small
    GRU over a full LSTM.
  - Inputs should be compact candidate signals and quality features, not image
    frames.
  - Output either a reconstructed waveform sample or fusion weights over
    classical candidates.
  - Target low-latency inference on a sliding window with incremental state.
- [ ] Export student weights into Rust.
  - Start with static `f32` arrays and hand-written inference for the chosen
    small architecture.
  - Keep ONNX or tract/candle integration as an optional later step only if the
    hand-written model becomes hard to maintain.
  - Quantize to `f16`/int8 only after accuracy is measured.
- [ ] Gate learned output behind deterministic quality checks.
  - If the learned model is uncertain, stale, or out of distribution, fall back
    to deterministic POS/CHROM fusion.
  - Expose model version, feature schema version, and fallback reason in
    diagnostics.
- [ ] Evaluation requirements before enabling by default.
  - Leave-one-subject and leave-one-dataset validation.
  - Separate reports for rest, talking, translation, rotation, and exercise.
  - Metrics: BPM error, null-window rate, confidence calibration, Pearson `r`,
    RMSE after alignment, DTW, and waveform periodicity.

This gives us a practical background-model path: train expensive teacher models
offline, then ship a small distilled student inside Rust/WASM for low latency.
The first production student should be modest enough that inference cost is
smaller than canvas capture and MediaPipe face tracking.

## Phase 5: Optional fusion / sentiment
- [ ] Keep non-rPPG proxy/fusion work modular and outside the consumer rPPG
  happy path.
- [ ] Define feature schemas only when a concrete product surface needs them.
- [ ] Ensure any proxy outputs are labeled as wellness/research signals, not
  clinical diagnostics.

## Phase 6: Validation
- Compare Rust outputs vs reference implementation and pyVHR baselines on the same clips.
- Stress test across lighting/motion conditions.
- Enforce leave-one-subject/context evaluation for any learned model.
- For learned reconstruction, evaluate waveform quality separately from BPM so
  HR-only optimization does not erase morphology useful for HRV or future
  physiological features.

## Deliverables
- [x] `crates/elata-rppg` with tests.
- [x] WASM + FFI bindings for `RppgPipeline` (wrappers and build + wasm-bindgen integration in CI).
- [x] `packages/rppg-web` wrapper for the WASM bindings (includes WASM loader,
  session helpers, app adapter/monitor helpers, demo page, packaging script, and
  consumer smoke coverage).
- [x] TS abstraction layer + web demo (MediaPipe frame sources, estimator,
  demo runner, diagnostics, Jest coverage, and optional Playwright E2E).
- [~] Quality/calibration guidance in docs (basic guidance exists; explicit
  calibration flow planned).
- [ ] Multi-ROI Rust/WASM pipeline and diagnostics.
- [ ] Offline learned reconstruction harness and distilled low-latency runtime
  model, if validation justifies it.

## Success criteria
- Stable BPM within acceptable error on public/internal clips across rest,
  talking, translation, rotation, and moderate motion.
- Consistent outputs across web/iOS/Android.
- Clear quality/confidence gating in APIs.
- Consumer browser integrations should start from `createRppgSession()` or
  `createRppgAppAdapter()` rather than raw generated WASM constructors.

## Development workflow (TDD & incremental commits)
- Follow TDD: write failing unit tests for each algorithm/component, then implement to pass tests.
- Commit frequently with focused messages:
  - `rppg: add crate scaffold and tests` (initial scaffold) ✅
  - `rppg: implement RppgPipeline buffering and mean test` ✅
  - `rppg: add bandpass filter and passing HR estimator tests` ✅
  - `rppg: add temporal normalization and FIR bandpass; tests` ✅
  - `rppg: add SQI, ACF fallback; improve filter & metrics; tests` ✅
- Milestone 1: Add `crates/elata-rppg` with tests for buffering and basic metrics. ✅
- Milestone 2: Port temporal normalization and bandpass filter, add unit tests. ✅
- Milestone 3: Add periodogram & ACF fallback tests and implementation. ✅
- Milestone 4: Expose `RppgPipeline` through dedicated WASM and FFI crates, plus compatibility bindings in `crates/elata-eeg-wasm` and `crates/elata-eeg-ffi`, and add integration tests. ✅
- [x] CI: Run `cargo test` and `npm test` (for TS wrappers) on PRs (GitHub Actions CI workflow added).

## Progress & next steps
- Completed: core DSP units, `RppgPipeline`, SQI, RGB/meta ingestion, WASM
  loader, `RppgProcessor`, session lifecycle helpers, diagnostics, app adapter,
  gating, online calibration/baseline tracking, and package tests. ✅
- Current source of truth for consumer integration: `packages/rppg-web/README.md`
  and `docs/guides/using-rppg-in-a-browser-app.md`.
- Next (TDD): implement the multi-ROI feature path behind an opt-in API, starting
  with 3 named regions, per-region buffers, deterministic quality weighting, and
  diagnostics before adding 30-patch landmark sampling or learned reconstruction.
