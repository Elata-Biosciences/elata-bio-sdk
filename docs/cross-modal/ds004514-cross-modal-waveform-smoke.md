# DS004514 Cross-Modal Waveform Smoke

Status: Active

## Purpose

This document describes the first true paired EEG-fNIRS waveform artifact for `DS004514`.

It validates:

- real `BDF` plus real `SNIRF` access in one pipeline
- matched-event affine alignment between EEG and fNIRS
- paired waveform-window generation for one train subject and one eval subject
- emission of machine-readable paired tensors plus metadata

Related files:

- [../../configs/cross_modal/ds004514_cross_modal_waveform.toml](../../configs/cross_modal/ds004514_cross_modal_waveform.toml)
- [../../scripts/cross_modal/build_ds004514_cross_modal_waveform_smoke.py](../../scripts/cross_modal/build_ds004514_cross_modal_waveform_smoke.py)
- [../../scripts/cross_modal/validate_ds004514_cross_modal_waveform.py](../../scripts/cross_modal/validate_ds004514_cross_modal_waveform.py)
- [../../reports/cross_modal/ds004514/ds004514_cross_modal_waveform_summary.md](../../reports/cross_modal/ds004514/ds004514_cross_modal_waveform_summary.md)

## Commands

Fetch the paired raw subset:

```powershell
python scripts/cross_modal/fetch_ds004514_assets.py --config configs/cross_modal/ds004514_cross_modal_waveform.toml
```

Build the paired waveform artifact:

```powershell
python scripts/cross_modal/build_ds004514_cross_modal_waveform_smoke.py --config configs/cross_modal/ds004514_cross_modal_waveform.toml
```

Validate the paired outputs:

```powershell
python scripts/cross_modal/validate_ds004514_cross_modal_waveform.py --config configs/cross_modal/ds004514_cross_modal_waveform.toml
```

Or use the package script:

```powershell
npm run cross-modal:ds004514:paired:all
```

## Current findings

Reference run on March 21, 2026:

- subjects processed: `2`
- train subject: `sub-01`
- eval subject: `sub-03`
- paired windows: `360`
- EEG tensor shape: `360 x 64 x 1230`
- fNIRS tensor shape: `360 x 28 x 78`
- max subject alignment RMSE: about `0.0370 s`

## Outputs

- paired tensors: `reports/cross_modal/ds004514/ds004514_cross_modal_waveform_windows.npz`
- metadata: `reports/cross_modal/ds004514/ds004514_cross_modal_waveform_metadata.json`
- metrics: `reports/cross_modal/ds004514/ds004514_cross_modal_waveform_metrics.json`
- summary: `reports/cross_modal/ds004514/ds004514_cross_modal_waveform_summary.md`

## Scope note

This smoke artifact intentionally uses the uniform fNIRS variant shared by `sub-01` and `sub-03`.

It does not yet solve:

- cross-subject normalization across the `22`-channel and `28`-channel fNIRS variants
- scaling the paired waveform path beyond the two-subject subset
