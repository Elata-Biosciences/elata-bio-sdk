# DS004514 Split Plan

Status: Active

## Purpose

This document defines the subject-level evaluation policy for `DS004514`.

Related files:

- [../../manifests/cross_modal/public_ds004514.json](../../manifests/cross_modal/public_ds004514.json)
- [ds004514-intake-worksheet.md](ds004514-intake-worksheet.md)
- [ds004514-ingest-note.md](ds004514-ingest-note.md)
- [../../reports/cross_modal/intake/ds004514-intake-report.md](../../reports/cross_modal/intake/ds004514-intake-report.md)

## Dataset constraints

- total subjects: `12`
- session structure: one subject directory per participant, no session subdirectories observed
- age range: `20-57`
- sex counts: `9F`, `3M`
- handedness: all recorded values are `R`

This is too small for a single train/validation/test split to be trusted as the main reported result.

## Primary evaluation protocol

Primary reported evaluation for `DS004514` should use leave-one-subject-out cross-validation.

Per fold:

1. hold out one full subject for evaluation
2. train on the remaining `11` subjects
3. if a validation split is needed, carve it from the training pool only
4. aggregate metrics across all `12` folds

Required reporting:

- mean and standard deviation across folds
- per-subject metrics
- metric breakdown by age and sex where sample size allows
- failure analysis for the worst two held-out subjects

## Fixed smoke split

For fast iteration and reproducible smoke tests, use one provisional fixed split before running the full LOSO grid.

Provisional smoke evaluation subjects:

- `sub-03` age `57`, sex `M`
- `sub-04` age `47`, sex `F`
- `sub-11` age `28`, sex `M`

Provisional smoke training subjects:

- `sub-01`
- `sub-02`
- `sub-05`
- `sub-06`
- `sub-07`
- `sub-08`
- `sub-09`
- `sub-10`
- `sub-12`

Rationale:

- keeps at least one male subject in the training pool
- places two male subjects in evaluation, which matters because the dataset contains only three male subjects total
- covers younger, mid-range, and older ages in the provisional evaluation slice
- is small enough to support quick baseline debugging before running all LOSO folds

This fixed split is for development only. Reported benchmark numbers should still come from LOSO.

## Leakage rules

Never allow:

- windows from the held-out subject into training
- normalization statistics fit on held-out subject data
- event template selection or alignment hyperparameters tuned on held-out subject traces
- derived HbO/HbR calibration choices tuned on held-out subject traces

Allowed:

- dataset-level channel mapping rules defined once from public metadata
- preprocessing code shared across folds when its parameters are fixed before evaluation

## Distribution-shift checks

For each LOSO fold, log:

- held-out subject age
- held-out subject sex
- training age mean and range
- held-out subject reconstruction loss relative to fold median
- held-out subject alignment error relative to fold median

If older held-out subjects or male held-out subjects systematically fail, that should be called out explicitly in the benchmark notes rather than hidden inside the average.

## Promotion rule

`DS004514` should not move from `candidate` to `ready` until:

- the fixed smoke split is encoded in the first ingest scripts or configs
- the LOSO fold-generation rule is implemented
- held-out-subject metrics are emitted in machine-readable form
