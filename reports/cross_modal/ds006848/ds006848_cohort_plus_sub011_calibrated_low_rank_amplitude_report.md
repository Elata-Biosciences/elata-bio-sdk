# DS006848 Calibrated Low-Rank Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub011.toml`
- Ridge lambda: `1000.0`
- Candidate ranks: `8, 16, 32, 64, 128, 256, 512`
- Calibration windows per eval subject: `32`
- Runtime seconds: `15.908`
- Peak memory MB: `1907.713`

## Reference Linear Baseline

- Linear reference config: `configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub011.toml`
- Linear best branch: `eeg_clean_windows`
- Linear best aggregate relative MSE: `0.901681`
- Linear best aggregate delta relative MSE: `-0.098319`

## Best Low-Rank Candidate

- Best branch: `eeg_clean_windows`
- Best rank: `64`
- Aggregate relative MSE: `0.895379`
- Aggregate delta relative MSE: `-0.104621`

## eeg_event_windows

- Best rank: `8`
- Best aggregate relative MSE: `1.042825`
- Best aggregate delta relative MSE: `0.042825`

### Rank Sweep

- rank `8`: aggregate relative MSE `1.042825`, delta `0.042825`
- rank `16`: aggregate relative MSE `2.578841`, delta `1.578841`
- rank `32`: aggregate relative MSE `1.532062`, delta `0.532062`
- rank `64`: aggregate relative MSE `1.450780`, delta `0.450780`
- rank `128`: aggregate relative MSE `1.443414`, delta `0.443414`
- rank `256`: aggregate relative MSE `1.443373`, delta `0.443373`
- rank `512`: aggregate relative MSE `1.443448`, delta `0.443448`

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

## eeg_clean_windows

- Best rank: `64`
- Best aggregate relative MSE: `0.895379`
- Best aggregate delta relative MSE: `-0.104621`

### Rank Sweep

- rank `8`: aggregate relative MSE `1.040652`, delta `0.040652`
- rank `16`: aggregate relative MSE `2.198092`, delta `1.198092`
- rank `32`: aggregate relative MSE `1.051314`, delta `0.051314`
- rank `64`: aggregate relative MSE `0.895379`, delta `-0.104621`
- rank `128`: aggregate relative MSE `0.901676`, delta `-0.098324`
- rank `256`: aggregate relative MSE `0.901673`, delta `-0.098327`
- rank `512`: aggregate relative MSE `0.901664`, delta `-0.098336`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000008`
- Null MSE: `0.000011`
- Relative MSE: `0.729509`
- Model MAE: `0.001681`
- Null MAE: `0.002000`
- Relative MAE: `0.840629`
- Model corr: `0.624248`
- Null corr: `0.755187`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000198`
- Null MSE: `0.000230`
- Relative MSE: `0.860302`
- Model MAE: `0.008737`
- Null MAE: `0.009129`
- Relative MAE: `0.957025`
- Model corr: `0.553973`
- Null corr: `0.672047`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.000011`
- Null MSE: `0.000010`
- Relative MSE: `1.096327`
- Model MAE: `0.002323`
- Null MAE: `0.002135`
- Relative MAE: `1.087916`
- Model corr: `0.633885`
- Null corr: `0.733926`
- Beats null MSE: `False`
