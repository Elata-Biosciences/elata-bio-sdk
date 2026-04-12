# DS006848 Hybrid `sub-011` Amplitude Expansion

Status: Positive stress-test result

## Purpose

This note records the first timing-heavy amplitude expansion run for the new DS006848 hybrid raw-plus-detail benchmark.

The question was narrow:

- keep the hybrid feature view fixed
- keep the calibrated low-rank family fixed
- keep the short-calibration contract fixed
- test whether the gain survives adding the timing-heavy `sub-011` subject to the accepted amplitude cohort

## Comparison

On the `sub-011` amplitude expansion:

- calibrated absolute raw `eeg_clean`: about `0.9017`
- calibrated low-rank raw `eeg_clean`: about `0.8954`
- calibrated hybrid raw-plus-detail best rank: about `0.7797`

Best hybrid rank:

- `16`

Fixed active hybrid rank from the accepted cohorts:

- `512`
- aggregate relative MSE: about `0.8178`

## Interpretation

- the hybrid gain does survive the timing-heavy `sub-011` amplitude expansion
- the best retuned hybrid model is materially better than both predecessor baselines on this split
- the fixed active rank-`512` hybrid also stays below null and still beats the low-rank raw predecessor, so the result is not just a retuning artifact

Per target at the best hybrid rank:

- `amplitude_range`: about `0.7903`
- `rising_edge_slope_max`: about `0.6527`
- `dominant_beat_amplitude`: about `0.8961`

That last point matters:

- `dominant_beat_amplitude` also stays below null on the timing-heavy expansion

## Recommendation

Keep the hybrid raw-plus-detail DS006848 amplitude benchmark as the active EEG->PPG path.

The next experiment should stop asking whether the amplitude gain is real and start asking whether the same feature view helps the broader timing-family and full-morphology failure that originally made `sub-011` risky.

## Commands

```powershell
python scripts/cross_modal/train_ds006848_calibrated_low_rank_baseline.py --config configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub011.toml
python scripts/cross_modal/validate_ds006848_calibrated_low_rank_baseline.py --config configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub011.toml

python scripts/cross_modal/train_ds006848_calibrated_hybrid_detail_baseline.py --config configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_plus_sub011.toml
python scripts/cross_modal/validate_ds006848_calibrated_hybrid_detail_baseline.py --config configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_plus_sub011.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub011.toml](../../configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub011.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_low_rank_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_low_rank_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_low_rank_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_low_rank_amplitude_report.md)
- [../../configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_plus_sub011.toml](../../configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_plus_sub011.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_hybrid_detail_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_hybrid_detail_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_hybrid_detail_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_hybrid_detail_amplitude_report.md)
