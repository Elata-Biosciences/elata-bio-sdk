# Athena Phase 2 Windowing

Status: Active smoke contract

## Purpose

This note describes the first repo-runnable Athena Phase 2 smoke artifact.

It exists to exercise Athena-side timestamp alignment, tensor shaping, and QC plumbing before real internal recordings are mounted into the repo.

## Scope

Current scope:

- input source: standardized Athena session-export contract from [athena-recording-spec.md](athena-recording-spec.md)
- intake dependency: [athena-internal-pilot-report.md](../../reports/cross_modal/intake/athena-internal-pilot-report.md)
- current backing data: fixture-only synthetic captures under `examples/cross_modal/athena_pilot_fixture`
- current modality handling:
  - EEG: event-style native branch plus a lightweight cleaned branch
  - optics: preserved as transport-level optics windows, not promoted to confirmed fNIRS/HbO/HbR
  - PPG: native branch plus a lightweight cleaned branch

This is intentionally not a canonical Athena research dataset yet.

## Artifact

The Athena Phase 2 smoke builder emits:

- native EEG windows
- cleaned EEG windows
- optics transport windows
- native PPG windows
- cleaned PPG windows
- per-window metadata with overlap, estimated sampling rates, and quality flags

Fixture smoke result:

- train subject: `athena-sub-001`
- eval subject: `athena-sub-002`
- paired windows: `2`
- quality-pass windows: `2`
- EEG event tensor: `2 x 8 x 512`
- EEG clean tensor: `2 x 8 x 128`
- optics transport tensor: `2 x 8 x 128`
- PPG native tensor: `2 x 128`
- PPG clean tensor: `2 x 64`
- minimum shared overlap: about `1.984375 s`

## Important constraint

This path deliberately does not rename optics transport into canonical fNIRS.

Current Athena blockers still apply:

- internal fNIRS processing is not yet confirmed
- internal PPG mapping is not yet confirmed
- event-label export is not yet demonstrated

That means this artifact is useful for:

- Athena export-contract validation
- timestamp and overlap checks
- lightweight tensor-shape and encoder smoke tests

It is not yet suitable for:

- Athena Phase 5 latent-alignment claims
- real physiology performance claims
- cross-subject benchmark conclusions

## Commands

```powershell
python scripts/cross_modal/prepare_athena_dataset.py --config configs/cross_modal/athena_prepare_fixture.toml
python scripts/cross_modal/validate_manifest_file.py reports/cross_modal/athena/athena_internal_fixture_manifest.json
python scripts/cross_modal/build_athena_phase2_windows.py --config configs/cross_modal/athena_phase2_fixture.toml
python scripts/cross_modal/validate_athena_phase2_windows.py --config configs/cross_modal/athena_phase2_fixture.toml
```

## Artifacts

- [../../configs/cross_modal/athena_phase2_fixture.toml](../../configs/cross_modal/athena_phase2_fixture.toml)
- [../../reports/cross_modal/athena/athena_internal_fixture_manifest.json](../../reports/cross_modal/athena/athena_internal_fixture_manifest.json)
- [../../reports/cross_modal/athena/athena_internal_fixture_metrics.json](../../reports/cross_modal/athena/athena_internal_fixture_metrics.json)
- [../../reports/cross_modal/athena/athena_internal_fixture_phase2_windows.npz](../../reports/cross_modal/athena/athena_internal_fixture_phase2_windows.npz)
- [../../reports/cross_modal/athena/athena_internal_fixture_phase2_windows_metadata.json](../../reports/cross_modal/athena/athena_internal_fixture_phase2_windows_metadata.json)
- [../../reports/cross_modal/athena/athena_internal_fixture_phase2_windows_metrics.json](../../reports/cross_modal/athena/athena_internal_fixture_phase2_windows_metrics.json)
- [../../reports/cross_modal/athena/athena_internal_fixture_phase2_windows_summary.md](../../reports/cross_modal/athena/athena_internal_fixture_phase2_windows_summary.md)
