# DS006848 Morphology Baseline Report

- Config: `configs/cross_modal/ds006848_morphology_baseline_cohort_plus_sub025.toml`
- Ridge lambda: `1000.0`
- Runtime seconds: `9.758`
- Peak memory MB: `2276.967`
- Train windows: `1024`
- Eval windows: `1280`
- Best branch by standardized MSE: `eeg_clean_windows`
- Aggregate target set: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude, dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

## eeg_event_windows

- Aggregate standardized model MSE: `5.303403`
- Aggregate standardized null MSE: `2.533793`
- Aggregate standardized model MAE: `1.828955`
- Aggregate standardized null MAE: `1.127690`
- Beats null standardized MSE: `False`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.180589`
- Null MSE: `0.041549`
- Model MAE: `0.308806`
- Null MAE: `0.163343`
- Model corr: `-0.222463`
- Null corr: `0.000000`
- Model standardized MSE: `8.612974`
- Null standardized MSE: `1.981649`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000017`
- Null MSE: `0.000013`
- Model MAE: `0.003147`
- Null MAE: `0.002497`
- Model corr: `0.117586`
- Null corr: `0.000000`
- Model standardized MSE: `4.234402`
- Null standardized MSE: `3.310818`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000734`
- Null MSE: `0.000181`
- Model MAE: `0.022840`
- Null MAE: `0.009576`
- Model corr: `0.015646`
- Null corr: `0.000000`
- Model standardized MSE: `10.180730`
- Null standardized MSE: `2.512478`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1273`
- Model MSE: `0.000020`
- Null MSE: `0.000016`
- Model MAE: `0.003651`
- Null MAE: `0.002775`
- Model corr: `0.240912`
- Null corr: `0.000000`
- Model standardized MSE: `3.525635`
- Null standardized MSE: `2.828230`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1273`
- Model MSE: `0.056500`
- Null MSE: `0.026833`
- Model MAE: `0.189226`
- Null MAE: `0.128052`
- Model corr: `0.156148`
- Null corr: `0.000000`
- Model standardized MSE: `4.382121`
- Null standardized MSE: `2.081180`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1273`
- Model MSE: `0.070904`
- Null MSE: `0.032734`
- Model MAE: `0.219928`
- Null MAE: `0.127036`
- Model corr: `0.050135`
- Null corr: `0.000000`
- Model standardized MSE: `4.194128`
- Null standardized MSE: `1.936261`
- Beats null MSE: `False`

## eeg_clean_windows

- Aggregate standardized model MSE: `4.129839`
- Aggregate standardized null MSE: `2.533793`
- Aggregate standardized model MAE: `1.677761`
- Aggregate standardized null MAE: `1.127690`
- Beats null standardized MSE: `False`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.098511`
- Null MSE: `0.041549`
- Model MAE: `0.225381`
- Null MAE: `0.163343`
- Model corr: `-0.237674`
- Null corr: `0.000000`
- Model standardized MSE: `4.698361`
- Null standardized MSE: `1.981649`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000022`
- Null MSE: `0.000013`
- Model MAE: `0.004128`
- Null MAE: `0.002497`
- Model corr: `-0.636228`
- Null corr: `0.000000`
- Model standardized MSE: `5.514928`
- Null standardized MSE: `3.310818`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000325`
- Null MSE: `0.000181`
- Model MAE: `0.014541`
- Null MAE: `0.009576`
- Model corr: `-0.681347`
- Null corr: `0.000000`
- Model standardized MSE: `4.501101`
- Null standardized MSE: `2.512478`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1273`
- Model MSE: `0.000027`
- Null MSE: `0.000016`
- Model MAE: `0.004594`
- Null MAE: `0.002775`
- Model corr: `-0.570570`
- Null corr: `0.000000`
- Model standardized MSE: `4.801571`
- Null standardized MSE: `2.828230`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1273`
- Model MSE: `0.041118`
- Null MSE: `0.026833`
- Model MAE: `0.162043`
- Null MAE: `0.128052`
- Model corr: `0.032853`
- Null corr: `0.000000`
- Model standardized MSE: `3.189113`
- Null standardized MSE: `2.081180`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1273`
- Model MSE: `0.044673`
- Null MSE: `0.032734`
- Model MAE: `0.165003`
- Null MAE: `0.127036`
- Model corr: `-0.099099`
- Null corr: `0.000000`
- Model standardized MSE: `2.642482`
- Null standardized MSE: `1.936261`
- Beats null MSE: `False`
