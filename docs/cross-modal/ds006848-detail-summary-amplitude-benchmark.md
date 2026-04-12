# DS006848 Detail-Summary Amplitude Follow-On

Status: Secondary positive signal, not the new baseline

## Purpose

This note records the first selective transient-aware EEG feature-view follow-on run against the active DS006848 low-rank amplitude baseline.

The goal was narrower than the full Haar experiment:

- keep the accepted amplitude cohorts fixed
- keep the same calibrated linear low-rank model family
- keep the same `32`-window calibration contract
- preserve channel structure explicitly
- summarize multiscale detail content instead of rotating the full waveform basis

## Model

Reference:

- calibrated low-rank linear ridge on raw `eeg_clean_windows`
- best reference rank `64`

Follow-on:

- calibrated low-rank linear ridge on `eeg_clean_detail_summary_windows`
- source branch `eeg_clean_windows`
- full `7`-level Haar decomposition across the 128-sample time axis
- per-channel summary features:
  - detail `rms`
  - detail `max_abs`
  - final approximation scalar
- feature dimension: `945`

## Result

On the fixed cohort-swap benchmark:

- reference low-rank aggregate relative MSE: about `0.8680`
- best detail-summary aggregate relative MSE: about `0.9902`
- best detail-summary rank: `256`

Per target at the best rank:

- `amplitude_range`: about `0.9439`
- `rising_edge_slope_max`: about `1.0062`
- `dominant_beat_amplitude`: about `1.0204`

On the `sub-025` amplitude stress test:

- reference low-rank aggregate relative MSE: about `0.8691`
- best detail-summary aggregate relative MSE: about `0.9903`
- best detail-summary rank: `256`

Per target at the best rank:

- `amplitude_range`: about `0.9440`
- `rising_edge_slope_max`: about `1.0062`
- `dominant_beat_amplitude`: about `1.0206`

## Interpretation

- this view is materially better than the full Haar rotation
- it stays stable across the rank sweep and slightly beats the null aggregate on both accepted cohorts
- it still does not beat the active raw low-rank baseline

The practical read is:

- selective multiscale summaries retain some usable EEG->PPG amplitude signal
- replacing the raw window with summaries alone throws away too much information
- the next feature-view experiment should combine raw and selective multiscale information rather than forcing one to replace the other

## Recommendation

Keep low-rank rank-64 raw `eeg_clean_windows` as the active DS006848 amplitude baseline.

That hybrid follow-on now exists and is recorded in [DS006848 Hybrid Detail Amplitude Benchmark](ds006848-hybrid-detail-amplitude-benchmark.md).

## Commands

```powershell
python scripts/cross_modal/train_ds006848_calibrated_detail_summary_baseline.py --config configs/cross_modal/ds006848_calibrated_detail_summary_amplitude_cohort_swap.toml
python scripts/cross_modal/validate_ds006848_calibrated_detail_summary_baseline.py --config configs/cross_modal/ds006848_calibrated_detail_summary_amplitude_cohort_swap.toml

python scripts/cross_modal/train_ds006848_calibrated_detail_summary_baseline.py --config configs/cross_modal/ds006848_calibrated_detail_summary_amplitude_cohort_plus_sub025.toml
python scripts/cross_modal/validate_ds006848_calibrated_detail_summary_baseline.py --config configs/cross_modal/ds006848_calibrated_detail_summary_amplitude_cohort_plus_sub025.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_calibrated_detail_summary_amplitude_cohort_swap.toml](../../configs/cross_modal/ds006848_calibrated_detail_summary_amplitude_cohort_swap.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_detail_summary_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_detail_summary_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_detail_summary_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_detail_summary_amplitude_report.md)
- [../../configs/cross_modal/ds006848_calibrated_detail_summary_amplitude_cohort_plus_sub025.toml](../../configs/cross_modal/ds006848_calibrated_detail_summary_amplitude_cohort_plus_sub025.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_detail_summary_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_detail_summary_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_detail_summary_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_detail_summary_amplitude_report.md)
