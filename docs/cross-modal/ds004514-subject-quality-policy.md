# DS004514 Subject Quality Policy

Status: Active

## Purpose

This note makes the current `DS004514` subject-quality policy explicit and machine-readable.

Related files:

- [../../configs/cross_modal/ds004514_subject_quality_policy.json](../../configs/cross_modal/ds004514_subject_quality_policy.json)
- [ds004514-variant-summary.md](ds004514-variant-summary.md)
- [../../reports/cross_modal/ds004514/ds004514_fnirs_waveform_metrics.json](../../reports/cross_modal/ds004514/ds004514_fnirs_waveform_metrics.json)

## Policy tiers

Default train/eval pool:

- `sub-01`
- `sub-02`
- `sub-03`
- `sub-04`
- `sub-06`
- `sub-07`
- `sub-08`
- `sub-09`
- `sub-10`
- `sub-11`

Borderline review:

- `sub-04`
- `sub-09`

Stress-test only:

- `sub-05`
- `sub-12`

## Interpretation

- `default_train_eval` is the default cohort for early baselines and comparisons
- `borderline_review` subjects are still usable, but their per-subject metrics should always be broken out explicitly
- `stress_test_only` subjects should not enter default training runs unless the experiment is about robustness, denoising, or artifact correction

## Why this is explicit now

The repo already had enough evidence to stop treating this as an open question:

- waveform metrics identify `sub-05` and `sub-12` as clearly poor-quality fNIRS cases
- `sub-04` and `sub-09` are materially weaker than the clean cohort but not bad enough for automatic exclusion

The remaining work is no longer policy definition. It is deciding whether future preprocessing or denoising can promote any of these subjects back into the default pool.
