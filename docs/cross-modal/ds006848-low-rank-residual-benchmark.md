# DS006848 Low-Rank Residual Follow-On

Status: Negative result

## Purpose

This note records the first follow-on experiment run against the active DS006848 low-rank amplitude baseline.

The goal was narrow:

- keep the accepted amplitude cohorts fixed
- keep the low-rank rank-64 `eeg_clean_windows` feature path fixed
- keep the short-calibration contract fixed
- test whether a simple per-subject residual-bias correction improves the remaining held-out amplitude error

## Model

Reference:

- calibrated low-rank linear ridge on `eeg_clean_windows`
- rank `64`

Follow-on:

- same calibrated low-rank linear ridge baseline
- same `32` calibration windows per eval subject
- same amplitude targets:
  - `amplitude_range`
  - `rising_edge_slope_max`
  - `dominant_beat_amplitude`
- added per-subject residual-bias correction estimated from the calibration windows and applied to the held-out eval windows

## Result

On the fixed cohort-swap benchmark:

- reference low-rank aggregate relative MSE: about `0.8680`
- residual follow-on aggregate relative MSE: about `1.3670`

Per target:

- `amplitude_range`: about `1.4067`
- `rising_edge_slope_max`: about `1.3321`
- `dominant_beat_amplitude`: about `1.3622`

On the `sub-025` amplitude stress test:

- reference low-rank aggregate relative MSE: about `0.8691`
- residual follow-on aggregate relative MSE: about `1.3674`

Per target:

- `amplitude_range`: about `1.4079`
- `rising_edge_slope_max`: about `1.3322`
- `dominant_beat_amplitude`: about `1.3619`

## Interpretation

- the residual correction does not recover the remaining dominant-beat-amplitude weakness
- the degradation is not isolated to one target; it affects all three amplitude targets on both accepted cohorts
- the most likely read is that a simple post-hoc subject bias term is too coarse for the remaining EEG->PPG mapping error

The practical consequence is:

- keep low-rank rank-64 `eeg_clean_windows` as the active DS006848 amplitude baseline
- treat subject-conditioned residual correction as completed negative evidence
- spend the next cycle on better EEG feature views rather than more bias-correction variants

## Recommendation

The next DS006848 follow-on should hold the cohort and calibration contract fixed and test a transient-aware EEG view against the active low-rank baseline.

The best current candidate is:

- event-aligned or Haar-wavelet-style EEG features that preserve short-lived burst structure without requiring a heavier model class

## Commands

```powershell
python scripts/cross_modal/train_ds006848_low_rank_residual_baseline.py --config configs/cross_modal/ds006848_low_rank_residual_cohort_swap.toml
python scripts/cross_modal/validate_ds006848_low_rank_residual_baseline.py --config configs/cross_modal/ds006848_low_rank_residual_cohort_swap.toml

python scripts/cross_modal/train_ds006848_low_rank_residual_baseline.py --config configs/cross_modal/ds006848_low_rank_residual_cohort_plus_sub025.toml
python scripts/cross_modal/validate_ds006848_low_rank_residual_baseline.py --config configs/cross_modal/ds006848_low_rank_residual_cohort_plus_sub025.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_low_rank_residual_cohort_swap.toml](../../configs/cross_modal/ds006848_low_rank_residual_cohort_swap.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_low_rank_residual_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_swap_low_rank_residual_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_low_rank_residual_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_swap_low_rank_residual_report.md)
- [../../configs/cross_modal/ds006848_low_rank_residual_cohort_plus_sub025.toml](../../configs/cross_modal/ds006848_low_rank_residual_cohort_plus_sub025.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_low_rank_residual_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_low_rank_residual_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_low_rank_residual_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_low_rank_residual_report.md)
