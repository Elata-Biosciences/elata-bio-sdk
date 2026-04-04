# DS006848 Intake Worksheet

Status: Active

Dataset:

- Manifest: [../../manifests/cross_modal/public_ds006848.json](../../manifests/cross_modal/public_ds006848.json)
- Intake report: [../../reports/cross_modal/intake/ds006848-intake-report.md](../../reports/cross_modal/intake/ds006848-intake-report.md)
- Ingest note: [ds006848-ingest-note.md](ds006848-ingest-note.md)
- Subject quality policy: [ds006848-subject-quality-policy.md](ds006848-subject-quality-policy.md)

## Access and snapshot

- [x] Verified official DOI `10.18112/openneuro.ds006848.v1.0.0`
- [x] Verified license `CC0`
- [x] Verified dataset name from `dataset_description.json`
- [x] Verified `BIDSVersion` `1.7.0`

## Layout review

- [x] Verified top-level root files and subject directories
- [x] Verified subject count `30`
- [x] Verified subject IDs from `sub-001` through `sub-035` with expected gaps
- [x] Verified no session subdirectories in the source tree
- [x] Verified all subjects expose `eeg/` and only verbalwm exposes `beh/`

## EEG review

- [x] Verified EEG raw format is BrainVision (`.vhdr`, `.vmrk`, `.eeg`)
- [x] Verified EEG sidecars for `task-rest` and `task-verbalwm`
- [x] Verified EEG sampling rate `1000 Hz`
- [x] Verified EEG channel count `63`
- [x] Verified geometry sidecars `*_electrodes.tsv` and `*_coordsystem.json`

## PPG / cardiovascular review

- [x] Verified there is no dedicated `ppg/` subtree
- [x] Verified PPG is stored inside the `eeg/` BrainVision container
- [x] Verified the sampled `PPG` channel is typed as `MISC`
- [x] Verified the sampled `ECG` channel is typed as `ECG`
- [x] Verified the BrainVision container has `65` total channels in sampled subjects
- [x] Verified PPG and ECG sampling rate `1000 Hz`

## Pairing and timing review

- [x] Verified EEG, PPG, and ECG are recorded in the same file per task
- [x] Verified cross-file synchronization is not required for the first EEG-PPG artifact
- [x] Verified `task-rest` events exist in the `eeg/` subtree when `RS_excluded=no`
- [x] Verified `task-verbalwm` events exist for all `30` subjects
- [x] Verified verbalwm behavior files exist for all `30` subjects

## Cohort coverage review

- [x] Verified total subject count `30`
- [x] Verified all `30` subjects have verbalwm EEG+PPG data
- [x] Verified `22` subjects have rest EEG+PPG data
- [x] Verified `8` verbalwm-only subjects align with `participants.tsv -> RS_excluded=yes`
- [x] Verified age range `18-32`
- [x] Verified sex and handedness metadata are present

## Remaining intake blockers

- [x] Define the first DS006848 split policy for verbalwm and rest
- [ ] Benchmark morphology-grade raw PPG quality on a representative subject subset
- [x] Build the first DS006848 Phase 2 EEG-PPG artifact
- [x] Derive the first DS006848 target artifact and inspect target coverage
- [x] Expand the DS006848 verbalwm path beyond the current 2-subject pilot
- [x] Run the first expanded DS006848 morphology baseline and slice-analysis pass
- [x] Formalize the DS006848 broader verbalwm subject-quality policy
- [x] Build the first DS006848 rest Phase 2 branch
