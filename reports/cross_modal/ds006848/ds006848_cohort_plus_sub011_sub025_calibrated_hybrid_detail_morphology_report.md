# DS006848 Calibrated Hybrid Detail Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_hybrid_detail_morphology_cohort_plus_sub011_sub025.toml`
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
- Runtime seconds: `4.791`
- Peak memory MB: `422.436`

## Reference Low-Rank Baseline

- Reference config: `configs/cross_modal/ds006848_calibrated_low_rank_morphology_cohort_plus_sub011_sub025.toml`
- Reference branch: `eeg_clean_windows`
- Reference rank: `8`
- Reference aggregate relative MSE: `1.086335`
- Reference aggregate delta relative MSE: `0.086335`

## Best Hybrid Candidate

- Best rank: `16`
- Aggregate relative MSE: `0.865461`
- Aggregate delta relative MSE: `-0.134539`
- Beats null aggregate relative MSE: `True`

## Rank Sweep

- rank `8`: aggregate relative MSE `0.988931`, delta `-0.011069`
- rank `16`: aggregate relative MSE `0.865461`, delta `-0.134539`
- rank `32`: aggregate relative MSE `0.966560`, delta `-0.033440`
- rank `64`: aggregate relative MSE `1.822324`, delta `0.822324`
- rank `128`: aggregate relative MSE `2.040466`, delta `1.040466`
- rank `256`: aggregate relative MSE `1.780806`, delta `0.780806`
- rank `512`: aggregate relative MSE `1.706201`, delta `0.706201`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.046265`
- Null MSE: `0.033628`
- Relative MSE: `1.375783`
- Model MAE: `0.173145`
- Null MAE: `0.148190`
- Relative MAE: `1.168405`
- Model corr: `0.597440`
- Null corr: `0.554616`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.000007`
- Null MSE: `0.000009`
- Relative MSE: `0.790689`
- Model MAE: `0.001676`
- Null MAE: `0.001710`
- Relative MAE: `0.980368`
- Model corr: `0.718618`
- Null corr: `0.784475`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.000125`
- Null MSE: `0.000192`
- Relative MSE: `0.653807`
- Model MAE: `0.007181`
- Null MAE: `0.007811`
- Relative MAE: `0.919335`
- Model corr: `0.676321`
- Null corr: `0.715859`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.000008`
- Null MSE: `0.000009`
- Relative MSE: `0.896485`
- Model MAE: `0.001908`
- Null MAE: `0.001832`
- Relative MAE: `1.041902`
- Model corr: `0.739170`
- Null corr: `0.772992`
- Beats null MSE: `True`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.030625`
- Null MSE: `0.030474`
- Relative MSE: `1.004927`
- Model MAE: `0.123171`
- Null MAE: `0.139431`
- Relative MAE: `0.883383`
- Model corr: `0.076368`
- Null corr: `0.165070`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.035663`
- Null MSE: `0.036339`
- Relative MSE: `0.981397`
- Model MAE: `0.143512`
- Null MAE: `0.147682`
- Relative MAE: `0.971759`
- Model corr: `0.122322`
- Null corr: `0.177149`
- Beats null MSE: `True`
