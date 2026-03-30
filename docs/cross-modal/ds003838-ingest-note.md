# DS003838 Ingest Note

Status: Active

## Purpose

This note records the first source-backed ingest findings for `DS003838`.

Related files:

- [../../manifests/cross_modal/public_ds003838.json](../../manifests/cross_modal/public_ds003838.json)
- [ds003838-intake-worksheet.md](ds003838-intake-worksheet.md)
- [../../reports/cross_modal/intake/ds003838-intake-report.md](../../reports/cross_modal/intake/ds003838-intake-report.md)

## Key corrections to the provisional manifest

The original candidate manifest was directionally useful but too coarse in three ways:

1. it treated the dataset as uniformly paired EEG-PPG
2. it implied a simple EEG folder plus PPG folder layout
3. it did not capture that the PPG waveform is stored inside the `ecg/` modality container

The source-backed intake pass now confirms:

- total subjects: `86`
- subject IDs: `sub-013` through `sub-098`
- no session subdirectories
- paired EEG+PPG subjects: `65`
- cardiovascular-without-EEG subjects: `18`
- missing cardiovascular subjects: `3`

## Verified layout

Top level:

- BIDS root files
- `stimuli/`
- subject directories

Subject directories are heterogeneous:

- complete subjects, such as `sub-032`, expose `beh/`, `ecg/`, `eeg/`, and `pupil/`
- early subjects such as `sub-013` expose `beh/`, `ecg/`, and `pupil/`, but no `eeg/`

## Verified modality details

### EEG

- raw format: EEGLAB `.set`
- sidecars: `*_eeg.json`, `*_channels.tsv`, `*_events.tsv`
- channel count: `63`
- sampling rate: `1000 Hz`
- representative complete-subject tasks: `task-rest`, `task-memory`

### Cardiovascular / PPG

- stored under `ecg/`, not under a dedicated `ppg/` folder
- raw format: EEGLAB `.set`
- sidecars: `*_ecg.json`, `*_channels.tsv`, `*_events.tsv`
- sampled raw channel names: `PPG`, `ECG`
- channel count: `2`
- sampling rate: `1000 Hz`

Practical implication:

- the first EEG-PPG artifact should treat `PPG` as a channel extracted from the cardiovascular container, not as a separate BIDS modality folder

## Pairing and timing

For sampled complete subject `sub-032`:

- `task-memory` EEG and cardiovascular event tables match exactly
- `task-rest` EEG and cardiovascular event tables match exactly
- sampled `task-rest` raw files have matching sample counts and sampling rates:
  - EEG: `227081` samples at `1000 Hz`
  - cardiovascular: `227081` samples at `1000 Hz`

Practical implication:

- the first EEG-PPG Phase 2 artifact can start with strict event-table matching and raw sample-count checks rather than a more complex cross-stream synchronization model

## Quality and exclusion fields

`participants.tsv` provides immediately useful cohort filters:

- `EEG_excluded`
- `ECG_excluded`
- `pupil_excluded`
- `behavior_excluded`

These should be treated as the first cohort-quality gates before any waveform-level quality scoring is layered on top.

## Recommended next step

The next engineering step should be:

- build a `DS003838` Phase 2 path using the `65` paired EEG+PPG subjects as the default pool
- keep excluded subjects out of the default paired cohort
- benchmark morphology preservation on the extracted `PPG` channel before any aggressive cleanup or resampling
