# DS006848 Shift-Aware Baseline Report

- Config: `configs/cross_modal/ds006848_shift_aware_baseline_cohort_swap.toml`
- Ridge lambda: `1000.0`
- Calibration windows per eval subject: `32`
- Runtime seconds: `17.475`
- Peak memory MB: `1723.583`

## Reference

- Zero-shot reference config: `configs/cross_modal/ds006848_morphology_baseline_cohort_swap.toml`
- Zero-shot best branch: `eeg_clean_windows`
- Zero-shot aggregate delta on best branch: `1.626918`

## oracle_subject_zscore

- Best branch: `eeg_clean_windows`
- Aggregate model MSE: `1.908257`
- Aggregate null MSE: `1.000000`
- Aggregate delta: `0.908257`
- Beats null aggregate MSE: `False`

### eeg_event_windows

- Aggregate model MSE: `13.969312`
- Aggregate null MSE: `1.000000`
- Aggregate delta: `12.969312`
- Beats null aggregate MSE: `False`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `4.834820`
- Null MSE: `1.000000`
- Delta MSE: `3.834820`
- Beats null MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `23.241703`
- Null MSE: `1.000000`
- Delta MSE: `22.241703`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `21.727074`
- Null MSE: `1.000000`
- Delta MSE: `20.727074`
- Beats null MSE: `False`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `18.194127`
- Null MSE: `1.000000`
- Delta MSE: `17.194127`
- Beats null MSE: `False`

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `2.125138`
- Null MSE: `1.000000`
- Delta MSE: `1.125138`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `4.558518`
- Null MSE: `1.000000`
- Delta MSE: `3.558518`
- Beats null MSE: `False`

### eeg_clean_windows

- Aggregate model MSE: `1.908257`
- Aggregate null MSE: `1.000000`
- Aggregate delta: `0.908257`
- Beats null aggregate MSE: `False`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `1.922050`
- Null MSE: `1.000000`
- Delta MSE: `0.922050`
- Beats null MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `2.504607`
- Null MSE: `1.000000`
- Delta MSE: `1.504607`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `1.937295`
- Null MSE: `1.000000`
- Delta MSE: `0.937295`
- Beats null MSE: `False`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `1.768486`
- Null MSE: `1.000000`
- Delta MSE: `0.768486`
- Beats null MSE: `False`

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `2.053468`
- Null MSE: `1.000000`
- Delta MSE: `1.053468`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `1.277429`
- Null MSE: `1.000000`
- Delta MSE: `0.277429`
- Beats null MSE: `False`

## calibrated_subject_zscore

- Best branch: `eeg_clean_windows`
- Aggregate model MSE: `3.540489`
- Aggregate null MSE: `3.548766`
- Aggregate delta: `-0.008278`
- Beats null aggregate MSE: `True`

### eeg_event_windows

- Aggregate model MSE: `14.400491`
- Aggregate null MSE: `3.548766`
- Aggregate delta: `10.851725`
- Beats null aggregate MSE: `False`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `7.215510`
- Null MSE: `2.573771`
- Delta MSE: `4.641740`
- Beats null MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `20.004933`
- Null MSE: `3.132136`
- Delta MSE: `16.872798`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `19.115961`
- Null MSE: `4.008063`
- Delta MSE: `15.107899`
- Beats null MSE: `False`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `16.053295`
- Null MSE: `1.994034`
- Delta MSE: `14.059260`
- Beats null MSE: `False`

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `6.938421`
- Null MSE: `5.000149`
- Delta MSE: `1.938273`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `9.889845`
- Null MSE: `3.609450`
- Delta MSE: `6.280395`
- Beats null MSE: `False`

### eeg_clean_windows

- Aggregate model MSE: `3.540489`
- Aggregate null MSE: `3.548766`
- Aggregate delta: `-0.008278`
- Beats null aggregate MSE: `True`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `5.101701`
- Null MSE: `2.573771`
- Delta MSE: `2.527931`
- Beats null MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `2.633193`
- Null MSE: `3.132136`
- Delta MSE: `-0.498943`
- Beats null MSE: `True`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `3.499342`
- Null MSE: `4.008063`
- Delta MSE: `-0.508721`
- Beats null MSE: `True`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `2.374515`
- Null MSE: `1.994034`
- Delta MSE: `0.380481`
- Beats null MSE: `False`

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `5.204878`
- Null MSE: `5.000149`
- Delta MSE: `0.204729`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `3.990515`
- Null MSE: `3.609450`
- Delta MSE: `0.381065`
- Beats null MSE: `False`
