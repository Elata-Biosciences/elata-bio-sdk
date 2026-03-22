# DS004514 Variant Summary

Status: Active

## Purpose

This note summarizes the real fNIRS raw variants observed in `DS004514` and the paired waveform smoke artifacts now available for each variant.

Related files:

- [ds004514-fnirs-waveform-smoke.md](ds004514-fnirs-waveform-smoke.md)
- [ds004514-cross-modal-waveform-smoke.md](ds004514-cross-modal-waveform-smoke.md)
- [../../reports/cross_modal/ds004514/ds004514_fnirs_waveform_metrics.json](../../reports/cross_modal/ds004514/ds004514_fnirs_waveform_metrics.json)

## Observed raw variants

Variant A:

- fNIRS channels: `28`
- sampling rate: `7.8125 Hz`
- paired smoke subjects: `sub-01` train, `sub-03` eval
- paired tensor shape: `360 x 28 x 78`

Variant B:

- fNIRS channels: `22`
- sampling rate: `8.928571 Hz`
- paired smoke subjects: `sub-10` train, `sub-11` eval
- paired tensor shape: `360 x 22 x 89`

## Subject grouping

`28`-channel / `7.8125 Hz` group:

- `sub-01`
- `sub-02`
- `sub-03`
- `sub-04`
- `sub-05`
- `sub-06`

`22`-channel / `8.928571 Hz` group:

- `sub-07`
- `sub-08`
- `sub-09`
- `sub-10`
- `sub-11`
- `sub-12`

## Quality note

Likely low-quality fNIRS subjects from the waveform smoke pass:

- `sub-05`
- `sub-12`

Borderline but not automatically excluded:

- `sub-04`
- `sub-09`

## Practical implication

`DS004514` is now proven workable for:

- sidecar-level alignment across all subjects
- raw fNIRS waveform processing across all subjects
- raw EEG waveform processing on laptop-safe subsets
- paired waveform generation inside each fNIRS variant

The remaining normalization problem is narrower:

- unify or route across the `28`-channel and `22`-channel cohorts
- decide whether to keep poor-quality subjects as stress-test cases or exclude them from baseline training

## Recommended next engineering move

Implement one of these explicitly:

1. variant-routed baselines:
   train and evaluate separate models or heads per fNIRS variant
2. geometry-aware canonicalization:
   map both variants into a shared optode/region token space before the model

For speed, the first option should come first.
