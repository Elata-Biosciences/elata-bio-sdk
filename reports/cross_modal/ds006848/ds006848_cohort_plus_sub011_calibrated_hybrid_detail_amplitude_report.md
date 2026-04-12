# DS006848 Calibrated Hybrid Detail Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_hybrid_detail_amplitude_cohort_plus_sub011.toml`
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
- Runtime seconds: `3.903`
- Peak memory MB: `387.245`

## Reference Low-Rank Baseline

- Reference config: `configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub011.toml`
- Reference branch: `eeg_clean_windows`
- Reference rank: `64`
- Reference aggregate relative MSE: `0.895379`
- Reference aggregate delta relative MSE: `-0.104621`

## Best Hybrid Candidate

- Best rank: `16`
- Aggregate relative MSE: `0.779698`
- Aggregate delta relative MSE: `-0.220302`
- Beats null aggregate relative MSE: `True`

## Rank Sweep

- rank `8`: aggregate relative MSE `0.894229`, delta `-0.105771`
- rank `16`: aggregate relative MSE `0.779698`, delta `-0.220302`
- rank `32`: aggregate relative MSE `0.900066`, delta `-0.099934`
- rank `64`: aggregate relative MSE `2.002885`, delta `1.002885`
- rank `128`: aggregate relative MSE `1.067090`, delta `0.067090`
- rank `256`: aggregate relative MSE `0.997578`, delta `-0.002422`
- rank `512`: aggregate relative MSE `0.817810`, delta `-0.182190`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000008`
- Null MSE: `0.000011`
- Relative MSE: `0.790309`
- Model MAE: `0.001962`
- Null MAE: `0.002000`
- Relative MAE: `0.981189`
- Model corr: `0.674443`
- Null corr: `0.755187`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000150`
- Null MSE: `0.000230`
- Relative MSE: `0.652715`
- Model MAE: `0.008382`
- Null MAE: `0.009129`
- Relative MAE: `0.918178`
- Model corr: `0.613673`
- Null corr: `0.672047`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.000009`
- Null MSE: `0.000010`
- Relative MSE: `0.896070`
- Model MAE: `0.002224`
- Null MAE: `0.002135`
- Relative MAE: `1.041699`
- Model corr: `0.690560`
- Null corr: `0.733926`
- Beats null MSE: `True`
