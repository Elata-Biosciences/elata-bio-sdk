# DS006848 Calibrated Haar Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_haar_amplitude_cohort_swap.toml`
- Source branch: `eeg_clean_windows`
- Feature view: `eeg_clean_haar_windows`
- Haar levels: `7`
- Ridge lambda: `1000.0`
- Candidate ranks: `8, 16, 32, 64, 128, 256, 512`
- Calibration windows per eval subject: `32`
- Runtime seconds: `3.483`
- Peak memory MB: `315.125`

## Reference Low-Rank Baseline

- Reference config: `configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_swap.toml`
- Reference branch: `eeg_clean_windows`
- Reference rank: `64`
- Reference aggregate relative MSE: `0.868015`
- Reference aggregate delta relative MSE: `-0.131985`

## Best Haar Candidate

- Best rank: `8`
- Aggregate relative MSE: `1.016802`
- Aggregate delta relative MSE: `0.016802`
- Beats null aggregate relative MSE: `False`

## Rank Sweep

- rank `8`: aggregate relative MSE `1.016802`, delta `0.016802`
- rank `16`: aggregate relative MSE `1.086184`, delta `0.086184`
- rank `32`: aggregate relative MSE `1.055738`, delta `0.055738`
- rank `64`: aggregate relative MSE `2.461227`, delta `1.461227`
- rank `128`: aggregate relative MSE `2.203256`, delta `1.203256`
- rank `256`: aggregate relative MSE `3.222793`, delta `2.222793`
- rank `512`: aggregate relative MSE `32.412629`, delta `31.412629`

### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000013`
- Null MSE: `0.000013`
- Relative MSE: `1.028735`
- Model MAE: `0.002360`
- Null MAE: `0.002346`
- Relative MAE: `1.005734`
- Model corr: `0.735018`
- Null corr: `0.741255`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000272`
- Null MSE: `0.000273`
- Relative MSE: `0.998200`
- Model MAE: `0.010759`
- Null MAE: `0.010766`
- Relative MAE: `0.999344`
- Model corr: `0.678772`
- Null corr: `0.678869`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.000013`
- Null MSE: `0.000013`
- Relative MSE: `1.023472`
- Model MAE: `0.002499`
- Null MAE: `0.002479`
- Relative MAE: `1.007891`
- Model corr: `0.710602`
- Null corr: `0.713620`
- Beats null MSE: `False`
