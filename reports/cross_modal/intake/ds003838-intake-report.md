# DS003838 Intake Report

Status: Source-Backed Candidate

## Required metadata

- Dataset ID: `public_ds003838`
- Manifest: [../../../manifests/cross_modal/public_ds003838.json](../../../manifests/cross_modal/public_ds003838.json)
- Worksheet: [../../../docs/cross-modal/ds003838-intake-worksheet.md](../../../docs/cross-modal/ds003838-intake-worksheet.md)
- Ingest note: [../../../docs/cross-modal/ds003838-ingest-note.md](../../../docs/cross-modal/ds003838-ingest-note.md)
- Intake owner: unassigned
- Intake date: 2026-03-25
- Source version: `v1.0.6`
- Current recommendation: keep as candidate, but treat as the first executable public EEG-PPG Phase 2 reference

## Scope

This report records the first source-backed findings from the official `1.0.6` OpenNeuro snapshot for `DS003838`.

The current pass verifies snapshot metadata, root structure, sidecars, a selective raw-file sample from representative subjects, and the first pilot Phase 2 EEG-PPG window artifact.

## Source access

- Access path: `external://openneuro/ds003838`
- Download or mount method: OpenNeuro GraphQL metadata plus direct S3 file access
- Snapshot or release tag: `v1.0.6`
- License check: confirmed `CC0`

## Raw layout findings

- Top-level directories: `stimuli/` plus subject folders `sub-013` through `sub-098`
- Subject naming pattern: `sub-XXX`
- Session naming pattern: no session subdirectories observed in the snapshot tree
- File formats:
  - EEGLAB `.set`
  - `.json`
  - `.tsv`
  - large pupil `.tsv` payloads
- BIDS compliance notes:
  - snapshot metadata reports `BIDSVersion` `1.1.1`
  - modality folders are heterogeneous across subjects because some physiological streams are absent

## Modality findings

### EEG

- Confirmed present: yes, but not for all subjects
- Confirmed channel count: `63`
- Confirmed sampling rate: `1000 Hz`
- Channel naming and montage notes:
  - representative complete subject `sub-032` exposes a 63-channel cap with labels such as `Fp1`, `Fz`, `F3`, `T7`, `Pz`, `Oz`, `TP10`, `AF7`, and `AF8`
- Auxiliary or missing channel notes:
  - no EEG auxiliary channels were observed in the sampled EEG sidecars
  - `21` subjects do not have usable EEG according to the source tree and participant exclusions

### fNIRS

- Confirmed present: no
- Confirmed raw format: not applicable
- Confirmed sampling rate: not applicable
- Source-detector geometry notes: not applicable
- HbO/HbR conversion notes: not applicable

### PPG

- Confirmed present: yes, but stored inside the `ecg/` subtree rather than a dedicated `ppg/` subtree
- Confirmed raw format: EEGLAB `.set`
- Confirmed sampling rate: `1000 Hz`
- Morphology preservation notes:
  - the sampled cardiovascular container has two channels, `PPG` and `ECG`
  - the waveform is available at raw sample rate, so morphology preservation is plausible
  - the first pilot morphology benchmark now exists on `sub-032` train and `sub-033` eval, with `1024` quality-pass paired windows in the pilot subset
  - morphology quality still needs a broader cohort benchmark before this dataset is promoted beyond candidate status

## Pairing and timing

- Simultaneous recording confirmed: yes for sampled complete subject `sub-032`
- Alignment field or trigger source:
  - EEG and cardiovascular branches each provide `events.tsv`
  - sampled `task-memory` and `task-rest` event tables for `sub-032` match exactly
- Drift concerns:
  - no drift signal was observed in the sampled event tables
  - the first pilot Phase 2 artifact shows `0.0 s` measured alignment RMSE and `0.0 s` max residual on the two-subject split
  - broader cohort verification is still needed before assuming this holds for all paired subjects
- Canonical windowing risk notes:
  - the first EEG-PPG artifact should treat event-table equality and raw sample-count equality as required checks
  - do not assume all `86` subjects belong in the paired EEG-PPG cohort

## Phase 2 pilot result

- Pilot split:
  - train `sub-032`
  - eval `sub-033`
  - task `memory`
- Artifact outputs:
  - `1024` paired windows
  - EEG event tensor shape `1024 x 63 x 500`
  - EEG clean tensor shape `1024 x 63 x 128`
  - PPG native tensor shape `1024 x 2000`
  - PPG clean tensor shape `1024 x 256`
- Pilot quality result:
  - `1024 / 1024` windows pass the current quality gate
  - mean detected PPG peak count per window: about `3.294`
- Pilot benchmark result:
  - cleaned EEG path shows negligible off-notch attenuation and about `-20.604 dB` at `60 Hz`
  - cleaned PPG path keeps `1-10 Hz` probes near-neutral, is about `-6.004 dB` at `20 Hz`, and strongly suppresses `30 Hz` and `60 Hz`

## Labels and benchmark fit

- Task labels present: yes
- Event labels present: yes
- Internal benchmark mapping:
  - `eeg_ppg_alignment`
  - `ppg_morphology_benchmark`
  - `cognitive_load_benchmark`
- Recommended accepted roles:
  - first public EEG-PPG paired benchmark
  - event-locked digit-span and rest alignment dataset
  - PPG morphology and state target benchmark

## Quality and exclusions

- Known quality fields:
  - `participants.EEG_excluded`
  - `participants.ECG_excluded`
  - `participants.pupil_excluded`
  - `participants.behavior_excluded`
- Known artifact fields:
  - no waveform-level artifact summary fields were confirmed in this pass
- Candidate exclusion rules:
  - use only subjects with `EEG_excluded=no` and `ECG_excluded=no` for the default paired EEG-PPG cohort
  - use subjects without EEG as possible PPG-only auxiliary data, not as paired baselines
- Distribution shift notes:
  - subjects: `86`
  - paired EEG+PPG subjects: `65`
  - age range: `18-44`
  - sex distribution: `74F / 12M`
  - handedness: `77 right / 6 left / 3 both`
  - dominant eye: `61 right / 25 left`

## Manifest updates required

- [x] modality metadata confirmed
- [x] counts populated at the source-tree and cohort level
- [x] split plan attached
- [x] first pilot Phase 2 artifact built
- [x] coverage metadata populated
- [x] quality metadata expanded

## Acceptance decision

Current decision:

- keep as candidate

Decision rationale:

- the dataset is now source-backed enough to become the primary public EEG-PPG intake reference
- the paired cohort is large enough to justify Phase 2 work immediately
- the remaining blocker is not access or modality ambiguity anymore; it is expansion from the two-subject pilot to a broader cohort and a second public EEG-PPG benchmark

## Next actions

1. Expand the current pilot split into a broader default split policy for the `65` EEG+PPG paired subjects.
2. Start the first EEG->PPG morphology and event baselines on top of the pilot Phase 2 artifact.
3. Bring in `DS006848` as the second public EEG-PPG benchmark.

## Commands

```powershell
python scripts/cross_modal/validate_manifest_file.py manifests/cross_modal/public_ds003838.json
python scripts/cross_modal/validate_registry.py --registry manifests/cross_modal/registry.json
```
