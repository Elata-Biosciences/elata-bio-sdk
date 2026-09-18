# Changelog

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
