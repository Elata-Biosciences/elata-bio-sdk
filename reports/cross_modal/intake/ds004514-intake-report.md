# DS004514 Intake Report

Status: Source-Backed Candidate

## Required metadata

- Dataset ID: `public_ds004514`
- Manifest: [../../../manifests/cross_modal/public_ds004514.json](../../../manifests/cross_modal/public_ds004514.json)
- Worksheet: [../../../docs/cross-modal/ds004514-intake-worksheet.md](../../../docs/cross-modal/ds004514-intake-worksheet.md)
- Ingest note: [../../../docs/cross-modal/ds004514-ingest-note.md](../../../docs/cross-modal/ds004514-ingest-note.md)
- Split plan: [../../../docs/cross-modal/ds004514-split-plan.md](../../../docs/cross-modal/ds004514-split-plan.md)
- Normalization note: [../../../docs/cross-modal/ds004514-normalization-note.md](../../../docs/cross-modal/ds004514-normalization-note.md)
- Smoke ingest path: [../../../docs/cross-modal/ds004514-smoke-ingest.md](../../../docs/cross-modal/ds004514-smoke-ingest.md)
- Intake owner: unassigned
- Intake date: 2026-03-21
- Source version: `v1.1.2`
- Current recommendation: keep as candidate, but accept as the first public EEG-fNIRS intake reference for baseline planning

## Scope

This report records the first confirmed findings from the frozen `1.1.2` source tree and BIDS sidecars for the simultaneous EEG-fNIRS dataset tracked as `DS004514`.

The current pass inspects the official snapshot metadata and the Git mirror of the same frozen tag without annexing the full raw signal payloads.

## Source access

- Access path: `external://openneuro/ds004514`
- Download or mount method: OpenNeuro DOI plus frozen Git mirror tag `1.1.2`
- Snapshot or release tag: `v1.1.2`
- License check: confirmed `CC0` from `dataset_description.json`

## Raw layout findings

- Top-level directories: `code/`, `stimuli/`, `sub-01/` through `sub-12/`, plus BIDS root files
- Subject naming pattern: `sub-XX`
- Session naming pattern: no session subdirectories observed in the frozen source tree
- File formats: EEG `.bdf`, fNIRS `.snirf`, metadata in `.json` and `.tsv`
- BIDS compliance notes: dataset declares `BIDSVersion` `1.7.0`; `CHANGES` notes that `1.1.2` fixed BIDS warnings

## Modality findings

### EEG

- Confirmed present: yes
- Confirmed channel count: 64 EEG channels in the EEG sidecar; 80 rows in `channels.tsv` including auxiliary signals
- Confirmed sampling rate: `2048.0` Hz
- Channel naming and montage notes: raw labels use BioSemi `A1-A32` and `B1-B32`; README provides the ordered mapping into extended 10/20 names
- Auxiliary or missing channel notes: `channels.tsv` for `sub-01` contains 11 `MISC`, 2 `GSR`, 1 `RESP`, 1 `TEMP`, and 1 `TRIG`; all inspected channel statuses are `good`

### fNIRS

- Confirmed present: yes
- Confirmed raw format: `.snirf`
- Confirmed sampling rate: `7.8125` Hz
- Source-detector geometry notes: 8 sources and 4 detectors produce 14 source-detector pairs and 28 amplitude channels across 785 nm and 830 nm wavelengths; geometry is available via `optodes.tsv` and `coordsystem.json`
- HbO/HbR conversion notes: raw data are stored as continuous-wave amplitudes, so HbO/HbR are not precomputed; conversion should be feasible through the SNIRF metadata path but still needs implementation validation

### PPG

- Confirmed present: no
- Confirmed raw format: not applicable
- Confirmed sampling rate: not applicable
- Morphology preservation notes: not applicable

## Pairing and timing

- Simultaneous recording confirmed: partially, at the paradigm and event-sequence level
- Alignment field or trigger source: `events.tsv` tables match exactly in row count, `trial_type`, and `value` order for inspected `sub-01`; `sample` fields exist in both streams
- Drift concerns: EEG and fNIRS absolute onsets are not separated by a constant offset in the inspected subject; the offset varies from about `51.80s` to `51.98s` across the run, so cross-modal alignment should be event-normalized and drift-aware
- Canonical windowing risk notes: do not assume identical zero-time starts from `sub-01_scans.tsv`; derive windows relative to matched events or a validated synchronization transform

## Labels and benchmark fit

- Task labels present: yes
- Event labels present: yes
- Internal benchmark mapping: `eeg_fnirs_alignment`, `eeg_to_fnirs_baseline`
- Recommended accepted roles: public paired alignment reference, event-aligned EEG-to-fNIRS baseline dataset, preprocessing and synchronization benchmark

## Quality and exclusions

- Known quality fields: `status` and `status_description` in channel tables
- Known artifact fields: no dedicated artifact summary fields observed in the inspected sidecars
- Candidate exclusion rules: hold pending full-payload inspection; likely exclude subjects or windows with non-`good` channels once the annexed payloads are available
- Distribution shift notes: participant metadata show 12 subjects, ages `20-57`, sex distribution `9F/3M`, and all recorded handedness values are `R`; this is useful for split stratification and shift diagnostics but not broad population coverage

## Manifest updates required

- [x] modality metadata confirmed
- [x] subject and session counts populated at the source-tree level
- [x] split plan attached
- [x] coverage metadata populated
- [x] quality metadata expanded

## Acceptance decision

Current decision:

- keep as candidate

Decision rationale:

- the frozen source tree and BIDS sidecars now support the candidate manifest with source-backed metadata
- the dataset is clearly suitable for early EEG-fNIRS alignment and translation baselines
- the dataset should remain `candidate` until the signal-level ingest path and event-based synchronization procedure are implemented on real payloads

## Next actions

1. Fetch the annexed `.bdf` and `.snirf` payloads needed for signal-level smoke tests.
2. Fetch the raw `.snirf` and selected `.bdf` payloads for the first waveform-level smoke test on the fixed development split.
3. Reuse the existing smoke ingest path to emit waveform-backed windows instead of sidecar-only event windows.
4. Validate an HbO/HbR derivation path from the raw SNIRF payload before moving the manifest to `ready`.

## Commands

```powershell
python scripts/cross_modal/validate_manifest_file.py manifests/cross_modal/public_ds004514.json
python scripts/cross_modal/validate_registry.py --registry manifests/cross_modal/registry.json
```
