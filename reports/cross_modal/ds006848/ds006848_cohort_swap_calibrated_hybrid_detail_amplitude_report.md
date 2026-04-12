# DS006848 Calibrated Hybrid Detail Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_swap.toml`
- Source branch: `eeg_clean_windows`
- Feature view: `eeg_clean_hybrid_detail_windows`
- Haar levels: `7`
- Detail statistics: `rms, max_abs`
- Include final approximation: `True`
- Raw feature dim: `8064`
- Detail feature dim: `945`
- Combined feature dim: `9009`
- Ridge lambda: `1000.0`
- Candidate ranks: `8, 16, 32, 64, 128, 256, 512`
- Calibration windows per eval subject: `32`
- Runtime seconds: `3.695`
- Peak memory MB: `352.053`

## Reference Low-Rank Baseline

- Reference config: `configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_swap.toml`
- Reference branch: `eeg_clean_windows`
- Reference rank: `64`
- Reference aggregate relative MSE: `0.868015`
- Reference aggregate delta relative MSE: `-0.131985`

## Best Hybrid Candidate

- Best rank: `512`
- Aggregate relative MSE: `0.763147`
- Aggregate delta relative MSE: `-0.236853`
- Beats null aggregate relative MSE: `True`

## Rank Sweep

- rank `8`: aggregate relative MSE `0.891975`, delta `-0.108025`
- rank `16`: aggregate relative MSE `0.765861`, delta `-0.234139`
- rank `32`: aggregate relative MSE `0.878445`, delta `-0.121555`
- rank `64`: aggregate relative MSE `1.937923`, delta `0.937923`
- rank `128`: aggregate relative MSE `1.027579`, delta `0.027579`
- rank `256`: aggregate relative MSE `0.947298`, delta `-0.052702`
- rank `512`: aggregate relative MSE `0.763147`, delta `-0.236853`

### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000008`
- Null MSE: `0.000013`
- Relative MSE: `0.620396`
- Model MAE: `0.001965`
- Null MAE: `0.002346`
- Relative MAE: `0.837552`
- Model corr: `0.648997`
- Null corr: `0.741255`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000195`
- Null MSE: `0.000273`
- Relative MSE: `0.715622`
- Model MAE: `0.009631`
- Null MAE: `0.010766`
- Relative MAE: `0.894641`
- Model corr: `0.576811`
- Null corr: `0.678869`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.000012`
- Null MSE: `0.000013`
- Relative MSE: `0.953423`
- Model MAE: `0.002566`
- Null MAE: `0.002479`
- Relative MAE: `1.034980`
- Model corr: `0.624511`
- Null corr: `0.713620`
- Beats null MSE: `True`
