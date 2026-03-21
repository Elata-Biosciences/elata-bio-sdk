# Intake Report Template

Status: Template

## Purpose

This template is the canonical report format for a dataset-specific Phase 1 intake pass.

Use it after a candidate manifest and worksheet already exist.

The report should capture actual findings from file inspection, not just planned checks.

## Required metadata

- Dataset ID:
- Manifest:
- Worksheet:
- Intake owner:
- Intake date:
- Source version:
- Current recommendation:

## Scope

Record:

- what raw files were inspected
- what metadata were confirmed directly
- what remains provisional
- whether the dataset should move from `candidate` to `ready`

## Source access

- Access path:
- Download or mount method:
- Snapshot or release tag:
- License check:

## Raw layout findings

- Top-level directories:
- Subject naming pattern:
- Session naming pattern:
- File formats:
- BIDS compliance notes:

## Modality findings

### EEG

- Confirmed present:
- Confirmed channel count:
- Confirmed sampling rate:
- Channel naming and montage notes:
- Auxiliary or missing channel notes:

### fNIRS

- Confirmed present:
- Confirmed raw format:
- Confirmed sampling rate:
- Source-detector geometry notes:
- HbO/HbR conversion notes:

### PPG

- Confirmed present:
- Confirmed raw format:
- Confirmed sampling rate:
- Morphology preservation notes:

## Pairing and timing

- Simultaneous recording confirmed:
- Alignment field or trigger source:
- Drift concerns:
- Canonical windowing risk notes:

## Labels and benchmark fit

- Task labels present:
- Event labels present:
- Internal benchmark mapping:
- Recommended accepted roles:

## Quality and exclusions

- Known quality fields:
- Known artifact fields:
- Candidate exclusion rules:
- Distribution shift notes:

## Manifest updates required

- [ ] modality metadata confirmed
- [ ] counts populated
- [ ] split plan attached
- [ ] coverage metadata populated
- [ ] quality metadata expanded

## Acceptance decision

One of:

- reject
- keep as candidate
- accept as ready for limited baselines
- accept as ready for mainline experiments

Decision rationale:

- 

## Commands

```powershell
python scripts/cross_modal/validate_manifest_file.py manifests/cross_modal/<dataset>.json
python scripts/cross_modal/validate_registry.py --registry manifests/cross_modal/registry.json
```
