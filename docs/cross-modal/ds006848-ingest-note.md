# DS006848 Ingest Note

Status: Active

## Purpose

This note records the first source-backed ingest findings for `DS006848`.

Related files:

- [../../manifests/cross_modal/public_ds006848.json](../../manifests/cross_modal/public_ds006848.json)
- [ds006848-intake-worksheet.md](ds006848-intake-worksheet.md)
- [ds006848-subject-quality-policy.md](ds006848-subject-quality-policy.md)
- [../../reports/cross_modal/intake/ds006848-intake-report.md](../../reports/cross_modal/intake/ds006848-intake-report.md)

## Key corrections to the provisional manifest

The original candidate manifest was directionally useful but too coarse in four ways:

1. it assumed a generic working-memory label rather than the source task label `verbalwm`
2. it implied a simpler EEG plus PPG layout than the source tree actually uses
3. it did not capture that `PPG` and `ECG` are embedded inside the `eeg/` BrainVision container
4. it did not capture the split between the 30-subject verbalwm cohort and the 22-subject rest subset

The source-backed intake pass now confirms:

- total subjects: `30`
- no session subdirectories
- all subjects have `task-verbalwm` EEG+PPG data
- only `22` subjects have `task-rest`
- the `8` missing-rest subjects match `participants.tsv -> RS_excluded=yes`

## Verified layout

Top level:

- BIDS root files
- `stimuli/`
- subject directories

Subject directories are consistent:

- every subject exposes `eeg/`
- every subject exposes `sub-XXX_scans.tsv`
- every subject exposes `beh/`, but behavior files are only for `task-verbalwm`

## Verified modality details

### EEG

- raw format: BrainVision (`.vhdr`, `.vmrk`, `.eeg`)
- sidecars: `*_eeg.json`, `*_channels.tsv`, `*_events.tsv`
- channel count: `63`
- sampling rate: `1000 Hz`
- geometry sidecars: `*_electrodes.tsv`, `*_coordsystem.json`
- power-line frequency: `50 Hz`

### PPG / cardiovascular

- there is no dedicated `ppg/` or `ecg/` subtree
- PPG is stored as the `PPG` channel inside the BrainVision recording in `eeg/`
- ECG is stored as the `ECG` channel inside the same BrainVision recording
- total sampled channel count: `65`
  - `63` EEG
  - `1` PPG as `MISC`
  - `1` ECG
- sampling rate: `1000 Hz`

Practical implication:

- the first DS006848 EEG-PPG artifact can treat the source as a single-file multimodal recording rather than a cross-file alignment problem

## Pairing and timing

For sampled subjects such as `sub-001` and `sub-015`:

- `task-rest` and `task-verbalwm` each have one BrainVision recording under `eeg/`
- events live in the same task-specific subtree as EEG, PPG, and ECG
- behavior lives only under `beh/` for `task-verbalwm`

Practical implication:

- the first DS006848 Phase 2 artifact should start with a verbalwm-only split because it is the only task present for all 30 subjects
- rest can be added as a second protocol layer over the 22-subject clean rest subset

## Quality and exclusion fields

`participants.tsv` provides immediately useful cohort filters:

- `EEG_excluded`
- `RS_excluded`
- `behavior_excluded`

`channels.tsv` also provides per-task channel-status fields:

- `status`
- `status_description`

These should be the first cohort and channel gates before waveform-level PPG quality scoring is layered on top.

## Recommended next step

The next engineering step should be:

- keep the current 2-subject verbalwm pilot as the smoke contract
- use the current 8-subject verbalwm split as the development default
- use the explicit DS006848 verbalwm subject-quality policy as the default cohort gate
- keep the new 2-subject rest pilot as the rest smoke contract
- treat the broader verbalwm waveform-quality pass as complete enough to create a pending-review shortlist:
  - strongest current promotion candidates: `sub-002`, `sub-035`
  - verbalwm-only secondary candidate: `sub-011`
  - keep `sub-025` pending
- treat the first rest target artifact as the next completed smoke-layer output on top of the 2-subject rest pilot
- run a model-aware cohort-swap experiment before promoting more verbalwm subjects into the default pool
