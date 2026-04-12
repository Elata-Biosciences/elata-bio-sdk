# DS006848 Calibrated Detail-Summary Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_detail_summary_amplitude_cohort_swap.toml`
- Source branch: `eeg_clean_windows`
- Feature view: `eeg_clean_detail_summary_windows`
- Haar levels: `7`
- Detail statistics: `rms, max_abs`
- Include final approximation: `True`
- Feature dimension: `945`
- Ridge lambda: `1000.0`
- Candidate ranks: `8, 16, 32, 64, 128, 256, 512`
- Calibration windows per eval subject: `32`
- Runtime seconds: `1.290`
- Peak memory MB: `77.265`

## Reference Low-Rank Baseline

- Reference config: `configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_swap.toml`
- Reference branch: `eeg_clean_windows`
- Reference rank: `64`
- Reference aggregate relative MSE: `0.868015`
- Reference aggregate delta relative MSE: `-0.131985`

## Best Detail-Summary Candidate

- Best rank: `256`
- Aggregate relative MSE: `0.990187`
- Aggregate delta relative MSE: `-0.009813`
- Beats null aggregate relative MSE: `True`

## Rank Sweep

- rank `8`: aggregate relative MSE `1.006949`, delta `0.006949`
- rank `16`: aggregate relative MSE `1.059344`, delta `0.059344`
- rank `32`: aggregate relative MSE `1.058704`, delta `0.058704`
- rank `64`: aggregate relative MSE `1.034420`, delta `0.034420`
- rank `128`: aggregate relative MSE `1.012061`, delta `0.012061`
- rank `256`: aggregate relative MSE `0.990187`, delta `-0.009813`
- rank `512`: aggregate relative MSE `1.003043`, delta `0.003043`

### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000012`
- Null MSE: `0.000013`
- Relative MSE: `0.943934`
- Model MAE: `0.002222`
- Null MAE: `0.002346`
- Relative MAE: `0.946851`
- Model corr: `0.721135`
- Null corr: `0.741255`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000274`
- Null MSE: `0.000273`
- Relative MSE: `1.006237`
- Model MAE: `0.010676`
- Null MAE: `0.010766`
- Relative MAE: `0.991712`
- Model corr: `0.662461`
- Null corr: `0.678869`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.000013`
- Null MSE: `0.000013`
- Relative MSE: `1.020391`
- Model MAE: `0.002472`
- Null MAE: `0.002479`
- Relative MAE: `0.996951`
- Model corr: `0.707993`
- Null corr: `0.713620`
- Beats null MSE: `False`
