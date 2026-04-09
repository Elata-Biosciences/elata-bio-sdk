# DS006848 Amplitude Model Comparison

Status: Active

## Purpose

This note records the first direct model-class comparison on the fixed `DS006848` amplitude-family benchmark.

The question was narrow:

- keep the accepted cohort fixed
- keep the targets fixed
- keep the short-calibration contract fixed
- test whether a slightly richer nonlinear model beats the calibrated linear baseline

## Compared models

Reference model:

- calibrated absolute linear ridge

Comparison model:

- calibrated absolute RBF-kernel ridge
- kernel = median-heuristic RBF
- gamma scale = `1.0`
- ridge lambda = `1000`

## Fixed benchmark cohorts

Primary benchmark:

- reviewed train cohort
- cohort-swap eval cohort

Stress test:

- same reviewed train cohort
- `sub-025` added to eval

## Current result

On the fixed cohort-swap benchmark:

- linear best branch: `eeg_clean_windows`
- linear aggregate relative MSE: about `0.8743`
- RBF best branch: `eeg_event_windows`
- RBF aggregate relative MSE: about `0.9986`

On the `sub-025` amplitude stress test:

- linear best branch: `eeg_clean_windows`
- linear aggregate relative MSE: about `0.8753`
- RBF best branch: `eeg_event_windows`
- RBF aggregate relative MSE: about `0.9986`

## Interpretation

- the nonlinear RBF step does not improve the benchmark
- it is much worse than the calibrated linear amplitude baseline
- it lands extremely close to the subject-mean null predictor
- the branch flip from `eeg_clean_windows` to `eeg_event_windows` is numerically tiny and not practically meaningful

The practical read is straightforward:

- generic kernelized nonlinearity is not the next lever
- the current DS006848 amplitude benchmark should remain anchored to the calibrated linear baseline

## Follow-on low-rank comparison

The next bounded comparison is now complete too.

A low-rank calibrated linear sweep was run with ranks:

- `8`
- `16`
- `32`
- `64`
- `128`
- `256`
- `512`

That comparison did improve the benchmark:

- best branch remains `eeg_clean_windows`
- best rank is `64`
- cohort-swap aggregate relative MSE improves from about `0.8743` to about `0.8680`
- cohort-plus-sub025 aggregate relative MSE improves from about `0.8753` to about `0.8691`

So this note should now be read as:

- RBF nonlinearity failed
- low-rank linear compression helped

## Recommendation

Do not widen the cohort again yet.

Do not jump to a deeper generic architecture yet.

The next model step should be one of:

- low-rank amplitude-only linear modeling
- subject-conditioned residual modeling
- better event/beat-aligned EEG feature views for amplitude prediction

## Commands

```powershell
python scripts/cross_modal/train_ds006848_calibrated_rbf_baseline.py --config configs/cross_modal/ds006848_calibrated_rbf_amplitude_cohort_swap.toml
python scripts/cross_modal/validate_ds006848_calibrated_rbf_baseline.py --config configs/cross_modal/ds006848_calibrated_rbf_amplitude_cohort_swap.toml

python scripts/cross_modal/train_ds006848_calibrated_rbf_baseline.py --config configs/cross_modal/ds006848_calibrated_rbf_amplitude_cohort_plus_sub025.toml
python scripts/cross_modal/validate_ds006848_calibrated_rbf_baseline.py --config configs/cross_modal/ds006848_calibrated_rbf_amplitude_cohort_plus_sub025.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_calibrated_rbf_amplitude_cohort_swap.toml](../../configs/cross_modal/ds006848_calibrated_rbf_amplitude_cohort_swap.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_rbf_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_rbf_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_rbf_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_rbf_amplitude_report.md)
- [../../configs/cross_modal/ds006848_calibrated_rbf_amplitude_cohort_plus_sub025.toml](../../configs/cross_modal/ds006848_calibrated_rbf_amplitude_cohort_plus_sub025.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_rbf_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_rbf_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_rbf_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_rbf_amplitude_report.md)
