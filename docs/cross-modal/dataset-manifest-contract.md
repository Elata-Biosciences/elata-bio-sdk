# Cross-Modal Dataset Manifest Contract

Status: Active

## Purpose

This document defines the lightweight manifest contract used by the toy-mode path now and intended for Phase 1 dataset intake work later.

The goal is to avoid inventing one manifest shape for toy mode and another for real data.

## Contract summary

Every cross-modal dataset manifest should contain:

- `kind`
- `schema_version`
- `identity`
- `storage`
- `modalities`
- `split_summary`
- `coverage`
- `labels`
- `quality`
- `notes`

Optional sections may be added, but these core sections should stay stable.

## Required sections

### `identity`

Minimum fields:

- `dataset_name`
- `dataset_version`
- `source_type`
- `intake_status`
- `source_uri`
- `license`

Allowed `source_type` values:

- `synthetic`
- `public`
- `internal`

Allowed `intake_status` values:

- `template`
- `candidate`
- `ready`

### `storage`

Minimum fields:

- `dataset_path`
- `manifest_path`

### `modalities`

Expected modality keys:

- `eeg`
- `fnirs`
- `ppg`

Each modality block should include:

- `present`
- `feature_dim` if present
- `sampling_rate_hz` when known
- `geometry_available`

### `split_summary`

Minimum fields:

- `train_windows`
- `eval_windows`
- `heldout_subjects`

### `coverage`

Minimum fields:

- `subject_ids`
- `session_ids`
- `protocols`
- `shift_metadata_keys`

### `labels`

Minimum fields:

- `event_labels_present`
- `ppg_morphology_targets_present`
- `task_labels_present`

### `quality`

Minimum fields:

- `quality_fields`
- `artifact_fields`

## Notes on intent

- `feature_dim` is allowed to stay lightweight in toy mode and early intake work.
- `sampling_rate_hz` may be `null` until real ingest is implemented.
- `geometry_available` should be explicit even when false.
- `heldout_subjects` should reflect the real evaluation boundary, not just a convenience split.
- only manifests marked `ready` are required to have non-zero train and eval window counts.

## Files

- shared validator/helpers: [../../scripts/cross_modal/manifest_contract.py](../../scripts/cross_modal/manifest_contract.py)
- template manifest: [dataset-manifest-template.json](dataset-manifest-template.json)
- toy example manifest: [../../reports/cross_modal/toy/proto_cpu_manifest.json](../../reports/cross_modal/toy/proto_cpu_manifest.json)
