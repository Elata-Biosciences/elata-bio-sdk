---
"@elata-biosciences/rppg-web": minor
---

Wire multi-ROI rPPG fusion into the live pipeline (on by default).

`MultiRoiRppgFuser` existed but nothing used it — the runtime sampled the
forehead/cheek sub-ROIs and **averaged them into one RGB**, then ran a single
CHROM. Now, when sub-ROIs and the skin mask are available (face-mesh mode), the
runner runs CHROM + bandpass independently per region and blends them by in-band
spectral SNR, so glare/hair/glasses-glint/partial occlusion on any one region no
longer poisons the estimate.

- `DemoRunner` gains `multiRoiFusion` (default `true`; flows through
  `createRppgSession`/`createManagedRppgSession`). It feeds the fused pulse via a
  new `RppgProcessor.pushFusedSample(ts, value, snr)`, which routes the fused
  signal to spectral BPM/HRV and uses the fuser's in-band SNR as `signal_quality`
  (the backend CHROM and its RGB-derived quality are bypassed in this path).
- Falls back to the previous aggregated-ROI path when sub-ROIs are unavailable
  (video-frame mode) or when `multiRoiFusion: false`.
- New runner diagnostics: `framesWithFusion`, `lastFusionWeights` (per-region,
  SNR-driven, sum to 1), `lastFusedSnr`, and `lastProcessorMethod: 'fused'`.
