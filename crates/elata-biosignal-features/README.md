# elata-biosignal-features

Deterministic, versioned window-feature extraction for Elata's local biosignal
analytics. Builds on the DSP primitives in `elata-eeg-signal` (FFT, power
spectrum) and adds:

- `spectral`: scipy-compatible Welch PSD (`welch_psd@1`), spectral entropy
  (`spectral_entropy@1`), dominant frequency (`dominant_frequency@1`),
  prominence-qualified alpha peak (`alpha_peak@2`).
- `eeg`: absolute/relative/log band powers integrated from the shared PSD
  (`eeg_band_power@2`) and Hjorth activity/mobility/complexity (`hjorth@1`).
- `statistics`: window mean/RMS/variance/std/peak-to-peak (`window_stats@1`).
- `quality`: flatline/clipped/extreme-amplitude fractions plus a line-noise
  ratio from the same PSD (`eeg_quality_flags@1`).
- `analyzer::EegWindowAnalyzer`: one coarse call per window computing all of
  the above per channel, returning the serde-backed `EegWindowFeaturesV1`
  (camelCase JSON) with `configId` + `algorithmVersions` provenance.

Parity with Python oracles (numpy/scipy) is enforced by
`tests/golden_parity.rs` against the golden fixtures under
`packages/biosignal-analytics/fixtures/`.

Not published to crates.io yet (`publish = false`); consumed by
`elata-biosignal-features-wasm` and, through it, the
`@elata-biosciences/biosignal-analytics` npm package.
