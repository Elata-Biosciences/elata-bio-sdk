# DS004514 Intake Worksheet

Status: Active

## Purpose

This worksheet is the first dataset-specific Phase 1 intake document for the cross-modal biosignals program.

It is scoped to:

- [../../manifests/cross_modal/public_ds004514.json](../../manifests/cross_modal/public_ds004514.json)

Primary intended role:

- paired EEG-fNIRS latent alignment
- EEG-to-fNIRS baseline and translation experiments

Linked artifacts:

- [../../reports/cross_modal/intake/ds004514-intake-report.md](../../reports/cross_modal/intake/ds004514-intake-report.md)
- [ds004514-ingest-note.md](ds004514-ingest-note.md)
- [ds004514-split-plan.md](ds004514-split-plan.md)
- [ds004514-normalization-note.md](ds004514-normalization-note.md)
- [ds004514-smoke-ingest.md](ds004514-smoke-ingest.md)
- [intake-report-template.md](intake-report-template.md)

## Current manifest status

Manifest status:

- `candidate`

What is already recorded:

- official DOI
- source-backed modality presence
- source-backed feature dimensions and sample rates
- source-backed subject count and no-session layout
- intended benchmark role

What is still provisional:

- exact signal-level ingest path into canonical windows
- final held-out-subject split
- finalized event-alignment policy

## Intake checklist

### Access and source verification

- [x] confirm the dataset can be downloaded from the official OpenNeuro source
- [x] confirm snapshot `v1.1.2` is the intended frozen version for experiments
- [x] capture the dataset README and dataset description into intake notes

### Raw structure review

- [x] record top-level directory layout
- [x] record participant and session naming pattern
- [x] record whether data are already BIDS-clean for EEG and fNIRS
- [x] record whether any task metadata must be normalized

### EEG review

- [x] confirm EEG channel count from raw files
- [x] confirm EEG sampling rate from raw metadata
- [x] confirm channel-name convention and montage
- [x] note any missing or auxiliary channels

### fNIRS review

- [x] confirm fNIRS source-detector layout
- [x] confirm raw file format for fNIRS
- [x] confirm whether channel geometry is directly available
- [x] confirm whether a standard HbO/HbR conversion path is straightforward

### Pairing and timing review

- [ ] confirm EEG and fNIRS are truly simultaneous in the raw data
- [x] confirm timestamp or trigger alignment fields
- [x] note any drift or resynchronization concerns

### Labels and benchmark fit

- [x] confirm task labels present in the raw dataset
- [x] map task labels into the internal benchmark taxonomy
- [x] decide whether this dataset is suitable for alignment only or also translation baselines

### Quality and exclusions

- [x] record any known quality issues from dataset docs
- [ ] define exclusion rules for unusable subjects or sessions
- [ ] record whether any sessions should be evaluation-only

## Intake outputs required

Before this manifest can move from `candidate` to `ready`, the following should exist:

- [x] completed manifest with confirmed counts and modality metadata
- [x] one dataset-specific intake report with raw-file findings
- [x] one short ingest note summarizing file layout
- [x] one split plan for held-out-subject evaluation
- [x] one normalization note describing how EEG and fNIRS will be converted into canonical windows

## Recommended first ingest decision

If the dataset passes the checklist above, accept it for:

- EEG-fNIRS latent alignment
- EEG-to-fNIRS linear and lightweight neural baselines

Do not assume it is immediately suitable for:

- final production-like evaluation
- channel-perfect geometry transfer without adaptation

## Validation

Manifest validation:

```powershell
python scripts/cross_modal/validate_manifest_file.py manifests/cross_modal/public_ds004514.json
```

Registry validation:

```powershell
python scripts/cross_modal/validate_registry.py --registry manifests/cross_modal/registry.json
```
