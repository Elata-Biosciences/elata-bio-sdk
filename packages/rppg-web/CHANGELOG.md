# Changelog

## 0.15.0

### Minor Changes

- bf1d588: Add versioned ROI geometry and pixel-sampling profiles, including frozen TradeLock replay and MCD model-input contracts.
- 62fac24: Add `shouldDeclareNoFrame`, the correct zero-frames-ever check for a consumer
  deciding whether to tear down and reacquire a video element that has no
  decodable frame right now.

  `pastStartupGrace` alone (the function this module's own doc comment
  previously pointed a zero-frame caller at) gates on elapsed time only, but
  `startedAt` never moves once a real frame lands, so `pastStartupGrace` stays
  true for the rest of the session once the grace period clears. A single
  missed `readyState`/`videoWidth` tick anytime after that, even deep into an
  otherwise-healthy reading, was therefore indistinguishable from a camera that
  never started at all, and forced a mid-reading reacquire off `pastStartupGrace`
  by itself.

  `shouldDeclareNoFrame` additionally requires `liveness.signature` to still be
  `null` (no frame has EVER been sampled this session), the one condition that
  actually holds for "never started" and not for "started fine, one bad tick."
  Found independently in both consumer forks of this module (peak-app,
  vitality-app) before either had migrated onto this package; landing the fix
  here means neither fork (nor a future one) inherits it a third time.

- 8d02c63: Add the reliability-gating surface: `trustedHrvSample`, `calibrationStage`,
  camera-frozen-frame detection (`initialLiveness`/`observeFrame`/etc.),
  `landmarkMotion`, and `fitExposureResponse`. Extracted from three independent
  consumer apps (peak-app, vitality-app, neural-chat-app) that had each been
  hand-copying and re-drifting this exact logic. See elata-bio-sdk#24/#26/#405.

  Deliberately excludes display copy and CSS tone classes (`CALIBRATION_LABEL`,
  `calibrationLabelTone`, `signalTier`'s tone field): each app's own framing
  (work vs. recovery vs. chat) genuinely differs and stays app-owned.

- 3560030: Add gated waveform morphology, baseline-normalized physiology features, and a
  generic policy-free physiology interpreter.
- b3650d6: Add model-neutral waveform windows, diagnostic reconstructor contracts,
  non-blocking orchestration, typed failure diagnostics, aligned input windows,
  and restart-safe model cleanup.
- 328b33b: Add validated Bayesian tracker configuration, provenance, an opt-in estimator-ambiguity penalty, and a bounded evidence-quality provider extension.

### Patch Changes

- de8ee0d: Document `DisplayBpmTracker`/`hold()` as deprecated. `hold()` keeps a display
  value alive on a cycle the caller has already deemed untrustworthy, which is
  the exact holdover pattern `resolveDisplayMetrics` exists to make
  structurally impossible (elata-bio-sdk#24, neural-chat-app#10,
  elata-bio-sdk#27). No current consumer uses this class; use
  `resolveDisplayMetrics` for a production display-trust decision instead. No
  behavior change.
- 14ac8c8: Fix `MultiRoiRppgFuser` weighting each ROI's already-CHROM-filtered pulse
  signal by that signal's own spectral SNR. Chari et al. ("Diverse R-PPG")
  benchmarked this exact construction and found it increases skin-tone bias
  relative to plain unweighted spatial averaging, because darker skin's lower
  reflected light lowers post-processing SNR for a camera-noise reason
  unrelated to signal quality, not a biophysical one. SNR-driven weighting now
  happens in RGB-space (blend the raw per-ROI RGB averages first, then run one
  shared CHROM + bandpass pipeline on the blend) instead of after independently
  filtering each region.
- dfdb33f: Add `resolveDisplayMetrics(snapshot)`, the single stateless decision for
  "what BPM/HRV should this app show right now", a pure snapshot-in,
  decision-out mapping with no accumulator to hold a stale value past the
  point the SDK's own gating says a reading is no longer trustworthy.
  Extracted after three independent consumer apps each wrote their own
  version of this decision and at least two got it wrong the same way
  (elata-bio-sdk#24, neural-chat-app#10, peak-app#404/#408).

  `bpm` is gated by `canPublish`/`publishBpm`. `hrvRmssd` composes that gate
  with the stricter, HRV-specific `trustedHrvSample` (elata-bio-sdk#28):
  beat-to-beat timing is far more fragile than an average rate, so a sample
  can clear the BPM gate and still carry a garbage HRV figure.

- 9775aa5: Keep video-frame timestamps in one monotonic clock domain so a live stream's
  initial zero `mediaTime` cannot invalidate the rPPG quality window.

## 0.3.0

### Minor Changes

- Improve HRV accuracy with sub-sample peak interpolation. `detectPeaks` now
  refines each peak to sub-sample precision via parabolic interpolation
  (`refinePeakByInterpolation`), removing the sample-grid quantization that
  previously swamped beat-to-beat RMSSD. `rmssdFromPeaks` additionally rejects
  physiologically implausible and ectopic NN intervals, and a new
  `cleanNnIntervalsMs` helper exposes the artifact-rejected NN series so SDNN and
  mean NN use the same cleaned data. `ppg-web` consumes the cleaned intervals for
  its time-domain HRV metrics.

### Patch Changes

- d1615d6: Ship `llms.txt` in each published package for AI/tooling context, include the
  scaffolder README in the npm tarball, and add concise TSDoc on primary entry
  points so declarations surface in IDEs and `.d.ts` consumers.
- 7fed52d: Normalize `initEegWasm()` inputs onto the non-deprecated wasm-bindgen init
  shape, add a smoke test for the low-level rPPG pipeline wrapper, align the
  scaffolded rPPG demo with `createRppgSession()`, harden the browser rPPG runner
  to fail closed after fatal backend errors instead of reusing a broken WASM
  pipeline, and clarify that browser apps should prefer the session wrapper over
  raw generated WASM exports.

All notable changes to `@elata-biosciences/rppg-web` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2024-01-01

### Added

- Initial public release of the rPPG TypeScript wrapper.
- `RppgProcessor` with WASM backend delegation.
- `MuseCalibrationModel` and `MuseFusionCalibrator` for BPM estimation.
- `museStyleFilter` bandpass filter.
- `DemoRunner` for quick prototyping.
- `MediaPipeFrameSource` and `MediaPipeFaceFrameSource` for face ROI capture.
- `loadFaceMesh` helper for MediaPipe initialization.
- `averageGreenInROI` pixel-level utility.
