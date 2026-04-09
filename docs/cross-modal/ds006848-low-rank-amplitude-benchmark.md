# DS006848 Low-Rank Amplitude Benchmark

Status: Active

## Purpose

This note records the first positive model-class improvement over the DS006848 calibrated linear amplitude benchmark.

The comparison kept all of the following fixed:

- cohort
- targets
- short-calibration contract
- ridge penalty

It changed only the EEG feature parameterization:

- full-resolution flattened EEG
- versus low-rank projected EEG

## Model

Reference:

- calibrated absolute linear ridge on full-resolution EEG features

Improved model:

- calibrated absolute linear ridge on low-rank EEG features
- projection built from train-quality EEG windows
- candidate ranks:
  - `8`
  - `16`
  - `32`
  - `64`
  - `128`
  - `256`
  - `512`

## Current best result

Best branch:

- `eeg_clean_windows`

Best rank:

- `64`

On the fixed cohort-swap benchmark:

- full-resolution linear aggregate relative MSE: about `0.8743`
- low-rank rank-64 aggregate relative MSE: about `0.8680`

On the `sub-025` amplitude stress test:

- full-resolution linear aggregate relative MSE: about `0.8753`
- low-rank rank-64 aggregate relative MSE: about `0.8691`

## Interpretation

- low-rank compression helps a little, but consistently
- the gain survives the accepted weak-amplitude stress test
- the improvement is specific to `eeg_clean_windows`
- `eeg_event_windows` still does not become a competitive branch under low-rank projection

The practical read is:

- generic nonlinearity failed
- modest feature compression helped
- the active DS006848 amplitude benchmark should now move from full-resolution linear to low-rank rank-64 `eeg_clean`

## Recommendation

Treat low-rank rank-64 `eeg_clean_windows` as the new DS006848 amplitude reference baseline.

The next step should stay on the same cohort and test one of:

- subject-conditioned residual correction on top of the low-rank baseline
- better event-aligned EEG feature views against the low-rank baseline

## Commands

```powershell
python scripts/cross_modal/train_ds006848_calibrated_low_rank_baseline.py --config configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_swap.toml
python scripts/cross_modal/validate_ds006848_calibrated_low_rank_baseline.py --config configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_swap.toml

python scripts/cross_modal/train_ds006848_calibrated_low_rank_baseline.py --config configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub025.toml
python scripts/cross_modal/validate_ds006848_calibrated_low_rank_baseline.py --config configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub025.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_swap.toml](../../configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_swap.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_low_rank_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_low_rank_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_low_rank_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_low_rank_amplitude_report.md)
- [../../configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub025.toml](../../configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub025.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_low_rank_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_low_rank_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_low_rank_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_low_rank_amplitude_report.md)
