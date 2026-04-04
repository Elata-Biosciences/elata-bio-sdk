# DS003838 Intake Worksheet

Status: Active

Dataset:

- Manifest: [../../manifests/cross_modal/public_ds003838.json](../../manifests/cross_modal/public_ds003838.json)
- Intake report: [../../reports/cross_modal/intake/ds003838-intake-report.md](../../reports/cross_modal/intake/ds003838-intake-report.md)
- Ingest note: [ds003838-ingest-note.md](ds003838-ingest-note.md)

## Access and snapshot

- [x] Verified official DOI `10.18112/openneuro.ds003838.v1.0.6`
- [x] Verified snapshot tag `1.0.6` via OpenNeuro GraphQL
- [x] Verified license `CC0`
- [x] Verified dataset name from `dataset_description.json`

## Layout review

- [x] Verified top-level root files and subject directories
- [x] Verified subject range `sub-013` through `sub-098`
- [x] Verified no session subdirectories in the inspected file tree
- [x] Verified modality folders are subject-dependent rather than guaranteed for all subjects
- [x] Verified the README missing-data notes against `participants.tsv`

## EEG review

- [x] Verified that complete subjects have an `eeg/` subtree
- [x] Verified EEG raw format is EEGLAB `.set`
- [x] Verified EEG sidecars for `task-rest` and `task-memory`
- [x] Verified EEG sampling rate `1000 Hz`
- [x] Verified EEG channel count `63`
- [x] Verified representative channel names from a complete subject (`sub-032`)

## PPG / cardiovascular review

- [x] Verified cardiovascular data live in the `ecg/` subtree, not a dedicated `ppg/` subtree
- [x] Verified raw cardiovascular format is EEGLAB `.set`
- [x] Verified the cardiovascular container has `2` channels in sampled files
- [x] Verified channel names are `PPG` and `ECG`
- [x] Verified cardiovascular sampling rate `1000 Hz`
- [x] Verified `task-rest` and `task-memory` cardiovascular sidecars

## Pairing and timing review

- [x] Verified a complete subject (`sub-032`) has both EEG and cardiovascular recordings for `task-rest` and `task-memory`
- [x] Verified sampled EEG and cardiovascular event tables match exactly for `sub-032`
- [ ] Verify event-table equality across the default paired cohort
- [ ] Define the default paired-subject split policy for the first EEG-PPG artifact

## Cohort coverage review

- [x] Verified total subject count `86`
- [x] Verified paired EEG+PPG subject count `65`
- [x] Verified `18` subjects have cardiovascular data but no EEG
- [x] Verified `3` subjects are missing cardiovascular data
- [x] Verified `2` subjects are missing pupil data
- [x] Verified age range `18-44`
- [x] Verified sex, handedness, and dominant-eye metadata are present

## Remaining intake blockers

- [ ] Quantify morphology-grade waveform quality on a representative paired subset
- [ ] Decide the first baseline cohort and split policy
- [ ] Build the first EEG-PPG Phase 2 artifact from the paired cohort
