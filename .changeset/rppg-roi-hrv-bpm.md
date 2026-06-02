---
"@elata-biosciences/rppg-web": minor
---

Add multi-ROI fusion, Hilbert-phase HRV, and a no-reference BPM display guard.

- **ROIs**: new `MultiRoiRppgFuser` (+ `FUSION_ROIS`, `spectralSnr`) runs CHROM +
  bandpass independently on forehead and both cheeks and blends them by in-band
  spectral SNR, so glare/hair/occlusion on any one region no longer poisons the
  estimate. Exposes per-ROI weights and a fused-signal SNR for gating display.
- **HRV**: new `detectBeatsViaHilbertPhase` estimates beat instants from the
  analytic-signal phase (continuous-time 2π crossings) instead of frame-grid
  peak argmax, yielding a steadier beat-to-beat RMSSD; `computeRmssdMs` computes
  RMSSD directly from an inter-beat-interval series. Adds reusable `Bandpass`
  (streaming) and `zeroPhaseBandpass` (filtfilt) primitives.
- **BPM**: new `applyNoReferenceDisplayGuard` keeps the readout off pulse
  harmonics when there is no reference lock, while letting a genuine octave
  recovery through when two independent estimators corroborate it
  (`cluster_corroborated_jump`).
