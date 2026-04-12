# DS006848 Calibrated Hybrid Detail Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_plus_sub025.toml`
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
- Runtime seconds: `3.775`
- Peak memory MB: `387.245`

## Reference Low-Rank Baseline

- Reference config: `configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub025.toml`
- Reference branch: `eeg_clean_windows`
- Reference rank: `64`
- Reference aggregate relative MSE: `0.869098`
- Reference aggregate delta relative MSE: `-0.130902`

## Best Hybrid Candidate

- Best rank: `512`
- Aggregate relative MSE: `0.765794`
- Aggregate delta relative MSE: `-0.234206`
- Beats null aggregate relative MSE: `True`

## Rank Sweep

- rank `8`: aggregate relative MSE `0.892988`, delta `-0.107012`
- rank `16`: aggregate relative MSE `0.766548`, delta `-0.233452`
- rank `32`: aggregate relative MSE `0.880193`, delta `-0.119807`
- rank `64`: aggregate relative MSE `1.938342`, delta `0.938342`
- rank `128`: aggregate relative MSE `1.030185`, delta `0.030185`
- rank `256`: aggregate relative MSE `0.949631`, delta `-0.050369`
- rank `512`: aggregate relative MSE `0.765794`, delta `-0.234206`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000006`
- Null MSE: `0.000010`
- Relative MSE: `0.622614`
- Model MAE: `0.001645`
- Null MAE: `0.001929`
- Relative MAE: `0.852685`
- Model corr: `0.713019`
- Null corr: `0.784909`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000157`
- Null MSE: `0.000219`
- Relative MSE: `0.717101`
- Model MAE: `0.008023`
- Null MAE: `0.008856`
- Relative MAE: `0.905915`
- Model corr: `0.663029`
- Null corr: `0.738639`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.000010`
- Null MSE: `0.000010`
- Relative MSE: `0.957668`
- Model MAE: `0.002165`
- Null MAE: `0.002047`
- Relative MAE: `1.057745`
- Model corr: `0.702291`
- Null corr: `0.770368`
- Beats null MSE: `True`
