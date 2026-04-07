# DS006848 Morphology Baseline Report

- Config: `configs/cross_modal/ds006848_morphology_baseline_cohort_swap.toml`
- Ridge lambda: `1000.0`
- Runtime seconds: `10.980`
- Peak memory MB: `1969.335`
- Train windows: `1024`
- Eval windows: `1024`
- Best branch by standardized MSE: `eeg_clean_windows`
- Aggregate target set: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude, dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

## eeg_event_windows

- Aggregate standardized model MSE: `5.831045`
- Aggregate standardized null MSE: `2.652098`
- Aggregate standardized model MAE: `1.897040`
- Aggregate standardized null MAE: `1.118415`
- Beats null standardized MSE: `False`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `0.045107`
- Null MSE: `0.027993`
- Model MAE: `0.179736`
- Null MAE: `0.139630`
- Model corr: `0.484701`
- Null corr: `0.000000`
- Model standardized MSE: `2.151298`
- Null standardized MSE: `1.335081`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `0.000018`
- Null MSE: `0.000016`
- Model MAE: `0.003037`
- Null MAE: `0.002741`
- Model corr: `0.491605`
- Null corr: `0.000000`
- Model standardized MSE: `4.479201`
- Null standardized MSE: `3.989703`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `0.000909`
- Null MSE: `0.000212`
- Model MAE: `0.027272`
- Null MAE: `0.010081`
- Model corr: `0.412900`
- Null corr: `0.000000`
- Model standardized MSE: `12.604939`
- Null standardized MSE: `2.934263`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `0.000019`
- Null MSE: `0.000019`
- Model MAE: `0.003340`
- Null MAE: `0.002921`
- Model corr: `0.592631`
- Null corr: `0.000000`
- Model standardized MSE: `3.336009`
- Null standardized MSE: `3.313780`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `0.056562`
- Null MSE: `0.021068`
- Model MAE: `0.186004`
- Null MAE: `0.114625`
- Model corr: `-0.046942`
- Null corr: `0.000000`
- Model standardized MSE: `4.387005`
- Null standardized MSE: `1.634035`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `0.073507`
- Null MSE: `0.023477`
- Model MAE: `0.224107`
- Null MAE: `0.104899`
- Model corr: `0.050075`
- Null corr: `0.000000`
- Model standardized MSE: `4.348073`
- Null standardized MSE: `1.388708`
- Beats null MSE: `False`

## eeg_clean_windows

- Aggregate standardized model MSE: `4.279015`
- Aggregate standardized null MSE: `2.652098`
- Aggregate standardized model MAE: `1.672082`
- Aggregate standardized null MAE: `1.118415`
- Beats null standardized MSE: `False`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `0.025292`
- Null MSE: `0.027993`
- Model MAE: `0.133671`
- Null MAE: `0.139630`
- Model corr: `0.541324`
- Null corr: `0.000000`
- Model standardized MSE: `1.206251`
- Null standardized MSE: `1.335081`
- Beats null MSE: `True`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `0.000024`
- Null MSE: `0.000016`
- Model MAE: `0.004221`
- Null MAE: `0.002741`
- Model corr: `-0.715293`
- Null corr: `0.000000`
- Model standardized MSE: `6.012493`
- Null standardized MSE: `3.989703`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `0.000375`
- Null MSE: `0.000212`
- Model MAE: `0.015474`
- Null MAE: `0.010081`
- Model corr: `-0.694453`
- Null corr: `0.000000`
- Model standardized MSE: `5.203784`
- Null standardized MSE: `2.934263`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `0.000028`
- Null MSE: `0.000019`
- Model MAE: `0.004473`
- Null MAE: `0.002921`
- Model corr: `-0.634718`
- Null corr: `0.000000`
- Model standardized MSE: `4.854079`
- Null standardized MSE: `3.313780`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `0.039654`
- Null MSE: `0.021068`
- Model MAE: `0.158086`
- Null MAE: `0.114625`
- Model corr: `-0.081409`
- Null corr: `0.000000`
- Model standardized MSE: `3.075570`
- Null standardized MSE: `1.634035`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `0.038023`
- Null MSE: `0.023477`
- Model MAE: `0.152121`
- Null MAE: `0.104899`
- Model corr: `-0.069353`
- Null corr: `0.000000`
- Model standardized MSE: `2.249151`
- Null standardized MSE: `1.388708`
- Beats null MSE: `False`
