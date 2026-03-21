# DS004514 Intake Worksheet

Status: Active

## Purpose

This worksheet is the first dataset-specific Phase 1 intake document for the cross-modal biosignals program.

It is scoped to:

- [../../manifests/cross_modal/public_ds004514.json](../../manifests/cross_modal/public_ds004514.json)

Primary intended role:

- paired EEG-fNIRS latent alignment
- EEG-to-fNIRS baseline and translation experiments

## Current manifest status

Manifest status:

- `candidate`

What is already recorded:

- official DOI
- provisional modality presence
- provisional feature dimensions and sample rates
- intended benchmark role

What is still provisional:

- exact subject count
- exact session count
- exact raw file layout
- exact ingest path into canonical windows

## Intake checklist

### Access and source verification

- [ ] confirm the dataset can be downloaded from the official OpenNeuro source
- [ ] confirm snapshot `v1.1.2` is the intended frozen version for experiments
- [ ] capture the dataset README and dataset description into intake notes

### Raw structure review

- [ ] record top-level directory layout
- [ ] record participant and session naming pattern
- [ ] record whether data are already BIDS-clean for EEG and fNIRS
- [ ] record whether any task metadata must be normalized

### EEG review

- [ ] confirm EEG channel count from raw files
- [ ] confirm EEG sampling rate from raw metadata
- [ ] confirm channel-name convention and montage
- [ ] note any missing or auxiliary channels

### fNIRS review

- [ ] confirm fNIRS source-detector layout
- [ ] confirm raw file format for fNIRS
- [ ] confirm whether channel geometry is directly available
- [ ] confirm whether a standard HbO/HbR conversion path is straightforward

### Pairing and timing review

- [ ] confirm EEG and fNIRS are truly simultaneous in the raw data
- [ ] confirm timestamp or trigger alignment fields
- [ ] note any drift or resynchronization concerns

### Labels and benchmark fit

- [ ] confirm task labels present in the raw dataset
- [ ] map task labels into the internal benchmark taxonomy
- [ ] decide whether this dataset is suitable for alignment only or also translation baselines

### Quality and exclusions

- [ ] record any known quality issues from dataset docs
- [ ] define exclusion rules for unusable subjects or sessions
- [ ] record whether any sessions should be evaluation-only

## Intake outputs required

Before this manifest can move from `candidate` to `ready`, the following should exist:

- [ ] completed manifest with confirmed counts and modality metadata
- [ ] one short ingest note summarizing file layout
- [ ] one split plan for held-out-subject evaluation
- [ ] one normalization note describing how EEG and fNIRS will be converted into canonical windows

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
