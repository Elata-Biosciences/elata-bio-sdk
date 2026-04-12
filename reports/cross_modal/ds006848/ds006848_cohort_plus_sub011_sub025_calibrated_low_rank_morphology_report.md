# DS006848 Calibrated Low-Rank Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_low_rank_morphology_cohort_plus_sub011_sub025.toml`
- Ridge lambda: `1000.0`
- Candidate ranks: `8, 16, 32, 64, 128, 256, 512`
- Calibration windows per eval subject: `32`
- Runtime seconds: `17.440`
- Peak memory MB: `2092.283`

## Reference Linear Baseline

- Linear reference config: `configs/cross_modal/ds006848_calibrated_absolute_baseline_cohort_plus_sub011_sub025.toml`
- Linear best branch: `eeg_clean_windows`
- Linear best aggregate relative MSE: `1.978477`
- Linear best aggregate delta relative MSE: `0.978477`

## Best Low-Rank Candidate

- Best branch: `eeg_clean_windows`
- Best rank: `8`
- Aggregate relative MSE: `1.086335`
- Aggregate delta relative MSE: `0.086335`

## eeg_event_windows

- Best rank: `8`
- Best aggregate relative MSE: `1.089323`
- Best aggregate delta relative MSE: `0.089323`

### Rank Sweep

- rank `8`: aggregate relative MSE `1.089323`, delta `0.089323`
- rank `16`: aggregate relative MSE `2.595386`, delta `1.595386`
- rank `32`: aggregate relative MSE `4.977136`, delta `3.977136`
- rank `64`: aggregate relative MSE `4.413827`, delta `3.413827`
- rank `128`: aggregate relative MSE `4.513981`, delta `3.513981`
- rank `256`: aggregate relative MSE `4.511257`, delta `3.511257`
- rank `512`: aggregate relative MSE `4.511204`, delta `3.511204`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.037781`
- Null MSE: `0.033628`
- Relative MSE: `1.123487`
- Model MAE: `0.154894`
- Null MAE: `0.148190`
- Relative MAE: `1.045240`
- Model corr: `0.590885`
- Null corr: `0.554616`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.000009`
- Null MSE: `0.000009`
- Relative MSE: `0.997751`
- Model MAE: `0.001957`
- Null MAE: `0.001710`
- Relative MAE: `1.144703`
- Model corr: `0.702046`
- Null corr: `0.784475`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.000169`
- Null MSE: `0.000192`
- Relative MSE: `0.883447`
- Model MAE: `0.008795`
- Null MAE: `0.007811`
- Relative MAE: `1.126061`
- Model corr: `0.660184`
- Null corr: `0.715859`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.000011`
- Null MSE: `0.000009`
- Relative MSE: `1.247095`
- Model MAE: `0.002299`
- Null MAE: `0.001832`
- Relative MAE: `1.255337`
- Model corr: `0.720176`
- Null corr: `0.772992`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.037195`
- Null MSE: `0.030474`
- Relative MSE: `1.220518`
- Model MAE: `0.159147`
- Null MAE: `0.139431`
- Relative MAE: `1.141405`
- Model corr: `0.022776`
- Null corr: `0.165070`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.039893`
- Null MSE: `0.036339`
- Relative MSE: `1.097803`
- Model MAE: `0.163324`
- Null MAE: `0.147682`
- Relative MAE: `1.105912`
- Model corr: `0.102556`
- Null corr: `0.177149`
- Beats null MSE: `False`

## eeg_clean_windows

- Best rank: `8`
- Best aggregate relative MSE: `1.086335`
- Best aggregate delta relative MSE: `0.086335`

### Rank Sweep

- rank `8`: aggregate relative MSE `1.086335`, delta `0.086335`
- rank `16`: aggregate relative MSE `2.096597`, delta `1.096597`
- rank `32`: aggregate relative MSE `2.121385`, delta `1.121385`
- rank `64`: aggregate relative MSE `1.970457`, delta `0.970457`
- rank `128`: aggregate relative MSE `1.978713`, delta `0.978713`
- rank `256`: aggregate relative MSE `1.978485`, delta `0.978485`
- rank `512`: aggregate relative MSE `1.978466`, delta `0.978466`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.037692`
- Null MSE: `0.033628`
- Relative MSE: `1.120864`
- Model MAE: `0.154750`
- Null MAE: `0.148190`
- Relative MAE: `1.044268`
- Model corr: `0.590751`
- Null corr: `0.554616`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.000009`
- Null MSE: `0.000009`
- Relative MSE: `0.995163`
- Model MAE: `0.001952`
- Null MAE: `0.001710`
- Relative MAE: `1.141668`
- Model corr: `0.703559`
- Null corr: `0.784475`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.000170`
- Null MSE: `0.000192`
- Relative MSE: `0.884463`
- Model MAE: `0.008783`
- Null MAE: `0.007811`
- Relative MAE: `1.124519`
- Model corr: `0.661280`
- Null corr: `0.715859`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.000011`
- Null MSE: `0.000009`
- Relative MSE: `1.242163`
- Model MAE: `0.002293`
- Null MAE: `0.001832`
- Relative MAE: `1.251895`
- Model corr: `0.721292`
- Null corr: `0.772992`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.037039`
- Null MSE: `0.030474`
- Relative MSE: `1.215418`
- Model MAE: `0.158910`
- Null MAE: `0.139431`
- Relative MAE: `1.139703`
- Model corr: `0.024410`
- Null corr: `0.165070`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.039772`
- Null MSE: `0.036339`
- Relative MSE: `1.094467`
- Model MAE: `0.163148`
- Null MAE: `0.147682`
- Relative MAE: `1.104722`
- Model corr: `0.103976`
- Null corr: `0.177149`
- Beats null MSE: `False`
