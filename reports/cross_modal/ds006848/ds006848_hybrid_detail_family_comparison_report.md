# DS006848 Ranked Family Comparison Report

- Label: `hybrid_detail_morphology`
- Branch: `(single-branch metrics)`

## cohort_swap

- Source metrics: `reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_hybrid_detail_morphology_metrics.json`
- Rank selection: `best_rank`
- Best rank: `16`

### full

- Aggregate relative MSE: `0.809535`
- Aggregate relative MAE: `0.920541`
- Beats null aggregate relative MSE: `True`
- Targets: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude, dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

### amplitude_family

- Aggregate relative MSE: `0.765861`
- Aggregate relative MAE: `0.955245`
- Beats null aggregate relative MSE: `True`
- Targets: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude`

### timing_family

- Aggregate relative MSE: `0.875046`
- Aggregate relative MAE: `0.868485`
- Beats null aggregate relative MSE: `True`
- Targets: `dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

### Per-subject family summary

- `sub-002` full relative MSE `0.947540`, amplitude relative MSE `0.870657`, timing relative MSE `1.062864`
- `sub-007` full relative MSE `8.384238`, amplitude relative MSE `13.293175`, timing relative MSE `1.020834`
- `sub-012` full relative MSE `0.616996`, amplitude relative MSE `0.704394`, timing relative MSE `0.485897`
- `sub-035` full relative MSE `1.410868`, amplitude relative MSE `1.568334`, timing relative MSE `1.174668`

## cohort_plus_sub011

- Source metrics: `reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_hybrid_detail_morphology_metrics.json`
- Rank selection: `best_rank`
- Best rank: `16`

### full

- Aggregate relative MSE: `0.833693`
- Aggregate relative MAE: `0.943700`
- Beats null aggregate relative MSE: `True`
- Targets: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude, dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

### amplitude_family

- Aggregate relative MSE: `0.779698`
- Aggregate relative MAE: `0.980356`
- Beats null aggregate relative MSE: `True`
- Targets: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude`

### timing_family

- Aggregate relative MSE: `0.914684`
- Aggregate relative MAE: `0.888716`
- Beats null aggregate relative MSE: `True`
- Targets: `dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

### Per-subject family summary

- `sub-002` full relative MSE `0.947540`, amplitude relative MSE `0.870657`, timing relative MSE `1.062864`
- `sub-007` full relative MSE `8.384238`, amplitude relative MSE `13.293175`, timing relative MSE `1.020834`
- `sub-011` full relative MSE `1.174704`, amplitude relative MSE `1.261967`, timing relative MSE `1.043811`
- `sub-012` full relative MSE `0.616996`, amplitude relative MSE `0.704394`, timing relative MSE `0.485897`
- `sub-035` full relative MSE `1.410868`, amplitude relative MSE `1.568334`, timing relative MSE `1.174668`
