# DS003838 Phase 2 Windowing

Status: Active

## Purpose

This note describes the first executable Phase 2 EEG-PPG artifact for `DS003838`.

## Scope

The current path is intentionally narrow:

- dataset: `DS003838`
- task: `task-memory`
- subjects: pilot split from [ds003838-split-plan.md](ds003838-split-plan.md)
- pairing method: direct EEG and cardiovascular event-table matching
- EEG source: `eeg/*.set`
- PPG source: `ecg/*.set` channel `PPG`

## Artifact

The Phase 2 builder emits:

- native EEG event windows
- cleaned EEG windows
- native PPG morphology windows
- cleaned PPG windows
- per-window metadata with alignment and morphology-quality fields
- a downstream target-derivation path can now consume this artifact without reopening the raw dataset

Smoke-contract pilot result:

- split: `sub-032`, `sub-034` train; `sub-033`, `sub-035` eval
- task: `memory`
- paired windows: `2048`
- quality-pass windows: `2048`
- EEG event tensor: `2048 x 63 x 500`
- EEG clean tensor: `2048 x 63 x 128`
- PPG native tensor: `2048 x 2000`
- PPG clean tensor: `2048 x 256`
- max alignment residual: `0.0 s`
- mean detected PPG peak count per window: about `3.361`
- downstream target coverage on top of this artifact:
  - dominant-beat-valid windows: `2046`
  - notch-valid windows: `110`

Expanded development result:

- split: `sub-032`, `sub-034`, `sub-036`, `sub-038` train; `sub-033`, `sub-035`, `sub-039`, `sub-040` eval
- task: `memory`
- paired windows: `4096`
- quality-pass windows: `4096`
- EEG event tensor: `4096 x 63 x 500`
- EEG clean tensor: `4096 x 63 x 128`
- PPG native tensor: `4096 x 2000`
- PPG clean tensor: `4096 x 256`
- max alignment residual: `0.0 s`
- mean detected PPG peak count per window: about `3.377`
- downstream target coverage on top of this artifact:
  - dominant-beat-valid windows: `4091`
  - notch-valid windows: `299`

## Why this path exists

This is the first real EEG-PPG Phase 2 step after the business-priority pivot away from `EEG-fNIRS` as the immediate goal.

It is deliberately built as a small pilot path, not a full-cohort production ingest.

The repo now carries two DS003838 Phase 2 tiers:

- the 4-subject pilot as the smoke contract
- the 8-subject split as the broader development check

## Commands

```powershell
python scripts/cross_modal/fetch_ds003838_assets.py --config configs/cross_modal/ds003838_phase2_windows.toml
python scripts/cross_modal/build_ds003838_phase2_windows.py --config configs/cross_modal/ds003838_phase2_windows.toml
python scripts/cross_modal/validate_ds003838_phase2_windows.py --config configs/cross_modal/ds003838_phase2_windows.toml
python scripts/cross_modal/benchmark_ds003838_filters.py --config configs/cross_modal/ds003838_phase2_windows.toml

python scripts/cross_modal/fetch_ds003838_assets.py --config configs/cross_modal/ds003838_phase2_windows_expanded.toml
python scripts/cross_modal/build_ds003838_phase2_windows.py --config configs/cross_modal/ds003838_phase2_windows_expanded.toml
python scripts/cross_modal/validate_ds003838_phase2_windows.py --config configs/cross_modal/ds003838_phase2_windows_expanded.toml
python scripts/cross_modal/benchmark_ds003838_filters.py --config configs/cross_modal/ds003838_phase2_windows_expanded.toml
```

## Current design choices

- keep native PPG at `1000 Hz`
- keep a separate cleaned PPG branch rather than overwriting the native branch
- use mild PPG denoising first, then quantify distortion
- keep the first split small enough that a researcher can rerun it locally
- keep target derivation separate from the Phase 2 builder so future target revisions do not require rebuilding windows

## Artifacts

- [../../reports/cross_modal/ds003838/ds003838_phase2_fetch_report.json](../../reports/cross_modal/ds003838/ds003838_phase2_fetch_report.json)
- [../../reports/cross_modal/ds003838/ds003838_phase2_windows.npz](../../reports/cross_modal/ds003838/ds003838_phase2_windows.npz)
- [../../reports/cross_modal/ds003838/ds003838_phase2_windows_metadata.json](../../reports/cross_modal/ds003838/ds003838_phase2_windows_metadata.json)
- [../../reports/cross_modal/ds003838/ds003838_phase2_windows_metrics.json](../../reports/cross_modal/ds003838/ds003838_phase2_windows_metrics.json)
- [../../reports/cross_modal/ds003838/ds003838_phase2_windows_summary.md](../../reports/cross_modal/ds003838/ds003838_phase2_windows_summary.md)
- [../../reports/cross_modal/ds003838/ds003838_phase2_filter_benchmark.json](../../reports/cross_modal/ds003838/ds003838_phase2_filter_benchmark.json)
- [../../reports/cross_modal/ds003838/ds003838_phase2_filter_benchmark.md](../../reports/cross_modal/ds003838/ds003838_phase2_filter_benchmark.md)
- [../../reports/cross_modal/ds003838/ds003838_phase2_expanded_fetch_report.json](../../reports/cross_modal/ds003838/ds003838_phase2_expanded_fetch_report.json)
- [../../reports/cross_modal/ds003838/ds003838_phase2_expanded_windows.npz](../../reports/cross_modal/ds003838/ds003838_phase2_expanded_windows.npz)
- [../../reports/cross_modal/ds003838/ds003838_phase2_expanded_windows_metadata.json](../../reports/cross_modal/ds003838/ds003838_phase2_expanded_windows_metadata.json)
- [../../reports/cross_modal/ds003838/ds003838_phase2_expanded_windows_metrics.json](../../reports/cross_modal/ds003838/ds003838_phase2_expanded_windows_metrics.json)
- [../../reports/cross_modal/ds003838/ds003838_phase2_expanded_windows_summary.md](../../reports/cross_modal/ds003838/ds003838_phase2_expanded_windows_summary.md)
- [../../reports/cross_modal/ds003838/ds003838_phase2_expanded_filter_benchmark.json](../../reports/cross_modal/ds003838/ds003838_phase2_expanded_filter_benchmark.json)
- [../../reports/cross_modal/ds003838/ds003838_phase2_expanded_filter_benchmark.md](../../reports/cross_modal/ds003838/ds003838_phase2_expanded_filter_benchmark.md)
