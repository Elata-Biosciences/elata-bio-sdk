# DS006848 Morphology Baseline Report

- Config: `configs/cross_modal/ds006848_morphology_baseline_expanded.toml`
- Ridge lambda: `1000.0`
- Runtime seconds: `5.386`
- Peak memory MB: `984.918`
- Train windows: `512`
- Eval windows: `512`
- Best branch by standardized MSE: `eeg_event_windows`
- Aggregate target set: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude, dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

## eeg_event_windows

- Aggregate standardized model MSE: `71.105718`
- Aggregate standardized null MSE: `82.954553`
- Aggregate standardized model MAE: `6.806873`
- Aggregate standardized null MAE: `4.736606`
- Beats null standardized MSE: `True`

### mean_ibi_seconds

- Train windows: `512`
- Eval windows: `512`
- Model MSE: `6.400663`
- Null MSE: `0.040317`
- Model MAE: `2.182961`
- Null MAE: `0.163799`
- Model corr: `-0.092697`
- Null corr: `0.000000`
- Model standardized MSE: `370.209514`
- Null standardized MSE: `2.331881`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `512`
- Eval windows: `512`
- Model MSE: `0.000012`
- Null MSE: `0.000030`
- Model MAE: `0.002048`
- Null MAE: `0.003555`
- Model corr: `0.813907`
- Null corr: `0.000000`
- Model standardized MSE: `80.206566`
- Null standardized MSE: `199.475005`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `512`
- Eval windows: `512`
- Model MSE: `0.000506`
- Null MSE: `0.000397`
- Model MAE: `0.019867`
- Null MAE: `0.012567`
- Model corr: `-0.686048`
- Null corr: `0.000000`
- Model standardized MSE: `98.645509`
- Null standardized MSE: `77.521496`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `508`
- Eval windows: `512`
- Model MSE: `0.000010`
- Null MSE: `0.000034`
- Model MAE: `0.002252`
- Null MAE: `0.003789`
- Model corr: `0.807165`
- Null corr: `0.000000`
- Model standardized MSE: `40.803486`
- Null standardized MSE: `135.853072`
- Beats null MSE: `True`

### dominant_beat_rise_time_seconds

- Train windows: `508`
- Eval windows: `512`
- Model MSE: `1.253315`
- Null MSE: `0.018603`
- Model MAE: `1.041691`
- Null MAE: `0.106102`
- Model corr: `-0.028813`
- Null corr: `0.000000`
- Model standardized MSE: `69.808724`
- Null standardized MSE: `1.036165`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `508`
- Eval windows: `512`
- Model MSE: `1.552096`
- Null MSE: `0.020840`
- Model MAE: `1.179377`
- Null MAE: `0.089637`
- Model corr: `0.033067`
- Null corr: `0.000000`
- Model standardized MSE: `66.064302`
- Null standardized MSE: `0.887028`
- Beats null MSE: `False`

## eeg_clean_windows

- Aggregate standardized model MSE: `77.506999`
- Aggregate standardized null MSE: `82.954553`
- Aggregate standardized model MAE: `6.329595`
- Aggregate standardized null MAE: `4.736606`
- Beats null standardized MSE: `True`

### mean_ibi_seconds

- Train windows: `512`
- Eval windows: `512`
- Model MSE: `2.588842`
- Null MSE: `0.040317`
- Model MAE: `1.381489`
- Null MAE: `0.163799`
- Model corr: `-0.078496`
- Null corr: `0.000000`
- Model standardized MSE: `149.736696`
- Null standardized MSE: `2.331881`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `512`
- Eval windows: `512`
- Model MSE: `0.000020`
- Null MSE: `0.000030`
- Model MAE: `0.002861`
- Null MAE: `0.003555`
- Model corr: `0.797525`
- Null corr: `0.000000`
- Model standardized MSE: `136.723817`
- Null standardized MSE: `199.475005`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `512`
- Eval windows: `512`
- Model MSE: `0.000456`
- Null MSE: `0.000397`
- Model MAE: `0.018785`
- Null MAE: `0.012567`
- Model corr: `-0.775014`
- Null corr: `0.000000`
- Model standardized MSE: `88.900521`
- Null standardized MSE: `77.521496`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `508`
- Eval windows: `512`
- Model MSE: `0.000020`
- Null MSE: `0.000034`
- Model MAE: `0.002747`
- Null MAE: `0.003789`
- Model corr: `0.804801`
- Null corr: `0.000000`
- Model standardized MSE: `80.598441`
- Null standardized MSE: `135.853072`
- Beats null MSE: `True`

### dominant_beat_rise_time_seconds

- Train windows: `508`
- Eval windows: `512`
- Model MSE: `0.603314`
- Null MSE: `0.018603`
- Model MAE: `0.642654`
- Null MAE: `0.106102`
- Model corr: `-0.029941`
- Null corr: `0.000000`
- Model standardized MSE: `33.604124`
- Null standardized MSE: `1.036165`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `508`
- Eval windows: `512`
- Model MSE: `1.120840`
- Null MSE: `0.020840`
- Model MAE: `0.869552`
- Null MAE: `0.089637`
- Model corr: `0.032532`
- Null corr: `0.000000`
- Model standardized MSE: `47.708092`
- Null standardized MSE: `0.887028`
- Beats null MSE: `False`
