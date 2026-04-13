# Phase 1 Dataset Registry

Status: Active

## Purpose

This registry is the first concrete Phase 1 intake surface for the cross-modal biosignals program.

It tracks:

- the internal Athena intake template
- candidate public paired datasets
- their intended role in the training plan

Registry file:

- [../../manifests/cross_modal/registry.json](../../manifests/cross_modal/registry.json)

## Current entries

### Internal

- [../../manifests/cross_modal/athena_internal.template.json](../../manifests/cross_modal/athena_internal.template.json)
  Role: internal tri-modal source of truth
  Status: template
  Priority: highest
  Intake note: [athena-intake-note.md](athena-intake-note.md)
  Recording spec: [athena-recording-spec.md](athena-recording-spec.md)
  Pilot report: [../../reports/cross_modal/intake/athena-internal-pilot-report.md](../../reports/cross_modal/intake/athena-internal-pilot-report.md)
  Phase 2 smoke note: [athena-phase2-windowing.md](athena-phase2-windowing.md)

### Public EEG-fNIRS

- [../../manifests/cross_modal/public_ds004514.json](../../manifests/cross_modal/public_ds004514.json)
  Role: paired EEG-fNIRS latent alignment and translation baseline intake
  Status: candidate
  Priority: highest
  Verified source: `https://doi.org/10.18112/openneuro.ds004514.v1.1.2`
  Worksheet: [ds004514-intake-worksheet.md](ds004514-intake-worksheet.md)
  Ingest note: [ds004514-ingest-note.md](ds004514-ingest-note.md)
  Split plan: [ds004514-split-plan.md](ds004514-split-plan.md)
  Normalization note: [ds004514-normalization-note.md](ds004514-normalization-note.md)
  Intake report: [../../reports/cross_modal/intake/ds004514-intake-report.md](../../reports/cross_modal/intake/ds004514-intake-report.md)

### Public EEG-PPG

- [../../manifests/cross_modal/public_ds003838.json](../../manifests/cross_modal/public_ds003838.json)
  Role: EEG-PPG alignment and morphology benchmarking
  Status: candidate
  Priority: high
  Verified source: `https://doi.org/10.18112/openneuro.ds003838.v1.0.6`

- [../../manifests/cross_modal/public_ds006848.json](../../manifests/cross_modal/public_ds006848.json)
  Role: EEG-PPG rest and working-memory benchmarking
  Status: candidate
  Priority: high
  Verified source: `https://doi.org/10.18112/openneuro.ds006848.v1.0.0`
  Intake report: [../../reports/cross_modal/intake/ds006848-intake-report.md](../../reports/cross_modal/intake/ds006848-intake-report.md)

### Public sleep EEG-PPG

- [../../manifests/cross_modal/public_dreamt.json](../../manifests/cross_modal/public_dreamt.json)
  Role: auxiliary EEG-PPG aligned resource for sleep-state experiments
  Status: candidate
  Priority: medium
  Verified source: `https://doi.org/10.13026/7r9r-7r24`

## Intake workflow

For each entry:

1. validate the manifest against the shared contract
2. complete missing split and coverage metadata
3. complete license and access review
4. create or update the dataset-specific intake report under `reports/cross_modal/intake/`
5. decide whether the dataset is accepted for pretraining, paired alignment, held-out evaluation, or rejected

Validation command:

```powershell
python scripts/cross_modal/validate_manifest_file.py manifests/cross_modal/public_ds004514.json
```

## Notes

- These manifests are deliberately lightweight and may contain placeholder counts until real ingest is performed.
- Public dataset modality dimensions and sampling rates should be confirmed during implementation, even when a candidate manifest already contains a provisional value.
- `DS006848` now also has a first 2-subject rest Phase 2 pilot, so its next open question is broader waveform quality and rest-target derivation, not whether a rest branch can be built at all.
- Athena now also has a fixture-backed candidate prep path and a transport-level Phase 2 smoke path, but the internal entry should still be treated as a template until real session exports replace the fixture root and the optics-to-fNIRS / PPG mapping blockers are closed.
