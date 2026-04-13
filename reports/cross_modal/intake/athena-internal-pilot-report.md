# Athena Internal Pilot Report

Status: Candidate prep path

## Inputs

- Config: `configs/cross_modal/athena_prepare_fixture.toml`
- Capture root: `examples/cross_modal/athena_pilot_fixture`
- Output manifest: `reports/cross_modal/athena/athena_internal_fixture_manifest.json`

## Overview

- subjects discovered: `2`
- sessions discovered: `2`
- protocols discovered: `rest_eyes_open, verbalwm_digits`
- required modality coverage: `eeg`, `fnirs`, `ppg` present in all `2` sessions

## Session Export Contract

- Each session directory must contain `athena_session.json`.
- The sidecar is the source of truth for subject/session IDs, protocol labels, timestamp source, modality file paths, and quality metadata.
- The prep path intentionally keeps Athena intake at `candidate` status until real internal recordings replace the fixture and unresolved mapping questions are closed.

## Session Inventory

- `ses-2026-04-10-rest`
  subject `athena-sub-001`, protocol `rest_eyes_open`, task `rest`, modalities `eeg, fnirs, ppg, imu`
- `ses-2026-04-11-verbalwm`
  subject `athena-sub-002`, protocol `verbalwm_digits`, task `verbalwm`, modalities `eeg, fnirs, ppg, imu`

## Open Blockers

- Athena fNIRS processing remains unconfirmed for sessions: ses-2026-04-10-rest, ses-2026-04-11-verbalwm.
- Athena PPG mapping remains unconfirmed for sessions: ses-2026-04-10-rest, ses-2026-04-11-verbalwm.
- Athena event-label export is not yet demonstrated for sessions: ses-2026-04-10-rest, ses-2026-04-11-verbalwm.

## Aggregation Notes

- none

## Recommendation

- keep as candidate
- use this pilot contract to mount real Athena captures into the repo-local Phase 1 flow
- do not start Athena Phase 5 modeling until the real internal export closes the fNIRS processing, PPG mapping, and event-label blockers listed above

## Commands

```powershell
python scripts/cross_modal/prepare_athena_dataset.py --config configs/cross_modal/athena_prepare_fixture.toml
python scripts/cross_modal/validate_manifest_file.py reports/cross_modal/athena/athena_internal_fixture_manifest.json
```
