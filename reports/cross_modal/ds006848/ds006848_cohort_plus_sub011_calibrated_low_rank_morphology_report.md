# DS006848 Calibrated Low-Rank Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_low_rank_morphology_cohort_plus_sub011.toml`
- Ridge lambda: `1000.0`
- Candidate ranks: `8, 16, 32, 64, 128, 256, 512`
- Calibration windows per eval subject: `32`
- Runtime seconds: `21.692`
- Peak memory MB: `1907.713`

## Reference Linear Baseline

- Linear reference config: `configs/cross_modal/ds006848_calibrated_absolute_baseline_cohort_plus_sub011.toml`
- Linear best branch: `eeg_clean_windows`
- Linear best aggregate relative MSE: `2.195706`
- Linear best aggregate delta relative MSE: `1.195706`

## Best Low-Rank Candidate

- Best branch: `eeg_clean_windows`
- Best rank: `8`
- Aggregate relative MSE: `1.096923`
- Aggregate delta relative MSE: `0.096923`

## eeg_event_windows

- Best rank: `8`
- Best aggregate relative MSE: `1.100099`
- Best aggregate delta relative MSE: `0.100099`

### Rank Sweep

- rank `8`: aggregate relative MSE `1.100099`, delta `0.100099`
- rank `16`: aggregate relative MSE `2.764723`, delta `1.764723`
- rank `32`: aggregate relative MSE `4.964669`, delta `3.964669`
- rank `64`: aggregate relative MSE `4.562116`, delta `3.562116`
- rank `128`: aggregate relative MSE `4.641029`, delta `3.641029`
- rank `256`: aggregate relative MSE `4.637730`, delta `3.637730`
- rank `512`: aggregate relative MSE `4.637728`, delta `3.637728`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.036630`
- Null MSE: `0.031243`
- Relative MSE: `1.172426`
- Model MAE: `0.151974`
- Null MAE: `0.142756`
- Relative MAE: `1.064571`
- Model corr: `0.518075`
- Null corr: `0.456390`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000011`
- Null MSE: `0.000011`
- Relative MSE: `0.997760`
- Model MAE: `0.002298`
- Null MAE: `0.002000`
- Relative MAE: `1.149049`
- Model corr: `0.654128`
- Null corr: `0.755187`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000203`
- Null MSE: `0.000230`
- Relative MSE: `0.883027`
- Model MAE: `0.010325`
- Null MAE: `0.009129`
- Relative MAE: `1.130924`
- Model corr: `0.592189`
- Null corr: `0.672047`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.000013`
- Null MSE: `0.000010`
- Relative MSE: `1.247689`
- Model MAE: `0.002692`
- Null MAE: `0.002135`
- Relative MAE: `1.260534`
- Model corr: `0.667210`
- Null corr: `0.733926`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.035605`
- Null MSE: `0.028441`
- Relative MSE: `1.251886`
- Model MAE: `0.155740`
- Null MAE: `0.132811`
- Relative MAE: `1.172646`
- Model corr: `0.052206`
- Null corr: `-0.011507`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.037133`
- Null MSE: `0.033151`
- Relative MSE: `1.120131`
- Model MAE: `0.157452`
- Null MAE: `0.139312`
- Relative MAE: `1.130207`
- Model corr: `0.104841`
- Null corr: `0.046480`
- Beats null MSE: `False`

## eeg_clean_windows

- Best rank: `8`
- Best aggregate relative MSE: `1.096923`
- Best aggregate delta relative MSE: `0.096923`

### Rank Sweep

- rank `8`: aggregate relative MSE `1.096923`, delta `0.096923`
- rank `16`: aggregate relative MSE `2.189414`, delta `1.189414`
- rank `32`: aggregate relative MSE `2.331656`, delta `1.331656`
- rank `64`: aggregate relative MSE `2.189033`, delta `1.189033`
- rank `128`: aggregate relative MSE `2.196022`, delta `1.196022`
- rank `256`: aggregate relative MSE `2.195712`, delta `1.195712`
- rank `512`: aggregate relative MSE `2.195682`, delta `1.195682`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.036519`
- Null MSE: `0.031243`
- Relative MSE: `1.168859`
- Model MAE: `0.151783`
- Null MAE: `0.142756`
- Relative MAE: `1.063237`
- Model corr: `0.517841`
- Null corr: `0.456390`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000011`
- Null MSE: `0.000011`
- Relative MSE: `0.995164`
- Model MAE: `0.002292`
- Null MAE: `0.002000`
- Relative MAE: `1.145883`
- Model corr: `0.655964`
- Null corr: `0.755187`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000203`
- Null MSE: `0.000230`
- Relative MSE: `0.884053`
- Model MAE: `0.010310`
- Null MAE: `0.009129`
- Relative MAE: `1.129351`
- Model corr: `0.593666`
- Null corr: `0.672047`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.000013`
- Null MSE: `0.000010`
- Relative MSE: `1.242740`
- Model MAE: `0.002684`
- Null MAE: `0.002135`
- Relative MAE: `1.256959`
- Model corr: `0.668598`
- Null corr: `0.733926`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.035447`
- Null MSE: `0.028441`
- Relative MSE: `1.246332`
- Model MAE: `0.155491`
- Null MAE: `0.132811`
- Relative MAE: `1.170771`
- Model corr: `0.051869`
- Null corr: `-0.011507`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.037007`
- Null MSE: `0.033151`
- Relative MSE: `1.116326`
- Model MAE: `0.157270`
- Null MAE: `0.139312`
- Relative MAE: `1.128901`
- Model corr: `0.104619`
- Null corr: `0.046480`
- Beats null MSE: `False`
