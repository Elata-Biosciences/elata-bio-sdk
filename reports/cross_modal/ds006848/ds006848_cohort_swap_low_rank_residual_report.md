# DS006848 Low-Rank Residual Baseline Report

- Config: `configs/cross_modal/ds006848_low_rank_residual_cohort_swap.toml`
- Feature branch: `eeg_clean_windows`
- Rank: `64`
- Ridge lambda: `1000.0`
- Calibration windows per eval subject: `32`
- Runtime seconds: `0.414`
- Peak memory MB: `33.309`

## Reference Low-Rank Baseline

- Reference config: `configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_swap.toml`
- Reference branch: `eeg_clean_windows`
- Reference rank: `64`
- Reference aggregate relative MSE: `0.868015`
- Reference aggregate delta relative MSE: `-0.131985`

## Residual Bias Correction

- Aggregate relative MSE: `1.366992`
- Aggregate delta relative MSE: `0.366992`
- Beats null aggregate relative MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000018`
- Null MSE: `0.000013`
- Relative MSE: `1.406709`
- Model MAE: `0.002809`
- Null MAE: `0.002346`
- Relative MAE: `1.197012`
- Model corr: `0.703115`
- Null corr: `0.741255`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000363`
- Null MSE: `0.000273`
- Relative MSE: `1.332087`
- Model MAE: `0.012493`
- Null MAE: `0.010766`
- Relative MAE: `1.160497`
- Model corr: `0.644156`
- Null corr: `0.678869`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.000017`
- Null MSE: `0.000013`
- Relative MSE: `1.362180`
- Model MAE: `0.002817`
- Null MAE: `0.002479`
- Relative MAE: `1.136096`
- Model corr: `0.646242`
- Null corr: `0.713620`
- Beats null MSE: `False`
