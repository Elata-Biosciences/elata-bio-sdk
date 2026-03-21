# DS004514 fNIRS Waveform Smoke

Status: Active

## Purpose

This document describes the first real waveform-level processing path for `DS004514`.

It validates:

- raw `SNIRF` loading on real payloads
- optical-density conversion
- HbO/HbR derivation
- event-anchored image-window indexing
- scalp-coupling quality scoring

Related files:

- [../../configs/cross_modal/ds004514_fnirs_waveform.toml](../../configs/cross_modal/ds004514_fnirs_waveform.toml)
- [../../scripts/cross_modal/bootstrap_waveform_deps.py](../../scripts/cross_modal/bootstrap_waveform_deps.py)
- [../../scripts/cross_modal/build_ds004514_fnirs_waveform_smoke.py](../../scripts/cross_modal/build_ds004514_fnirs_waveform_smoke.py)
- [../../scripts/cross_modal/validate_ds004514_fnirs_waveform.py](../../scripts/cross_modal/validate_ds004514_fnirs_waveform.py)
- [../../reports/cross_modal/ds004514/ds004514_fnirs_waveform_summary.md](../../reports/cross_modal/ds004514/ds004514_fnirs_waveform_summary.md)

## Commands

Bootstrap the optional waveform dependency:

```powershell
python scripts/cross_modal/bootstrap_waveform_deps.py
```

Fetch raw fNIRS payloads for the smoke split:

```powershell
python scripts/cross_modal/fetch_ds004514_assets.py --config configs/cross_modal/ds004514_smoke.toml --raw-modalities fnirs
```

Build the waveform smoke metrics:

```powershell
python scripts/cross_modal/build_ds004514_fnirs_waveform_smoke.py --config configs/cross_modal/ds004514_fnirs_waveform.toml
```

Validate the waveform outputs:

```powershell
python scripts/cross_modal/validate_ds004514_fnirs_waveform.py --config configs/cross_modal/ds004514_fnirs_waveform.toml
```

Or use the package script:

```powershell
npm run cross-modal:ds004514:fnirs:all
```

## Current findings

Reference run on March 21, 2026:

- subjects processed: `12`
- total image windows: `2160`
- raw channel counts observed: `22` and `28`
- raw sampling rates observed: `7.8125 Hz` and `8.928571 Hz`
- low-median-SCI subjects: `sub-05`, `sub-12`

Important implication:

- the raw fNIRS branch is not uniform across subjects, so final ingest cannot assume a single fixed channel count or sampling rate

## Outputs

- metrics: `reports/cross_modal/ds004514/ds004514_fnirs_waveform_metrics.json`
- summary: `reports/cross_modal/ds004514/ds004514_fnirs_waveform_summary.md`

## Next step

Use this validated raw fNIRS path as the derived-target branch when adding waveform-backed EEG-to-fNIRS smoke experiments.
