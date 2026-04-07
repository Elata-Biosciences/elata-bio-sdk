# DS006848 Morphology Baseline Report

- Config: `configs/cross_modal/ds006848_morphology_baseline_cohort_plus_sub011.toml`
- Ridge lambda: `1000.0`
- Runtime seconds: `11.336`
- Peak memory MB: `2276.967`
- Train windows: `1024`
- Eval windows: `1280`
- Best branch by standardized MSE: `eeg_clean_windows`
- Aggregate target set: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude, dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

## eeg_event_windows

- Aggregate standardized model MSE: `11.920436`
- Aggregate standardized null MSE: `2.365638`
- Aggregate standardized model MAE: `2.659348`
- Aggregate standardized null MAE: `1.050685`
- Beats null standardized MSE: `False`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.165979`
- Null MSE: `0.030187`
- Model MAE: `0.299908`
- Null MAE: `0.146810`
- Model corr: `0.113234`
- Null corr: `0.000000`
- Model standardized MSE: `7.916135`
- Null standardized MSE: `1.439715`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000057`
- Null MSE: `0.000013`
- Model MAE: `0.005331`
- Null MAE: `0.002349`
- Model corr: `-0.149995`
- Null corr: `0.000000`
- Model standardized MSE: `14.024099`
- Null standardized MSE: `3.251877`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.001080`
- Null MSE: `0.000180`
- Model MAE: `0.030162`
- Null MAE: `0.008818`
- Model corr: `-0.107300`
- Null corr: `0.000000`
- Model standardized MSE: `14.978555`
- Null standardized MSE: `2.499334`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1274`
- Model MSE: `0.000077`
- Null MSE: `0.000015`
- Model MAE: `0.006172`
- Null MAE: `0.002540`
- Model corr: `-0.082833`
- Null corr: `0.000000`
- Model standardized MSE: `13.522410`
- Null standardized MSE: `2.702992`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1274`
- Model MSE: `0.145398`
- Null MSE: `0.023746`
- Model MAE: `0.284945`
- Null MAE: `0.124671`
- Model corr: `-0.075680`
- Null corr: `0.000000`
- Model standardized MSE: `11.277108`
- Null standardized MSE: `1.841740`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1274`
- Model MSE: `0.098052`
- Null MSE: `0.025903`
- Model MAE: `0.259326`
- Null MAE: `0.114878`
- Model corr: `-0.014010`
- Null corr: `0.000000`
- Model standardized MSE: `5.800008`
- Null standardized MSE: `1.532247`
- Beats null MSE: `False`

## eeg_clean_windows

- Aggregate standardized model MSE: `8.888553`
- Aggregate standardized null MSE: `2.365638`
- Aggregate standardized model MAE: `2.267154`
- Aggregate standardized null MAE: `1.050685`
- Beats null standardized MSE: `False`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.032207`
- Null MSE: `0.030187`
- Model MAE: `0.148842`
- Null MAE: `0.146810`
- Model corr: `0.197849`
- Null corr: `0.000000`
- Model standardized MSE: `1.536073`
- Null standardized MSE: `1.439715`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000056`
- Null MSE: `0.000013`
- Model MAE: `0.006064`
- Null MAE: `0.002349`
- Model corr: `-0.494859`
- Null corr: `0.000000`
- Model standardized MSE: `13.785135`
- Null standardized MSE: `3.251877`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000755`
- Null MSE: `0.000180`
- Model MAE: `0.021884`
- Null MAE: `0.008818`
- Model corr: `-0.454088`
- Null corr: `0.000000`
- Model standardized MSE: `10.477062`
- Null standardized MSE: `2.499334`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1274`
- Model MSE: `0.000074`
- Null MSE: `0.000015`
- Model MAE: `0.006800`
- Null MAE: `0.002540`
- Model corr: `-0.449009`
- Null corr: `0.000000`
- Model standardized MSE: `13.086690`
- Null standardized MSE: `2.702992`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1274`
- Model MSE: `0.057209`
- Null MSE: `0.023746`
- Model MAE: `0.187546`
- Null MAE: `0.124671`
- Model corr: `-0.093634`
- Null corr: `0.000000`
- Model standardized MSE: `4.437118`
- Null standardized MSE: `1.841740`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1274`
- Model MSE: `0.044914`
- Null MSE: `0.025903`
- Model MAE: `0.161003`
- Null MAE: `0.114878`
- Model corr: `-0.076351`
- Null corr: `0.000000`
- Model standardized MSE: `2.656761`
- Null standardized MSE: `1.532247`
- Beats null MSE: `False`
