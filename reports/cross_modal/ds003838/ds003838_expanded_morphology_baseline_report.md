# DS003838 Morphology Baseline Report

- Config: `configs/cross_modal/ds003838_morphology_baseline_expanded.toml`
- Ridge lambda: `1000.0`
- Runtime seconds: `29.017`
- Peak memory MB: `3938.169`
- Train windows: `2048`
- Eval windows: `2048`
- Best branch by standardized MSE: `eeg_clean_windows`
- Aggregate target set: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude, dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

## eeg_event_windows

- Aggregate standardized model MSE: `36.711023`
- Aggregate standardized null MSE: `6.051848`
- Aggregate standardized model MAE: `4.950566`
- Aggregate standardized null MAE: `1.082828`
- Beats null standardized MSE: `False`

### mean_ibi_seconds

- Train windows: `2048`
- Eval windows: `2048`
- Model MSE: `0.166458`
- Null MSE: `0.026583`
- Model MAE: `0.352636`
- Null MAE: `0.117717`
- Model corr: `-0.372780`
- Null corr: `0.000000`
- Model standardized MSE: `7.855258`
- Null standardized MSE: `1.254476`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `2048`
- Eval windows: `2048`
- Model MSE: `181300596.241852`
- Null MSE: `60819788.069827`
- Model MAE: `10814.060884`
- Null MAE: `4024.077880`
- Model corr: `-0.134076`
- Null corr: `0.000000`
- Model standardized MSE: `23.541511`
- Null standardized MSE: `7.897325`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `2048`
- Eval windows: `2048`
- Model MSE: `34648945421.064041`
- Null MSE: `6488330350.058382`
- Model MAE: `157850.227022`
- Null MAE: `24641.772128`
- Model corr: `-0.016378`
- Null corr: `0.000000`
- Model standardized MSE: `76.334743`
- Null standardized MSE: `14.294375`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `2045`
- Eval windows: `2046`
- Model MSE: `147844460.356555`
- Null MSE: `55832825.388253`
- Model MAE: `10149.067305`
- Null MAE: `4154.696956`
- Model corr: `-0.276603`
- Null corr: `0.000000`
- Model standardized MSE: `16.395553`
- Null standardized MSE: `6.191710`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `2045`
- Eval windows: `2046`
- Model MSE: `0.758229`
- Null MSE: `0.014344`
- Model MAE: `0.786804`
- Null MAE: `0.091476`
- Model corr: `-0.111134`
- Null corr: `0.000000`
- Model standardized MSE: `48.547005`
- Null standardized MSE: `0.918411`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `2045`
- Eval windows: `2046`
- Model MSE: `0.356242`
- Null MSE: `0.018204`
- Model MAE: `0.520049`
- Null MAE: `0.095412`
- Model corr: `-0.269206`
- Null corr: `0.000000`
- Model standardized MSE: `18.736305`
- Null standardized MSE: `0.957416`
- Beats null MSE: `False`

## eeg_clean_windows

- Aggregate standardized model MSE: `11.361128`
- Aggregate standardized null MSE: `6.051848`
- Aggregate standardized model MAE: `2.465303`
- Aggregate standardized null MAE: `1.082828`
- Beats null standardized MSE: `False`

### mean_ibi_seconds

- Train windows: `2048`
- Eval windows: `2048`
- Model MSE: `0.081180`
- Null MSE: `0.026583`
- Model MAE: `0.233341`
- Null MAE: `0.117717`
- Model corr: `-0.358537`
- Null corr: `0.000000`
- Model standardized MSE: `3.830935`
- Null standardized MSE: `1.254476`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `2048`
- Eval windows: `2048`
- Model MSE: `58882452.651853`
- Null MSE: `60819788.069827`
- Model MAE: `5073.175905`
- Null MAE: `4024.077880`
- Model corr: `0.147713`
- Null corr: `0.000000`
- Model standardized MSE: `7.645766`
- Null standardized MSE: `7.897325`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `2048`
- Eval windows: `2048`
- Model MSE: `10651829526.851688`
- Null MSE: `6488330350.058382`
- Model MAE: `75775.302921`
- Null MAE: `24641.772128`
- Model corr: `0.043467`
- Null corr: `0.000000`
- Model standardized MSE: `23.466938`
- Null standardized MSE: `14.294375`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `2045`
- Eval windows: `2046`
- Model MSE: `52609920.410427`
- Null MSE: `55832825.388253`
- Model MAE: `4529.290998`
- Null MAE: `4154.696956`
- Model corr: `0.146121`
- Null corr: `0.000000`
- Model standardized MSE: `5.834299`
- Null standardized MSE: `6.191710`
- Beats null MSE: `True`

### dominant_beat_rise_time_seconds

- Train windows: `2045`
- Eval windows: `2046`
- Model MSE: `0.216356`
- Null MSE: `0.014344`
- Model MAE: `0.412480`
- Null MAE: `0.091476`
- Model corr: `-0.099545`
- Null corr: `0.000000`
- Model standardized MSE: `13.852564`
- Null standardized MSE: `0.918411`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `2045`
- Eval windows: `2046`
- Model MSE: `0.114196`
- Null MSE: `0.018204`
- Model MAE: `0.294106`
- Null MAE: `0.095412`
- Model corr: `-0.272284`
- Null corr: `0.000000`
- Model standardized MSE: `6.006073`
- Null standardized MSE: `0.957416`
- Beats null MSE: `False`
