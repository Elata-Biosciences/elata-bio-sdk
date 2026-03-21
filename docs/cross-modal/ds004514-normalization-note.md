# DS004514 Normalization And Alignment Note

Status: Active

## Purpose

This document defines the canonical ingest rules for converting `DS004514` raw files into cross-modal training windows.

Related files:

- [../../manifests/cross_modal/public_ds004514.json](../../manifests/cross_modal/public_ds004514.json)
- [ds004514-ingest-note.md](ds004514-ingest-note.md)
- [ds004514-split-plan.md](ds004514-split-plan.md)
- [../../reports/cross_modal/intake/ds004514-intake-report.md](../../reports/cross_modal/intake/ds004514-intake-report.md)

## Design rules

- preserve a raw branch before any filtering, resampling, or derived-signal conversion
- preserve channel and optode geometry explicitly
- align EEG and fNIRS by matched event structure, not by naive acquisition start time
- keep preprocessing reversible and auditable
- do not collapse fNIRS into HbO/HbR-only storage until the raw amplitude branch is saved

## Canonical source inputs

Use:

- EEG raw signal from `sub-XX/eeg/sub-XX_task-eeg_eeg.bdf`
- EEG sidecars from `sub-XX/eeg/sub-XX_task-eeg_eeg.json`, `channels.tsv`, and `events.tsv`
- fNIRS raw signal from `sub-XX/nirs/sub-XX_task-nirs_nirs.snirf`
- fNIRS sidecars from `sub-XX/nirs/sub-XX_task-nirs_nirs.json`, `channels.tsv`, `events.tsv`, `optodes.tsv`, and `coordsystem.json`

## Task normalization

Normalize both raw tasks into one internal protocol namespace.

Recommended internal protocol labels:

- `silent_naming`
- `animal_visual_imagery`
- `animal_auditory_imagery`
- `animal_tactile_imagery`
- `tool_visual_imagery`
- `tool_auditory_imagery`
- `tool_tactile_imagery`

Do not treat `task-eeg` and `task-nirs` as different experiments. They are separate modality files for the same behavioral run.

## EEG normalization

Archive branch:

- preserve native sampling at `2048 Hz`
- preserve raw BioSemi labels `A1-A32`, `B1-B32`
- preserve auxiliary channels and channel-type metadata
- preserve per-channel `status` and `status_description`

Derived branch for lightweight baselines:

- create an explicitly logged resampled branch at `256 Hz` or `512 Hz`
- only resample after anti-alias filtering
- keep event times in both samples and seconds
- store the BioSemi-to-10/20 name mapping as metadata, not as a destructive replacement

Do not:

- drop auxiliary channels silently
- apply aggressive notch or band-limit filtering before synchronization checks
- assume all useful transient structure lies below traditional low-gamma cutoffs

## fNIRS normalization

Archive branch:

- preserve native sampling at `7.8125 Hz`
- preserve continuous-wave amplitude channels exactly as stored in SNIRF
- preserve source-detector pair identifiers and wavelength labels
- preserve `optodes.tsv` and `coordsystem.json` geometry

Derived branch:

- derive HbO/HbR only after the raw amplitude branch is written
- log the exact conversion path and parameters
- retain a mapping from each derived channel back to the source-detector pair and wavelength inputs

Observed raw variants:

- some subjects expose `28` raw channels at about `7.8125 Hz`
- some subjects expose `22` raw channels at about `8.928571 Hz`

Normalization implication:

- do not assume a single fixed fNIRS tensor shape before subject-level geometry handling

Do not:

- discard wavelength-resolved amplitudes after HbO/HbR derivation
- flatten geometry into an unordered feature vector

## Event alignment policy

`sub-01` inspection shows:

- EEG and fNIRS `events.tsv` files have the same row count
- `trial_type` and `value` match row by row
- absolute onsets differ and the offset is not perfectly constant

Canonical alignment rule:

1. match EEG and fNIRS events by row index, `trial_type`, and `value`
2. estimate the time transform between EEG and fNIRS event onsets for each run
3. quantify residual alignment error after the transform
4. reject the run if event correspondence fails or residual error exceeds the configured threshold

Initial implementation recommendation:

- start with an affine onset transform per run
- log intercept, slope, and residual statistics
- only move to a more complex warping model if residuals show systematic nonlinearity

## Window construction

For alignment baselines:

- build windows relative to matched event anchors
- use modality-specific context lengths rather than forcing equal sample counts
- retain event identity inside the window metadata

For EEG-to-fNIRS translation baselines:

- include pre-event EEG context long enough to cover the expected hemodynamic lag
- define target fNIRS windows in event-relative time, not file-start time
- keep the raw and derived fNIRS targets separate

## Filtering policy

Before the first signal-level baseline:

- benchmark the no-filter branch
- benchmark the minimal-cleanup branch
- record phase delay, attenuation, and compute cost for each added filter stage

Offline default:

- if filtering is required for a derived branch, prefer explicit zero-phase offline filtering and log the method

Do not:

- apply hidden causal delays that corrupt cross-modal alignment
- treat the filtered branch as a replacement for the raw-preserved branch

## Required output metadata

Every canonical window record should include:

- `subject_id`
- `source_dataset`
- `modality`
- `run_id`
- `event_index`
- `trial_type`
- `event_value`
- `window_start_seconds`
- `window_end_seconds`
- `alignment_reference`
- `geometry_reference`
- `preprocessing_branch`

## Promotion rule

`DS004514` should not move to `ready` until:

- the canonical alignment transform is implemented and tested on at least one real subject
- the raw-preserving and derived branches both exist
- variable fNIRS montage handling is implemented explicitly
- the emitted window metadata include the fields above
