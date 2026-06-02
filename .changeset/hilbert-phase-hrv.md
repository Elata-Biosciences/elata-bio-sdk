---
"@elata-biosciences/rppg-web": minor
---

Use Hilbert-phase beat timing for the pipeline's HRV output. `analyzePulseWindow`
(and therefore `hrvRmssd` / the processor's `hrv_rmssd`) now derives RMSSD from
the continuous-time analytic-signal phase crossings of
`detectBeatsViaHilbertPhase` — sub-frame accurate and centered on the detected
rate to reject the half-rate sub-harmonic — instead of frame-grid peak picking.
It falls back to the peak-based RMSSD when the analytic phase can't resolve
enough beats, and both paths reuse `rmssdFromPeaks`' ectopic-interval rejection,
so only the beat-timing source changes. A benchmark on synthetic HRV signals
showed Hilbert-phase RMSSD is the most accurate of the three methods
(peak-raw → parabolic → Hilbert).
