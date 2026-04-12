# DS006848 Low-Rank Residual Baseline Report

- Config: `configs/cross_modal/ds006848_low_rank_residual_cohort_plus_sub025.toml`
- Feature branch: `eeg_clean_windows`
- Rank: `64`
- Ridge lambda: `1000.0`
- Calibration windows per eval subject: `32`
- Runtime seconds: `0.409`
- Peak memory MB: `33.472`

## Reference Low-Rank Baseline

- Reference config: `configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub025.toml`
- Reference branch: `eeg_clean_windows`
- Reference rank: `64`
- Reference aggregate relative MSE: `0.869098`
- Reference aggregate delta relative MSE: `-0.130902`

## Residual Bias Correction

- Aggregate relative MSE: `1.367358`
- Aggregate delta relative MSE: `0.367358`
- Beats null aggregate relative MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000015`
- Null MSE: `0.000010`
- Relative MSE: `1.407923`
- Model MAE: `0.002327`
- Null MAE: `0.001929`
- Relative MAE: `1.206472`
- Model corr: `0.749979`
- Null corr: `0.784909`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000291`
- Null MSE: `0.000219`
- Relative MSE: `1.332247`
- Model MAE: `0.010312`
- Null MAE: `0.008856`
- Relative MAE: `1.164419`
- Model corr: `0.709968`
- Null corr: `0.738639`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.000014`
- Null MSE: `0.000010`
- Relative MSE: `1.361905`
- Model MAE: `0.002332`
- Null MAE: `0.002047`
- Relative MAE: `1.139298`
- Model corr: `0.715021`
- Null corr: `0.770368`
- Beats null MSE: `False`
