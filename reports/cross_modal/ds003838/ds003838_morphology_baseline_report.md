# DS003838 Morphology Baseline Report

- Config: `configs/cross_modal/ds003838_morphology_baseline.toml`
- Ridge lambda: `1000000.0`
- Runtime seconds: `2.495`
- Peak memory MB: `861.861`
- Train windows: `512`
- Eval windows: `512`
- Best branch by standardized MSE: `eeg_event_windows`

## eeg_event_windows

- Aggregate standardized model MSE: `298.595666`
- Aggregate standardized null MSE: `348.720664`
- Aggregate standardized model MAE: `9.482194`
- Aggregate standardized null MAE: `8.120004`
- Beats null standardized MSE: `True`

### mean_ibi_seconds

- Model MSE: `0.150321`
- Null MSE: `0.061175`
- Model MAE: `0.333731`
- Null MAE: `0.175619`
- Model corr: `0.130382`
- Null corr: `0.000000`
- Beats null MSE: `False`

### amplitude_range

- Model MSE: `212063914.900520`
- Null MSE: `240197332.047640`
- Model MAE: `12035.035373`
- Null MAE: `9874.472300`
- Model corr: `-0.229984`
- Null corr: `0.000000`
- Beats null MSE: `True`

### rising_edge_slope_max

- Model MSE: `21085913532.573547`
- Null MSE: `26121228614.027081`
- Model MAE: `67406.075372`
- Null MAE: `71582.458978`
- Model corr: `-0.069645`
- Null corr: `0.000000`
- Beats null MSE: `True`

## eeg_clean_windows

- Aggregate standardized model MSE: `303.308069`
- Aggregate standardized null MSE: `348.720664`
- Aggregate standardized model MAE: `6.883830`
- Aggregate standardized null MAE: `8.120004`
- Beats null standardized MSE: `True`

### mean_ibi_seconds

- Model MSE: `0.086334`
- Null MSE: `0.061175`
- Model MAE: `0.227353`
- Null MAE: `0.175619`
- Model corr: `0.130754`
- Null corr: `0.000000`
- Beats null MSE: `False`

### amplitude_range

- Model MSE: `157439466.674256`
- Null MSE: `240197332.047640`
- Model MAE: `6965.953973`
- Null MAE: `9874.472300`
- Model corr: `-0.240689`
- Null corr: `0.000000`
- Beats null MSE: `True`

### rising_edge_slope_max

- Model MSE: `23282270683.242565`
- Null MSE: `26121228614.027081`
- Model MAE: `58192.684613`
- Null MAE: `71582.458978`
- Model corr: `-0.080916`
- Null corr: `0.000000`
- Beats null MSE: `True`
