# DS006848 Calibrated Family Comparison Report

- Mode: `calibrated_absolute`
- Branch: `eeg_clean_windows`

## cohort_swap

- Source metrics: `reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_absolute_baseline_metrics.json`

### full

- Aggregate relative MSE: `0.923777`
- Aggregate relative MAE: `0.916071`
- Beats null aggregate relative MSE: `True`
- Targets: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude, dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

### amplitude_family

- Aggregate relative MSE: `0.874252`
- Aggregate relative MAE: `0.899579`
- Beats null aggregate relative MSE: `True`
- Targets: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude`

### timing_family

- Aggregate relative MSE: `0.998064`
- Aggregate relative MAE: `0.940810`
- Beats null aggregate relative MSE: `True`
- Targets: `dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

### Per-subject family summary

- `sub-002` amplitude relative MSE `1.120188`, timing relative MSE `1.049867`
- `sub-007` amplitude relative MSE `1.427388`, timing relative MSE `1.207052`
- `sub-012` amplitude relative MSE `0.837438`, timing relative MSE `0.785405`
- `sub-035` amplitude relative MSE `1.383511`, timing relative MSE `1.148500`

## cohort_plus_sub011

- Source metrics: `reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_absolute_baseline_metrics.json`

### full

- Aggregate relative MSE: `2.195706`
- Aggregate relative MAE: `1.259249`
- Beats null aggregate relative MSE: `False`
- Targets: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude, dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

### amplitude_family

- Aggregate relative MSE: `0.901681`
- Aggregate relative MAE: `0.965489`
- Beats null aggregate relative MSE: `True`
- Targets: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude`

### timing_family

- Aggregate relative MSE: `4.136743`
- Aggregate relative MAE: `1.699891`
- Beats null aggregate relative MSE: `False`
- Targets: `dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

### Per-subject family summary

- `sub-002` amplitude relative MSE `1.120188`, timing relative MSE `1.049867`
- `sub-007` amplitude relative MSE `1.427388`, timing relative MSE `1.207052`
- `sub-011` amplitude relative MSE `2.050463`, timing relative MSE `14.445098`
- `sub-012` amplitude relative MSE `0.837438`, timing relative MSE `0.785405`
- `sub-035` amplitude relative MSE `1.383511`, timing relative MSE `1.148500`
