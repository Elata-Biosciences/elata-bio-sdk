# Phase 1 Public Intake Note

Status: Active

## Purpose

This note summarizes the current state of the public candidate manifests and what remains before each source is actually ready for ingest.

## Current public candidates

### DS004514

- Manifest: [../../manifests/cross_modal/public_ds004514.json](../../manifests/cross_modal/public_ds004514.json)
- Intended role: paired EEG-fNIRS alignment and EEG-to-fNIRS baseline work
- What is verified:
  - official OpenNeuro DOI `10.18112/openneuro.ds004514.v1.1.2`
  - frozen `1.1.2` source tree and BIDS sidecars confirm 12 subjects, no session folders, EEG `.bdf`, and fNIRS `.snirf`
  - split-plan and normalization-note docs now exist for this dataset
  - executable smoke ingest path exists and validates event-aligned canonical windows across all 12 subjects
  - executable raw fNIRS waveform smoke path validates SNIRF loading and HbO/HbR derivation on real payloads
  - executable raw EEG waveform smoke path validates BDF loading and event-window access on a laptop-safe two-subject subset
  - executable paired EEG-fNIRS waveform smoke path emits 360 aligned windows for one train subject and one eval subject
  - both observed fNIRS raw variants now have paired waveform smoke coverage on clean train/eval subject pairs
  - executable variant-routed baseline exists for the two observed fNIRS cohorts
  - subject-quality policy is now explicit and machine-readable
- What remains:
  - decide whether future geometry-aware canonicalization beats the routed baseline strongly enough to justify the extra complexity

### DS003838

- Manifest: [../../manifests/cross_modal/public_ds003838.json](../../manifests/cross_modal/public_ds003838.json)
- Intended role: EEG-PPG alignment and PPG morphology benchmarking
- What is verified:
  - official OpenNeuro DOI `10.18112/openneuro.ds003838.v1.0.6`
- What remains:
  - confirm exact recording layout
  - confirm morphology-grade raw waveform quality

### DS006848

- Manifest: [../../manifests/cross_modal/public_ds006848.json](../../manifests/cross_modal/public_ds006848.json)
- Intended role: EEG-PPG rest and working-memory benchmarking
- What is verified:
  - official OpenNeuro DOI `10.18112/openneuro.ds006848.v1.0.0`
  - snapshot metadata confirm dataset name, `BIDSVersion` `1.7.0`, and `CC0` license
  - the source tree contains `30` subject folders and no session subdirectories
  - all `30` subjects expose `eeg/` with BrainVision payloads plus CapTrak electrode and coordsystem sidecars
  - EEG sidecars report `63` EEG channels at `1000 Hz`
  - the same BrainVision container also carries one `PPG` channel and one `ECG` channel at `1000 Hz`
  - `task-verbalwm` is present for all `30` subjects and has matching `beh/` files for all `30`
  - `task-rest` is present for `22` subjects, and the missing-rest cohort matches `participants.tsv -> RS_excluded=yes`
  - an executable verbalwm Phase 2 pilot artifact exists for `sub-001` train and `sub-007` eval
  - that verbalwm pilot artifact emits `512` paired windows with zero measured alignment residual and full quality-pass
  - an expanded verbalwm development artifact exists for `sub-001`, `sub-010` train and `sub-007`, `sub-012` eval, with `1024` aligned quality-pass windows
  - a broader verbalwm development artifact exists for `sub-001`, `sub-010`, `sub-013`, `sub-015` train and `sub-007`, `sub-012`, `sub-016`, `sub-017` eval, with `2048` paired windows and `1983` quality-pass windows
  - the broader target artifact keeps dominant-beat coverage dense (`1978` valid windows) and introduces the first nonzero DS006848 eval notch coverage (`123` valid windows)
  - the broader morphology baseline no longer beats the null on aggregate standardized MSE for either EEG branch, with `eeg_clean` now the least-bad branch
  - a first rest Phase 2 pilot now exists for `sub-001` train and `sub-007` eval, with `20` paired windows, full quality-pass, and explicit `Eyes_Closed`, `Eyes_Opened`, `Start_Cartoon`, and `End_Cartoon` marker coverage
  - a first rest target artifact now exists on top of that rest pilot, with `10 / 10` dominant-beat-valid windows in both train and eval, and train-only notch coverage (`2` valid windows)
  - a machine-readable DS006848 verbalwm subject-quality policy now exists:
    - `sub-016` is marked `stress_test_only`
    - `sub-017` is marked `borderline_review`
    - the remaining `22` verbalwm subjects stay `pending_review`
  - a broader `12`-subject verbalwm PPG waveform-quality review now exists, with `1536` sampled windows, `1509` quality-pass windows, and a pending-review shortlist led by `sub-002` and `sub-035`
  - a first model-aware cohort-swap artifact now exists for `sub-001`, `sub-010`, `sub-013`, `sub-015` train and `sub-002`, `sub-007`, `sub-012`, `sub-035` eval, with `2048 / 2048` quality-pass windows
  - that cohort swap sharply reduces the broader DS006848 failure but still does not recover a null-beating aggregate baseline, with `eeg_clean` remaining the least-bad branch
  - a shift-aware cohort-swap baseline now also exists:
    - `oracle_subject_zscore` still does not beat null
    - `calibrated_subject_zscore` on `eeg_clean` edges past null on aggregate MSE
    - the first recovered targets are `amplitude_range` and `rising_edge_slope_max`
  - a calibrated absolute-unit cohort-swap baseline now also exists:
    - `calibrated_absolute` on `eeg_clean` beats null on aggregate relative MSE
    - the first recovered real-unit targets are `amplitude_range`, `rising_edge_slope_max`, and `dominant_beat_rise_time_seconds`
  - a first one-subject calibrated cohort expansion now also exists:
    - it adds `sub-011` to the cohort-swap eval side
    - the data path stays fully clean with `2304 / 2304` quality-pass windows
    - the full calibrated morphology aggregate no longer beats null
    - amplitude-family calibrated behavior stays below null, but timing-family behavior collapses
- What remains:
  - decide whether DS006848 should now be treated primarily as an amplitude-family calibrated EEG-PPG benchmark
  - keep `sub-011` out of the default full-morphology calibrated cohort until the timing-family failure is understood
  - decide whether the first rest branch should stay smoke-only or expand into a real rest benchmark
  - decide the long-term zero-shot versus calibrated roles of DS006848 and DS003838 now that both broader verbalwm splits fail to beat null

### DREAMT

- Manifest: [../../manifests/cross_modal/public_dreamt.json](../../manifests/cross_modal/public_dreamt.json)
- Intended role: auxiliary sleep-state EEG-PPG resource
- What is verified:
  - official PhysioNet page for DREAMT version `2.1.0`
  - aligned wearable BVP and PSG-style signals are documented on the official page
- What remains:
  - credentialed-access review
  - define which EEG subset is useful for the planned experiments

## Intake rule

These public manifests are valid `candidate` manifests, not `ready` manifests.

They should only move to `ready` after:

1. raw access is confirmed
2. actual file layout is checked
3. split counts are populated
4. ingest notes are written

## Validation commands

Validate the whole registry:

```powershell
python scripts/cross_modal/validate_registry.py --registry manifests/cross_modal/registry.json
```

Validate one manifest:

```powershell
python scripts/cross_modal/validate_manifest_file.py manifests/cross_modal/public_ds003838.json
```
