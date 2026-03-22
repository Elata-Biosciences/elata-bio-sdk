# DS004514 Ingest Note

Status: Active

## Purpose

This note captures the first source-backed ingest findings for `DS004514` and serves as the short file-layout summary required by Phase 1.

Related files:

- [../../manifests/cross_modal/public_ds004514.json](../../manifests/cross_modal/public_ds004514.json)
- [ds004514-intake-worksheet.md](ds004514-intake-worksheet.md)
- [../../reports/cross_modal/intake/ds004514-intake-report.md](../../reports/cross_modal/intake/ds004514-intake-report.md)

## Frozen source inspected

- OpenNeuro DOI: `10.18112/openneuro.ds004514.v1.1.2`
- OpenNeuro snapshot tag: `1.1.2`
- Git mirror tag inspected locally: `1.1.2`

## Top-level layout

Observed root entries:

- `CHANGES`
- `README`
- `dataset_description.json`
- `participants.json`
- `participants.tsv`
- `code/`
- `stimuli/`
- `sub-01/` through `sub-12/`

This confirms:

- 12 subject folders
- no session folders at the top level
- BIDS metadata at the dataset root

## Subject layout

Observed for `sub-01`:

- `sub-01/sub-01_scans.tsv`
- `sub-01/eeg/sub-01_task-eeg_eeg.bdf`
- `sub-01/eeg/sub-01_task-eeg_eeg.json`
- `sub-01/eeg/sub-01_task-eeg_channels.tsv`
- `sub-01/eeg/sub-01_task-eeg_events.tsv`
- `sub-01/eeg/sub-01_task-eeg_events.json`
- `sub-01/nirs/sub-01_task-nirs_nirs.snirf`
- `sub-01/nirs/sub-01_task-nirs_nirs.json`
- `sub-01/nirs/sub-01_task-nirs_channels.tsv`
- `sub-01/nirs/sub-01_task-nirs_events.tsv`
- `sub-01/nirs/sub-01_task-nirs_events.json`
- `sub-01/nirs/sub-01_optodes.tsv`
- `sub-01/nirs/sub-01_coordsystem.json`

Working assumption:

- other subjects follow the same subject-level layout

## Confirmed modality facts

- EEG raw format: `.bdf`
- EEG metadata sidecars: `.json`, `channels.tsv`, `events.tsv`
- fNIRS raw format: `.snirf`
- fNIRS metadata sidecars: `.json`, `channels.tsv`, `events.tsv`, `optodes.tsv`, `coordsystem.json`
- BIDS version: `1.7.0`
- License: `CC0`

## Immediate ingest implications

- EEG filenames use `task-eeg` while fNIRS filenames use `task-nirs`; internal ingest should normalize these into one shared experiment/task taxonomy.
- EEG and fNIRS streams appear paired through matching event sequences, not identical acquisition start times.
- fNIRS geometry is directly available from `optodes.tsv` and `coordsystem.json`.
- HbO/HbR is not precomputed in the raw dataset; downstream ingest will need a documented SNIRF-to-derived-fNIRS conversion path.
- Raw fNIRS is not uniform across subjects; waveform validation shows both `22`- and `28`-channel variants and both `7.8125 Hz` and `8.928571 Hz` sampling rates.
- Raw EEG waveform access has been validated on a two-subject subset and confirms the expected `80` raw channels with `64` EEG channels at `2048 Hz`.
