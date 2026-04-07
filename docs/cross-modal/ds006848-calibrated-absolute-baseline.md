# DS006848 Calibrated Absolute Baseline

Status: Active

## Purpose

This note records the first DS006848 calibration-aware baseline that is scored in real target units rather than only in subject-zscored space.

It answers the next question after the shift-aware diagnostic:

- can short subject calibration turn the recovered relative signal into a real null-beating result in absolute PPG morphology targets?

## Scope

Current diagnostic setup:

- dataset split:
  - train `sub-001`, `sub-010`, `sub-013`, `sub-015`
  - eval `sub-002`, `sub-007`, `sub-012`, `sub-035`
- source branches:
  - `eeg_event_windows`
  - `eeg_clean_windows`
- target families:
  - mean inter-beat interval
  - amplitude range
  - rising-edge slope max
  - dominant-beat amplitude
  - dominant-beat rise time
  - dominant-beat width
- evaluation modes:
  - `oracle_absolute`
  - `calibrated_absolute`

The calibrated mode uses `32` true-target windows per eval subject to estimate subject mean and variance, then scores the remaining windows in absolute target units.

To keep cross-target aggregation meaningful, the headline metric is aggregate relative MSE:

- per-target relative MSE = `model_mse / null_mse`
- aggregate relative MSE = mean relative MSE across the morphology target set

## Current result

Reference zero-shot cohort-swap result:

- best branch by aggregate relative MSE: `eeg_clean_windows`
- aggregate relative MSE: about `1.6494`
- still worse than null

Oracle absolute result:

- best branch: `eeg_clean_windows`
- aggregate relative MSE: about `2.1795`
- still worse than null

Calibrated absolute result:

- best branch: `eeg_clean_windows`
- aggregate relative MSE: about `0.9238`
- this beats the null on the cohort-swap split in real target units

Per-target reading on calibrated `eeg_clean_windows`:

- `amplitude_range` beats null
- `rising_edge_slope_max` beats null
- `dominant_beat_rise_time_seconds` beats null
- `dominant_beat_amplitude` does not beat null
- `dominant_beat_width_seconds` does not beat null
- `mean_ibi_seconds` does not beat null

## Interpretation

This is the strongest DS006848 result so far:

- the broader zero-shot morphology claim is still not supported
- but a short-calibration `eeg_clean -> PPG morphology` path now beats null on the cohort-swap split in real units
- the first recovered targets are still concentrated in the morphology family rather than global timing/state

Important caution:

- this is not yet a broad zero-shot benchmark win
- this is a subject-calibrated result on the cohort-swap split
- it should be treated as the first calibrated positive direction, not the final benchmark claim

## Practical conclusion

The DS006848 path should now be read this way:

- zero-shot EEG->PPG remains a stress test
- subject-calibrated EEG->PPG now has a credible positive path
- the next sensible step is to expand the calibrated cohort carefully, not to jump to a deeper model

## Commands

```powershell
python scripts/cross_modal/train_ds006848_calibrated_absolute_baseline.py --config configs/cross_modal/ds006848_calibrated_absolute_baseline_cohort_swap.toml
python scripts/cross_modal/validate_ds006848_calibrated_absolute_baseline.py --config configs/cross_modal/ds006848_calibrated_absolute_baseline_cohort_swap.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_calibrated_absolute_baseline_cohort_swap.toml](../../configs/cross_modal/ds006848_calibrated_absolute_baseline_cohort_swap.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_absolute_baseline_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_absolute_baseline_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_absolute_baseline_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_absolute_baseline_report.md)
