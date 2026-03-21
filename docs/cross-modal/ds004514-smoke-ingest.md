# DS004514 Smoke Ingest Path

Status: Active

## Purpose

This document describes the first executable `DS004514` ingest path in the repo.

It is designed for low-friction local iteration:

- fetches only sidecars by default
- builds canonical event-aligned windows without heavy dependencies
- validates alignment quality across the full fixed development split

Related files:

- [../../configs/cross_modal/ds004514_smoke.toml](../../configs/cross_modal/ds004514_smoke.toml)
- [../../scripts/cross_modal/fetch_ds004514_assets.py](../../scripts/cross_modal/fetch_ds004514_assets.py)
- [../../scripts/cross_modal/build_ds004514_smoke_index.py](../../scripts/cross_modal/build_ds004514_smoke_index.py)
- [../../scripts/cross_modal/validate_ds004514_smoke.py](../../scripts/cross_modal/validate_ds004514_smoke.py)
- [../../reports/cross_modal/ds004514/ds004514_smoke_summary.md](../../reports/cross_modal/ds004514/ds004514_smoke_summary.md)

## What it does

1. downloads the dataset root files and per-subject EEG/fNIRS sidecars from the OpenNeuro S3 export
2. uses the fixed smoke split defined in `ds004514_smoke.toml`
3. matches EEG and fNIRS events row by row
4. fits an affine onset transform for each subject
5. emits a canonical event-window index and alignment metrics

By default it does not fetch:

- EEG `.bdf` payloads
- fNIRS `.snirf` payloads

Those raw payloads are optional and should be fetched explicitly when moving from canonical indexing to signal-level baselines.

## Commands

Fetch the smoke subset sidecars:

```powershell
python scripts/cross_modal/fetch_ds004514_assets.py --config configs/cross_modal/ds004514_smoke.toml
```

Build the canonical smoke index:

```powershell
python scripts/cross_modal/build_ds004514_smoke_index.py --config configs/cross_modal/ds004514_smoke.toml
```

Validate the smoke outputs:

```powershell
python scripts/cross_modal/validate_ds004514_smoke.py --config configs/cross_modal/ds004514_smoke.toml
```

Or run the package scripts:

```powershell
npm run cross-modal:ds004514:all
```

## Current reference result

Reference run on March 21, 2026:

- subjects indexed: `12`
- train subjects: `9`
- eval subjects: `3`
- canonical event windows: `26628`
- max subject alignment RMSE: about `0.0371 s`
- max subject absolute residual: about `0.0674 s`
- default raw payload download: `none`

## Outputs

- fetch report: `reports/cross_modal/ds004514/ds004514_fetch_report.json`
- smoke index: `reports/cross_modal/ds004514/ds004514_smoke_index.json`
- smoke metrics: `reports/cross_modal/ds004514/ds004514_smoke_metrics.json`
- smoke summary: `reports/cross_modal/ds004514/ds004514_smoke_summary.md`

## Known limits

- this path indexes canonical windows from sidecars and events, not waveform tensors
- no EEG raw payloads are fetched by default because the `.bdf` files are large
- no HbO/HbR derivation is performed yet
- no filter benchmarking is performed yet

## Next step

Use the same config and subject split to add a first real signal-level path:

- fetch selected raw `.snirf` payloads first
- then add optional EEG `.bdf` fetch for one or two subjects
- then emit event-aligned waveform windows with raw-preserving and derived branches
