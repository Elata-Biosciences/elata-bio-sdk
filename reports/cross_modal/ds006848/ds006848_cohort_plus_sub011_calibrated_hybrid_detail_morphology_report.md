# DS006848 Calibrated Hybrid Detail Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_hybrid_detail_morphology_cohort_plus_sub011.toml`
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
- Runtime seconds: `6.528`
- Peak memory MB: `387.245`

## Reference Low-Rank Baseline

- Reference config: `configs/cross_modal/ds006848_calibrated_low_rank_morphology_cohort_plus_sub011.toml`
- Reference branch: `eeg_clean_windows`
- Reference rank: `8`
- Reference aggregate relative MSE: `1.096923`
- Reference aggregate delta relative MSE: `0.096923`

## Best Hybrid Candidate

- Best rank: `16`
- Aggregate relative MSE: `0.833693`
- Aggregate delta relative MSE: `-0.166307`
- Beats null aggregate relative MSE: `True`

## Rank Sweep

- rank `8`: aggregate relative MSE `1.004828`, delta `0.004828`
- rank `16`: aggregate relative MSE `0.833693`, delta `-0.166307`
- rank `32`: aggregate relative MSE `0.951589`, delta `-0.048411`
- rank `64`: aggregate relative MSE `1.832015`, delta `0.832015`
- rank `128`: aggregate relative MSE `2.300423`, delta `1.300423`
- rank `256`: aggregate relative MSE `1.958842`, delta `0.958842`
- rank `512`: aggregate relative MSE `1.871824`, delta `0.871824`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.045689`
- Null MSE: `0.031243`
- Relative MSE: `1.462377`
- Model MAE: `0.171047`
- Null MAE: `0.142756`
- Relative MAE: `1.198179`
- Model corr: `0.533475`
- Null corr: `0.456390`
- Beats null MSE: `False`

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

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.025753`
- Null MSE: `0.028441`
- Relative MSE: `0.905468`
- Model MAE: `0.110348`
- Null MAE: `0.132811`
- Relative MAE: `0.830863`
- Model corr: `0.009111`
- Null corr: `-0.011507`
- Beats null MSE: `True`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.030628`
- Null MSE: `0.033151`
- Relative MSE: `0.923901`
- Model MAE: `0.131869`
- Null MAE: `0.139312`
- Relative MAE: `0.946568`
- Model corr: `0.103881`
- Null corr: `0.046480`
- Beats null MSE: `True`
