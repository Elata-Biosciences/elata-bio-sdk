# DS006848 Haar Amplitude Follow-On

Status: Negative result

## Purpose

This note records the first transient-aware EEG feature-view follow-on run against the active DS006848 low-rank amplitude baseline.

The goal was narrow:

- keep the accepted amplitude cohorts fixed
- keep the same calibrated linear low-rank model family
- keep the same rank sweep
- keep the same `32`-window calibration contract
- replace the raw `eeg_clean_windows` feature view with a full multilevel Haar decomposition

## Model

Reference:

- calibrated low-rank linear ridge on raw `eeg_clean_windows`
- best reference rank `64`

Follow-on:

- calibrated low-rank linear ridge on `eeg_clean_haar_windows`
- source branch `eeg_clean_windows`
- full `7`-level Haar decomposition across the 128-sample time axis
- candidate ranks:
  - `8`
  - `16`
  - `32`
  - `64`
  - `128`
  - `256`
  - `512`

## Result

On the fixed cohort-swap benchmark:

- reference low-rank aggregate relative MSE: about `0.8680`
- best Haar aggregate relative MSE: about `1.0168`
- best Haar rank: `8`

Per target at the best Haar rank:

- `amplitude_range`: about `1.0287`
- `rising_edge_slope_max`: about `0.9982`
- `dominant_beat_amplitude`: about `1.0235`

On the `sub-025` amplitude stress test:

- reference low-rank aggregate relative MSE: about `0.8691`
- best Haar aggregate relative MSE: about `1.0167`
- best Haar rank: `8`

Per target at the best Haar rank:

- `amplitude_range`: about `1.0287`
- `rising_edge_slope_max`: about `0.9982`
- `dominant_beat_amplitude`: about `1.0234`

## Interpretation

- the first full Haar view does not beat the active DS006848 amplitude baseline on either accepted cohort
- the best Haar run sits only slightly above null, which means the view mostly collapses toward a subject-mean predictor rather than recovering useful EEG->PPG structure
- the higher-rank Haar runs become sharply unstable, so the transformed feature space is not a drop-in replacement for the raw low-rank path

The practical read is:

- a cheap transient-aware representation is still worth pursuing
- but a full-basis Haar rotation is too blunt for the current DS006848 amplitude benchmark
- the next feature-view experiment should preserve the multiscale idea while being more selective

## Recommendation

Keep low-rank rank-64 raw `eeg_clean_windows` as the active DS006848 amplitude baseline.

The next follow-on should test a more targeted multiscale representation, not another full-basis transform. The best current candidate is:

- channel-preserving multiscale detail summaries or event-aligned detail windows that keep short transients while avoiding the high-rank instability of the full Haar view

## Commands

```powershell
python scripts/cross_modal/train_ds006848_calibrated_haar_baseline.py --config configs/cross_modal/ds006848_calibrated_haar_amplitude_cohort_swap.toml
python scripts/cross_modal/validate_ds006848_calibrated_haar_baseline.py --config configs/cross_modal/ds006848_calibrated_haar_amplitude_cohort_swap.toml

python scripts/cross_modal/train_ds006848_calibrated_haar_baseline.py --config configs/cross_modal/ds006848_calibrated_haar_amplitude_cohort_plus_sub025.toml
python scripts/cross_modal/validate_ds006848_calibrated_haar_baseline.py --config configs/cross_modal/ds006848_calibrated_haar_amplitude_cohort_plus_sub025.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_calibrated_haar_amplitude_cohort_swap.toml](../../configs/cross_modal/ds006848_calibrated_haar_amplitude_cohort_swap.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_haar_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_haar_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_haar_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_haar_amplitude_report.md)
- [../../configs/cross_modal/ds006848_calibrated_haar_amplitude_cohort_plus_sub025.toml](../../configs/cross_modal/ds006848_calibrated_haar_amplitude_cohort_plus_sub025.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_haar_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_haar_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_haar_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_haar_amplitude_report.md)
