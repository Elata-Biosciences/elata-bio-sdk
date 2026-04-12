# DS006848 Hybrid Detail Amplitude Benchmark

Status: Active

## Purpose

This note records the first DS006848 feature-view follow-on that beats the active raw low-rank amplitude baseline on both accepted amplitude cohorts.

The model keeps the same:

- accepted amplitude cohorts
- calibrated low-rank linear family
- `32`-window short-calibration contract

It changes only the feature view:

- raw `eeg_clean_windows`
- plus channel-preserving multiscale detail summaries

## Model

Reference:

- calibrated low-rank linear ridge on raw `eeg_clean_windows`
- best reference rank `64`

Improved model:

- calibrated low-rank linear ridge on `eeg_clean_hybrid_detail_windows`
- raw `eeg_clean_windows` flattened features
- per-channel multiscale detail summaries:
  - detail `rms`
  - detail `max_abs`
  - final approximation scalar
- total feature dimension: `9009`
- candidate ranks:
  - `8`
  - `16`
  - `32`
  - `64`
  - `128`
  - `256`
  - `512`

## Current best result

Best rank:

- `512`

On the fixed cohort-swap benchmark:

- raw low-rank aggregate relative MSE: about `0.8680`
- hybrid aggregate relative MSE: about `0.7631`

On the `sub-025` amplitude stress test:

- raw low-rank aggregate relative MSE: about `0.8691`
- hybrid aggregate relative MSE: about `0.7658`

Per target on the fixed cohort-swap benchmark:

- `amplitude_range`: about `0.6204`
- `rising_edge_slope_max`: about `0.7156`
- `dominant_beat_amplitude`: about `0.9534`

Per target on the `sub-025` amplitude stress test:

- `amplitude_range`: about `0.6226`
- `rising_edge_slope_max`: about `0.7171`
- `dominant_beat_amplitude`: about `0.9577`

## Interpretation

- this is the first DS006848 follow-on that clearly improves over the active raw low-rank baseline on both accepted amplitude cohorts
- the gain is not confined to one easy target
- importantly, `dominant_beat_amplitude` now also beats the null on both accepted amplitude cohorts

The practical read is:

- raw `eeg_clean` is still carrying most of the predictive signal
- selective multiscale detail summaries add complementary information that the raw-only low-rank view was missing
- replacing raw features was a mistake, but augmenting them works

## Recommendation

Treat hybrid raw-plus-detail rank-512 `eeg_clean` as the new DS006848 amplitude reference baseline.

The next step should keep this hybrid benchmark fixed and test whether it survives the timing-heavy `sub-011` amplitude expansion before widening the full morphology scope again.

## Commands

```powershell
python scripts/cross_modal/train_ds006848_calibrated_hybrid_detail_baseline.py --config configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_swap.toml
python scripts/cross_modal/validate_ds006848_calibrated_hybrid_detail_baseline.py --config configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_swap.toml

python scripts/cross_modal/train_ds006848_calibrated_hybrid_detail_baseline.py --config configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_plus_sub025.toml
python scripts/cross_modal/validate_ds006848_calibrated_hybrid_detail_baseline.py --config configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_plus_sub025.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_swap.toml](../../configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_swap.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_hybrid_detail_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_hybrid_detail_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_hybrid_detail_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_hybrid_detail_amplitude_report.md)
- [../../configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_plus_sub025.toml](../../configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_plus_sub025.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_hybrid_detail_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_hybrid_detail_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_hybrid_detail_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_hybrid_detail_amplitude_report.md)
