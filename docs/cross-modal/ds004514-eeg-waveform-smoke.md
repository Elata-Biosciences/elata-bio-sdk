# DS004514 EEG Waveform Smoke

Status: Active

## Purpose

This document describes the first raw-EEG waveform smoke path for `DS004514`.

It validates:

- laptop-safe `.bdf` fetching on a two-subject subset
- real BDF loading through `MNE`
- event-anchored EEG waveform access around image events
- preservation of the full EEG plus auxiliary channel layout

Related files:

- [../../configs/cross_modal/ds004514_eeg_waveform.toml](../../configs/cross_modal/ds004514_eeg_waveform.toml)
- [../../scripts/cross_modal/build_ds004514_eeg_waveform_smoke.py](../../scripts/cross_modal/build_ds004514_eeg_waveform_smoke.py)
- [../../scripts/cross_modal/validate_ds004514_eeg_waveform.py](../../scripts/cross_modal/validate_ds004514_eeg_waveform.py)
- [../../reports/cross_modal/ds004514/ds004514_eeg_waveform_summary.md](../../reports/cross_modal/ds004514/ds004514_eeg_waveform_summary.md)

## Commands

Fetch the small EEG raw subset:

```powershell
python scripts/cross_modal/fetch_ds004514_assets.py --config configs/cross_modal/ds004514_eeg_waveform.toml
```

Build the EEG waveform smoke metrics:

```powershell
python scripts/cross_modal/build_ds004514_eeg_waveform_smoke.py --config configs/cross_modal/ds004514_eeg_waveform.toml
```

Validate the outputs:

```powershell
python scripts/cross_modal/validate_ds004514_eeg_waveform.py --config configs/cross_modal/ds004514_eeg_waveform.toml
```

Or use the package script:

```powershell
npm run cross-modal:ds004514:eeg:all
```

## Current findings

Reference run on March 21, 2026:

- subjects processed: `2`
- split: `sub-01` train, `sub-03` eval
- raw EEG sampling rate observed: `2048.0 Hz`
- total raw channel count observed: `80`
- canonical EEG channel count observed: `64`
- auxiliary counts observed: `11 MISC`, `2 GSR`, `1 RESP`, `1 TEMP`, `1 TRIG`
- image events indexed: `360`
- first image-window shape: `64 x 1229` samples for a `0.6 s` window

## Cost note

This stage is intentionally not full-dataset.

The two-subject fetch downloaded about `4.25 GB`, which is acceptable for a workstation smoke path but not for default laptop iteration across all subjects.

## Next step

Use this EEG waveform subset together with the already validated fNIRS waveform branch to emit real cross-modal waveform windows for one train subject and one eval subject.
