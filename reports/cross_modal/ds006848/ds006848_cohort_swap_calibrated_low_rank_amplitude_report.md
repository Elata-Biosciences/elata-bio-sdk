# DS006848 Calibrated Low-Rank Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_swap.toml`
- Ridge lambda: `1000.0`
- Candidate ranks: `8, 16, 32, 64, 128, 256, 512`
- Calibration windows per eval subject: `32`
- Runtime seconds: `18.706`
- Peak memory MB: `1723.143`

## Reference Linear Baseline

- Linear reference config: `configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_swap.toml`
- Linear best branch: `eeg_clean_windows`
- Linear best aggregate relative MSE: `0.874252`
- Linear best aggregate delta relative MSE: `-0.125748`

## Best Low-Rank Candidate

- Best branch: `eeg_clean_windows`
- Best rank: `64`
- Aggregate relative MSE: `0.868015`
- Aggregate delta relative MSE: `-0.131985`

## eeg_event_windows

- Best rank: `8`
- Best aggregate relative MSE: `1.020113`
- Best aggregate delta relative MSE: `0.020113`

### Rank Sweep

- rank `8`: aggregate relative MSE `1.020113`, delta `0.020113`
- rank `16`: aggregate relative MSE `2.461290`, delta `1.461290`
- rank `32`: aggregate relative MSE `1.539760`, delta `0.539760`
- rank `64`: aggregate relative MSE `1.453212`, delta `0.453212`
- rank `128`: aggregate relative MSE `1.445519`, delta `0.445519`
- rank `256`: aggregate relative MSE `1.445484`, delta `0.445484`
- rank `512`: aggregate relative MSE `1.445564`, delta `0.445564`

### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000013`
- Null MSE: `0.000013`
- Relative MSE: `0.982418`
- Model MAE: `0.002598`
- Null MAE: `0.002346`
- Relative MAE: `1.107014`
- Model corr: `0.629885`
- Null corr: `0.741255`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000234`
- Null MSE: `0.000273`
- Relative MSE: `0.858584`
- Model MAE: `0.011450`
- Null MAE: `0.010766`
- Relative MAE: `1.063538`
- Model corr: `0.588140`
- Null corr: `0.678869`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.000016`
- Null MSE: `0.000013`
- Relative MSE: `1.219336`
- Model MAE: `0.003007`
- Null MAE: `0.002479`
- Relative MAE: `1.212855`
- Model corr: `0.639799`
- Null corr: `0.713620`
- Beats null MSE: `False`

## eeg_clean_windows

- Best rank: `64`
- Best aggregate relative MSE: `0.868015`
- Best aggregate delta relative MSE: `-0.131985`

### Rank Sweep

- rank `8`: aggregate relative MSE `1.018445`, delta `0.018445`
- rank `16`: aggregate relative MSE `2.109332`, delta `1.109332`
- rank `32`: aggregate relative MSE `1.021219`, delta `0.021219`
- rank `64`: aggregate relative MSE `0.868015`, delta `-0.131985`
- rank `128`: aggregate relative MSE `0.874250`, delta `-0.125750`
- rank `256`: aggregate relative MSE `0.874245`, delta `-0.125755`
- rank `512`: aggregate relative MSE `0.874237`, delta `-0.125763`

### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000009`
- Null MSE: `0.000013`
- Relative MSE: `0.715812`
- Model MAE: `0.001875`
- Null MAE: `0.002346`
- Relative MAE: `0.799074`
- Model corr: `0.610351`
- Null corr: `0.741255`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000227`
- Null MSE: `0.000273`
- Relative MSE: `0.833635`
- Model MAE: `0.009457`
- Null MAE: `0.010766`
- Relative MAE: `0.878448`
- Model corr: `0.561750`
- Null corr: `0.678869`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.000013`
- Null MSE: `0.000013`
- Relative MSE: `1.054599`
- Model MAE: `0.002506`
- Null MAE: `0.002479`
- Relative MAE: `1.010864`
- Model corr: `0.618139`
- Null corr: `0.713620`
- Beats null MSE: `False`
