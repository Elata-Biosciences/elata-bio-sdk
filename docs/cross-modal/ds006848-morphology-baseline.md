# DS006848 Morphology Baseline

Status: Active

## Purpose

This path is the first Phase 3-style EEG->PPG baseline on top of the `DS006848` verbalwm Phase 2 artifact.

## Scope

The current baseline is intentionally simple:

- source branches:
  - `eeg_event_windows`
  - `eeg_clean_windows`
- model:
  - ridge regression in the dual form
- targets:
  - mean inter-beat interval
  - pulse amplitude range
  - rising-edge slope max
  - dominant-beat amplitude
  - dominant-beat rise time
  - dominant-beat width

This is a development baseline, not the final benchmark suite.

## Current result

First 4-subject development result on `sub-001`, `sub-010` train and `sub-007`, `sub-012` eval:

- ridge lambda: `1,000`
- both `eeg_event_windows` and `eeg_clean_windows` beat the null on aggregate standardized MSE
- `eeg_event_windows` is currently the best branch by aggregate standardized MSE
- `amplitude_range` beats null on MSE for both branches
- `dominant_beat_amplitude` beats null on MSE for both branches
- `rising_edge_slope_max` does not beat null on MSE for either branch
- mean inter-beat interval, dominant-beat rise time, and dominant-beat width do not beat null on MSE

Broader 8-subject development result on `sub-001`, `sub-010`, `sub-013`, `sub-015` train and `sub-007`, `sub-012`, `sub-016`, `sub-017` eval:

- ridge lambda: `1,000`
- neither `eeg_event_windows` nor `eeg_clean_windows` beats the null on aggregate standardized MSE
- `eeg_clean_windows` is now the least-bad branch
- all tracked targets fail to beat null on MSE on the broader split
- the broader failure is not caused by target sparsity:
  - train quality-pass windows remain `1024`
  - eval quality-pass windows remain high at `959`
  - dominant-beat-valid eval windows remain `959`

Practical interpretation:

- the earlier 4-subject DS006848 win does not survive the next subject expansion
- the branch preference flips back toward `eeg_clean`, which now matches the broader DS003838 pattern
- the next step is not a deeper model; it is using the explicit DS006848 subject-quality policy to guide the next rest and waveform-quality passes

The slice analysis in [ds006848-baseline-analysis.md](ds006848-baseline-analysis.md) now shows that the broader failure is dominated by `sub-016` and by amplitude-family errors. The current cohort gate is recorded in [ds006848-subject-quality-policy.md](ds006848-subject-quality-policy.md).

## Commands

```powershell
python scripts/cross_modal/train_ds006848_morphology_baseline.py --config configs/cross_modal/ds006848_morphology_baseline_expanded.toml
python scripts/cross_modal/validate_ds006848_morphology_baseline.py --config configs/cross_modal/ds006848_morphology_baseline_expanded.toml
python scripts/cross_modal/analyze_ds006848_baseline.py --config configs/cross_modal/ds006848_baseline_analysis_expanded.toml
python scripts/cross_modal/validate_ds006848_baseline_analysis.py --config configs/cross_modal/ds006848_baseline_analysis_expanded.toml

python scripts/cross_modal/train_ds006848_morphology_baseline.py --config configs/cross_modal/ds006848_morphology_baseline_broader.toml
python scripts/cross_modal/validate_ds006848_morphology_baseline.py --config configs/cross_modal/ds006848_morphology_baseline_broader.toml
python scripts/cross_modal/analyze_ds006848_baseline.py --config configs/cross_modal/ds006848_baseline_analysis_broader.toml
python scripts/cross_modal/validate_ds006848_baseline_analysis.py --config configs/cross_modal/ds006848_baseline_analysis_broader.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_morphology_baseline_expanded.toml](../../configs/cross_modal/ds006848_morphology_baseline_expanded.toml)
- [../../reports/cross_modal/ds006848/ds006848_expanded_morphology_baseline_report.md](../../reports/cross_modal/ds006848/ds006848_expanded_morphology_baseline_report.md)
- [../../reports/cross_modal/ds006848/ds006848_expanded_morphology_baseline_metrics.json](../../reports/cross_modal/ds006848/ds006848_expanded_morphology_baseline_metrics.json)
- [../../configs/cross_modal/ds006848_morphology_baseline_broader.toml](../../configs/cross_modal/ds006848_morphology_baseline_broader.toml)
- [../../reports/cross_modal/ds006848/ds006848_broader_morphology_baseline_report.md](../../reports/cross_modal/ds006848/ds006848_broader_morphology_baseline_report.md)
- [../../reports/cross_modal/ds006848/ds006848_broader_morphology_baseline_metrics.json](../../reports/cross_modal/ds006848/ds006848_broader_morphology_baseline_metrics.json)
- [ds006848-baseline-analysis.md](ds006848-baseline-analysis.md)
