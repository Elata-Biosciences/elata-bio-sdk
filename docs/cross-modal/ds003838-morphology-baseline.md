# DS003838 Morphology Baseline

Status: Active

## Purpose

This path is the first Phase 3-style EEG->PPG baseline on top of the `DS003838` Phase 2 artifact.

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

This is a pilot baseline, not the final benchmark suite.

## Current result

Smoke-contract pilot result on `sub-032`, `sub-034` train and `sub-033`, `sub-035` eval:

- ridge lambda: `1,000`
- both `eeg_event_windows` and `eeg_clean_windows` still beat the null on aggregate standardized MSE across the morphology-focused aggregate target set
- `eeg_event_windows` is currently the best branch by aggregate standardized MSE
- pulse amplitude range, rising-edge slope max, and dominant-beat amplitude beat the null on MSE for both branches
- mean inter-beat interval does not yet beat the null on MSE for either branch
- dominant-beat rise time and dominant-beat width still do not beat the null on MSE
- correlations remain positive for amplitude-style targets, but beat-timing and beat-width targets are still weak

Practical interpretation:

- the current EEG->PPG signal is stronger for morphology magnitude targets than for beat-timing or beat-width targets
- the target-validity-mask path now exists and should be kept as the default way to add new PPG targets
- notch timing is still too sparse in the current train split to be a credible primary target; the current pilot only yields `11` notch-valid train windows

Expanded development result on `sub-032`, `sub-034`, `sub-036`, `sub-038` train and `sub-033`, `sub-035`, `sub-039`, `sub-040` eval:

- ridge lambda: `1,000`
- neither `eeg_event_windows` nor `eeg_clean_windows` beats the null on aggregate standardized MSE
- on the fixed `1,000` setting, the only targets still beating null on MSE are:
  - `amplitude_range` on `eeg_clean_windows`
  - `dominant_beat_amplitude` on `eeg_clean_windows`
- `rising_edge_slope_max`, beat timing, rise time, and beat width no longer beat null on the expanded split
- a ridge sweep from `100` through `100,000,000` does not rescue the aggregate result for either branch; both best settings remain slightly worse than null

Practical interpretation:

- the earlier 4-subject morphology win does not yet survive mild subject expansion
- the project should treat the current DS003838 result as fragile rather than established
- the next step is not a deeper model by default; it is broader benchmark grounding and slice analysis
- that slice analysis now exists and confirms that `eeg_clean` is the least-bad branch, the surviving signal is amplitude-heavy, and the current failure is not rescued by a ridge sweep

## Commands

```powershell
python scripts/cross_modal/derive_ds003838_targets.py --config configs/cross_modal/ds003838_targets.toml
python scripts/cross_modal/validate_ds003838_targets.py --config configs/cross_modal/ds003838_targets.toml
python scripts/cross_modal/train_ds003838_morphology_baseline.py --config configs/cross_modal/ds003838_morphology_baseline.toml
python scripts/cross_modal/validate_ds003838_morphology_baseline.py --config configs/cross_modal/ds003838_morphology_baseline.toml

python scripts/cross_modal/derive_ds003838_targets.py --config configs/cross_modal/ds003838_targets_expanded.toml
python scripts/cross_modal/validate_ds003838_targets.py --config configs/cross_modal/ds003838_targets_expanded.toml
python scripts/cross_modal/train_ds003838_morphology_baseline.py --config configs/cross_modal/ds003838_morphology_baseline_expanded.toml
python scripts/cross_modal/validate_ds003838_morphology_baseline.py --config configs/cross_modal/ds003838_morphology_baseline_expanded.toml
python scripts/cross_modal/sweep_ds003838_morphology_lambda.py --config configs/cross_modal/ds003838_morphology_sweep_expanded.toml
```

## Artifacts

- [../../configs/cross_modal/ds003838_morphology_baseline.toml](../../configs/cross_modal/ds003838_morphology_baseline.toml)
- [../../reports/cross_modal/ds003838/ds003838_morphology_baseline_report.md](../../reports/cross_modal/ds003838/ds003838_morphology_baseline_report.md)
- [../../reports/cross_modal/ds003838/ds003838_morphology_baseline_metrics.json](../../reports/cross_modal/ds003838/ds003838_morphology_baseline_metrics.json)
- [../../configs/cross_modal/ds003838_morphology_baseline_expanded.toml](../../configs/cross_modal/ds003838_morphology_baseline_expanded.toml)
- [../../reports/cross_modal/ds003838/ds003838_expanded_morphology_baseline_report.md](../../reports/cross_modal/ds003838/ds003838_expanded_morphology_baseline_report.md)
- [../../reports/cross_modal/ds003838/ds003838_expanded_morphology_baseline_metrics.json](../../reports/cross_modal/ds003838/ds003838_expanded_morphology_baseline_metrics.json)
- [../../configs/cross_modal/ds003838_morphology_sweep_expanded.toml](../../configs/cross_modal/ds003838_morphology_sweep_expanded.toml)
- [../../reports/cross_modal/ds003838/ds003838_expanded_morphology_lambda_sweep_report.md](../../reports/cross_modal/ds003838/ds003838_expanded_morphology_lambda_sweep_report.md)
- [../../reports/cross_modal/ds003838/ds003838_expanded_morphology_lambda_sweep_metrics.json](../../reports/cross_modal/ds003838/ds003838_expanded_morphology_lambda_sweep_metrics.json)
- [ds003838-failure-analysis.md](ds003838-failure-analysis.md)
