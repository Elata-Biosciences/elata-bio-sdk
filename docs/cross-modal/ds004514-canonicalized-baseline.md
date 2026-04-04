# DS004514 Canonicalized Baseline

Status: Active

## Purpose

This path provides the direct comparison to the variant-routed baseline.

It builds one shared cross-variant target space from the real channel overlap across:

- `sub-01`
- `sub-03`
- `sub-10`
- `sub-11`

and then trains a single EEG-to-fNIRS baseline across both variants.

Related files:

- [../../configs/cross_modal/ds004514_cross_modal_canonicalized.toml](../../configs/cross_modal/ds004514_cross_modal_canonicalized.toml)
- [../../scripts/cross_modal/build_ds004514_cross_modal_canonicalized.py](../../scripts/cross_modal/build_ds004514_cross_modal_canonicalized.py)
- [../../configs/cross_modal/ds004514_canonicalized_baseline.toml](../../configs/cross_modal/ds004514_canonicalized_baseline.toml)
- [../../scripts/cross_modal/train_ds004514_canonicalized_baseline.py](../../scripts/cross_modal/train_ds004514_canonicalized_baseline.py)
- [../../configs/cross_modal/ds004514_subject_quality_policy.json](../../configs/cross_modal/ds004514_subject_quality_policy.json)

## Canonical space

The current shared channel set contains `12` HbO/HbR channels:

- `S1_D3 hbo`
- `S1_D3 hbr`
- `S2_D1 hbo`
- `S2_D1 hbr`
- `S3_D1 hbo`
- `S3_D1 hbr`
- `S3_D4 hbo`
- `S3_D4 hbr`
- `S4_D1 hbo`
- `S4_D1 hbr`
- `S6_D4 hbo`
- `S6_D4 hbr`

The fNIRS time axis is canonicalized to `78` samples per `10 s` window.

The current configs enforce the `default_train_eval` subject-quality tier, so the preferred cross-variant baseline path no longer relies on an implicit clean-subject selection.

## Current result

The current canonicalized ridge baseline is still a negative control, not a usable predictive model.

- It beats the variant-routed baseline on MSE in the shared four-subject comparison.
- It still underperforms the null baseline by a large margin.
- The practical conclusion is to carry this path forward as the default cross-variant baseline scaffold, then replace the linear model before making any claims about translation performance.
