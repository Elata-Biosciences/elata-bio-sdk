# Phase 1 Public Intake Note

Status: Active

## Purpose

This note summarizes the current state of the public candidate manifests and what remains before each source is actually ready for ingest.

## Current public candidates

### DS004514

- Manifest: [../../manifests/cross_modal/public_ds004514.json](../../manifests/cross_modal/public_ds004514.json)
- Intended role: paired EEG-fNIRS alignment and EEG-to-fNIRS baseline work
- What is verified:
  - official OpenNeuro DOI `10.18112/openneuro.ds004514.v1.1.2`
- What remains:
  - confirm exact subject and session counts
  - confirm raw-file layout and preprocessing expectations

### DS003838

- Manifest: [../../manifests/cross_modal/public_ds003838.json](../../manifests/cross_modal/public_ds003838.json)
- Intended role: EEG-PPG alignment and PPG morphology benchmarking
- What is verified:
  - official OpenNeuro DOI `10.18112/openneuro.ds003838.v1.0.6`
- What remains:
  - confirm exact recording layout
  - confirm morphology-grade raw waveform quality

### DS006848

- Manifest: [../../manifests/cross_modal/public_ds006848.json](../../manifests/cross_modal/public_ds006848.json)
- Intended role: EEG-PPG rest and working-memory benchmarking
- What is verified:
  - official OpenNeuro DOI `10.18112/openneuro.ds006848.v1.0.0`
- What remains:
  - confirm exact modality layout
  - normalize protocol labels into the benchmark taxonomy

### DREAMT

- Manifest: [../../manifests/cross_modal/public_dreamt.json](../../manifests/cross_modal/public_dreamt.json)
- Intended role: auxiliary sleep-state EEG-PPG resource
- What is verified:
  - official PhysioNet page for DREAMT version `2.1.0`
  - aligned wearable BVP and PSG-style signals are documented on the official page
- What remains:
  - credentialed-access review
  - define which EEG subset is useful for the planned experiments

## Intake rule

These public manifests are valid `candidate` manifests, not `ready` manifests.

They should only move to `ready` after:

1. raw access is confirmed
2. actual file layout is checked
3. split counts are populated
4. ingest notes are written

## Validation commands

Validate the whole registry:

```powershell
python scripts/cross_modal/validate_registry.py --registry manifests/cross_modal/registry.json
```

Validate one manifest:

```powershell
python scripts/cross_modal/validate_manifest_file.py manifests/cross_modal/public_ds003838.json
```
