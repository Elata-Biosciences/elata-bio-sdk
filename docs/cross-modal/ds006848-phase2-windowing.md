# DS006848 Phase 2 Windowing

Status: Active

## Purpose

This note describes the executable Phase 2 EEG-PPG artifacts for `DS006848`.

## Scope

The current path now has four layers:

- dataset: `DS006848`
- task: `task-verbalwm`
- subjects:
  - smoke split from [ds006848-split-plan.md](ds006848-split-plan.md)
  - first 4-subject development split from [ds006848-split-plan.md](ds006848-split-plan.md)
  - current broader 8-subject development split from [ds006848-split-plan.md](ds006848-split-plan.md)
- task: `task-rest`
- subjects:
  - rest smoke split from [ds006848-split-plan.md](ds006848-split-plan.md)
- pairing method: shared BrainVision file plus task-event sample anchors
- EEG source: `eeg/*.vhdr` with BrainVision payloads
- PPG source: `PPG` channel inside the same BrainVision recording

## Artifact

The Phase 2 builder emits:

- native EEG event windows
- cleaned EEG windows
- native PPG morphology windows
- cleaned PPG windows
- per-window metadata with event-family and morphology-quality fields
- a downstream target-derivation path can now consume this artifact without reopening the raw dataset

Smoke-contract pilot result:

- split: `sub-001` train; `sub-007` eval
- task: `verbalwm`
- paired windows: `512`
- quality-pass windows: `512`
- EEG event tensor: `512 x 63 x 500`
- EEG clean tensor: `512 x 63 x 128`
- PPG native tensor: `512 x 2000`
- PPG clean tensor: `512 x 256`
- max alignment residual: `0.0 s`
- mean detected PPG peak count per window: about `3.268`

Rest smoke-contract pilot result:

- split: `sub-001` train; `sub-007` eval
- task: `rest`
- paired windows: `20`
- quality-pass windows: `20`
- EEG event tensor: `20 x 63 x 500`
- EEG clean tensor: `20 x 63 x 128`
- PPG native tensor: `20 x 2000`
- PPG clean tensor: `20 x 256`
- max alignment residual: `0.0 s`
- mean detected PPG peak count per window: about `3.150`
- event-family mix:
  - `rest_state`: `16`
  - `rest_cartoon`: `4`

First development result:

- split:
  - train `sub-001`, `sub-010`
  - eval `sub-007`, `sub-012`
- task: `verbalwm`
- paired windows: `1024`
- quality-pass windows: `1024`
- EEG event tensor: `1024 x 63 x 500`
- EEG clean tensor: `1024 x 63 x 128`
- PPG native tensor: `1024 x 2000`
- PPG clean tensor: `1024 x 256`
- max alignment residual: `0.0 s`
- mean detected PPG peak count per window: about `3.270`

Current broader development result:

- split:
  - train `sub-001`, `sub-010`, `sub-013`, `sub-015`
  - eval `sub-007`, `sub-012`, `sub-016`, `sub-017`
- task: `verbalwm`
- paired windows: `2048`
- quality-pass windows: `1983`
- EEG event tensor: `2048 x 63 x 500`
- EEG clean tensor: `2048 x 63 x 128`
- PPG native tensor: `2048 x 2000`
- PPG clean tensor: `2048 x 256`
- max alignment residual: `0.0 s`
- mean detected PPG peak count per window: about `3.293`

Important quality detail on the broader split:

- train quality-pass windows stay dense at `1024 / 1024`
- eval quality-pass windows drop to `959 / 1024`
- the quality attrition is concentrated in:
  - `sub-016`: `235 / 256`
  - `sub-017`: `212 / 256`
- the reviewed broader verbalwm cohort now has an explicit gate:
  - [ds006848-subject-quality-policy.md](ds006848-subject-quality-policy.md)
  - `sub-016` is `stress_test_only`
  - `sub-017` is `borderline_review`

## Why this path exists

`DS006848` is the second public EEG-PPG benchmark candidate in the repo and the first one where EEG, PPG, and ECG are already co-recorded in a single raw file.

That makes it the cleanest next Phase 2 target after the `DS003838` failure analysis:

- less synchronization ambiguity than `DS003838`
- explicit rest plus verbal working-memory protocol coverage
- direct BrainVision access with channel geometry sidecars

## Commands

```powershell
python scripts/cross_modal/fetch_ds006848_assets.py --config configs/cross_modal/ds006848_phase2_windows.toml
python scripts/cross_modal/build_ds006848_phase2_windows.py --config configs/cross_modal/ds006848_phase2_windows.toml
python scripts/cross_modal/validate_ds006848_phase2_windows.py --config configs/cross_modal/ds006848_phase2_windows.toml
python scripts/cross_modal/benchmark_ds006848_filters.py --config configs/cross_modal/ds006848_phase2_windows.toml

python scripts/cross_modal/fetch_ds006848_assets.py --config configs/cross_modal/ds006848_phase2_windows_expanded.toml
python scripts/cross_modal/build_ds006848_phase2_windows.py --config configs/cross_modal/ds006848_phase2_windows_expanded.toml
python scripts/cross_modal/validate_ds006848_phase2_windows.py --config configs/cross_modal/ds006848_phase2_windows_expanded.toml
python scripts/cross_modal/benchmark_ds006848_filters.py --config configs/cross_modal/ds006848_phase2_windows_expanded.toml

python scripts/cross_modal/fetch_ds006848_assets.py --config configs/cross_modal/ds006848_phase2_windows_broader.toml
python scripts/cross_modal/build_ds006848_phase2_windows.py --config configs/cross_modal/ds006848_phase2_windows_broader.toml
python scripts/cross_modal/validate_ds006848_phase2_windows.py --config configs/cross_modal/ds006848_phase2_windows_broader.toml
python scripts/cross_modal/benchmark_ds006848_filters.py --config configs/cross_modal/ds006848_phase2_windows_broader.toml

python scripts/cross_modal/fetch_ds006848_assets.py --config configs/cross_modal/ds006848_phase2_windows_rest.toml
python scripts/cross_modal/build_ds006848_phase2_windows.py --config configs/cross_modal/ds006848_phase2_windows_rest.toml
python scripts/cross_modal/validate_ds006848_phase2_windows.py --config configs/cross_modal/ds006848_phase2_windows_rest.toml
python scripts/cross_modal/benchmark_ds006848_filters.py --config configs/cross_modal/ds006848_phase2_windows_rest.toml
```

## Current design choices

- keep native PPG at `1000 Hz`
- keep a separate cleaned PPG branch rather than overwriting the native branch
- use a `50 Hz` notch to match the source power-line metadata
- keep the DS006848-specific `ppg_clean_std` gate rather than reusing the earlier DS003838 threshold blindly
- treat verbalwm as the first development branch and rest as the current smoke-level secondary branch
- treat the subject-quality policy as the cohort gate for future broader verbalwm comparisons

## Artifacts

- [../../configs/cross_modal/ds006848_phase2_windows.toml](../../configs/cross_modal/ds006848_phase2_windows.toml)
- [../../reports/cross_modal/ds006848/ds006848_phase2_fetch_report.json](../../reports/cross_modal/ds006848/ds006848_phase2_fetch_report.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_windows.npz](../../reports/cross_modal/ds006848/ds006848_phase2_windows.npz)
- [../../reports/cross_modal/ds006848/ds006848_phase2_windows_metadata.json](../../reports/cross_modal/ds006848/ds006848_phase2_windows_metadata.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_windows_metrics.json](../../reports/cross_modal/ds006848/ds006848_phase2_windows_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_windows_summary.md](../../reports/cross_modal/ds006848/ds006848_phase2_windows_summary.md)
- [../../reports/cross_modal/ds006848/ds006848_phase2_filter_benchmark.json](../../reports/cross_modal/ds006848/ds006848_phase2_filter_benchmark.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_filter_benchmark.md](../../reports/cross_modal/ds006848/ds006848_phase2_filter_benchmark.md)
- [../../configs/cross_modal/ds006848_phase2_windows_expanded.toml](../../configs/cross_modal/ds006848_phase2_windows_expanded.toml)
- [../../reports/cross_modal/ds006848/ds006848_phase2_expanded_fetch_report.json](../../reports/cross_modal/ds006848/ds006848_phase2_expanded_fetch_report.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_expanded_windows.npz](../../reports/cross_modal/ds006848/ds006848_phase2_expanded_windows.npz)
- [../../reports/cross_modal/ds006848/ds006848_phase2_expanded_windows_metadata.json](../../reports/cross_modal/ds006848/ds006848_phase2_expanded_windows_metadata.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_expanded_windows_metrics.json](../../reports/cross_modal/ds006848/ds006848_phase2_expanded_windows_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_expanded_windows_summary.md](../../reports/cross_modal/ds006848/ds006848_phase2_expanded_windows_summary.md)
- [../../reports/cross_modal/ds006848/ds006848_phase2_expanded_filter_benchmark.json](../../reports/cross_modal/ds006848/ds006848_phase2_expanded_filter_benchmark.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_expanded_filter_benchmark.md](../../reports/cross_modal/ds006848/ds006848_phase2_expanded_filter_benchmark.md)
- [../../configs/cross_modal/ds006848_phase2_windows_broader.toml](../../configs/cross_modal/ds006848_phase2_windows_broader.toml)
- [../../reports/cross_modal/ds006848/ds006848_phase2_broader_fetch_report.json](../../reports/cross_modal/ds006848/ds006848_phase2_broader_fetch_report.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_broader_windows.npz](../../reports/cross_modal/ds006848/ds006848_phase2_broader_windows.npz)
- [../../reports/cross_modal/ds006848/ds006848_phase2_broader_windows_metadata.json](../../reports/cross_modal/ds006848/ds006848_phase2_broader_windows_metadata.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_broader_windows_metrics.json](../../reports/cross_modal/ds006848/ds006848_phase2_broader_windows_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_broader_windows_summary.md](../../reports/cross_modal/ds006848/ds006848_phase2_broader_windows_summary.md)
- [../../reports/cross_modal/ds006848/ds006848_phase2_broader_filter_benchmark.json](../../reports/cross_modal/ds006848/ds006848_phase2_broader_filter_benchmark.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_broader_filter_benchmark.md](../../reports/cross_modal/ds006848/ds006848_phase2_broader_filter_benchmark.md)
- [../../configs/cross_modal/ds006848_phase2_windows_rest.toml](../../configs/cross_modal/ds006848_phase2_windows_rest.toml)
- [../../reports/cross_modal/ds006848/ds006848_phase2_rest_fetch_report.json](../../reports/cross_modal/ds006848/ds006848_phase2_rest_fetch_report.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_rest_windows.npz](../../reports/cross_modal/ds006848/ds006848_phase2_rest_windows.npz)
- [../../reports/cross_modal/ds006848/ds006848_phase2_rest_windows_metadata.json](../../reports/cross_modal/ds006848/ds006848_phase2_rest_windows_metadata.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_rest_windows_metrics.json](../../reports/cross_modal/ds006848/ds006848_phase2_rest_windows_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_rest_windows_summary.md](../../reports/cross_modal/ds006848/ds006848_phase2_rest_windows_summary.md)
- [../../reports/cross_modal/ds006848/ds006848_phase2_rest_filter_benchmark.json](../../reports/cross_modal/ds006848/ds006848_phase2_rest_filter_benchmark.json)
- [../../reports/cross_modal/ds006848/ds006848_phase2_rest_filter_benchmark.md](../../reports/cross_modal/ds006848/ds006848_phase2_rest_filter_benchmark.md)
