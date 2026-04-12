# DS006848 Calibrated Haar Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_haar_amplitude_cohort_plus_sub025.toml`
- Source branch: `eeg_clean_windows`
- Feature view: `eeg_clean_haar_windows`
- Haar levels: `7`
- Ridge lambda: `1000.0`
- Candidate ranks: `8, 16, 32, 64, 128, 256, 512`
- Calibration windows per eval subject: `32`
- Runtime seconds: `3.770`
- Peak memory MB: `346.625`

## Reference Low-Rank Baseline

- Reference config: `configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub025.toml`
- Reference branch: `eeg_clean_windows`
- Reference rank: `64`
- Reference aggregate relative MSE: `0.869098`
- Reference aggregate delta relative MSE: `-0.130902`

## Best Haar Candidate

- Best rank: `8`
- Aggregate relative MSE: `1.016743`
- Aggregate delta relative MSE: `0.016743`
- Beats null aggregate relative MSE: `False`

## Rank Sweep

- rank `8`: aggregate relative MSE `1.016743`, delta `0.016743`
- rank `16`: aggregate relative MSE `1.085968`, delta `0.085968`
- rank `32`: aggregate relative MSE `1.055615`, delta `0.055615`
- rank `64`: aggregate relative MSE `2.457542`, delta `1.457542`
- rank `128`: aggregate relative MSE `2.200222`, delta `1.200222`
- rank `256`: aggregate relative MSE `3.217252`, delta `2.217252`
- rank `512`: aggregate relative MSE `32.325572`, delta `31.325572`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000011`
- Null MSE: `0.000010`
- Relative MSE: `1.028684`
- Model MAE: `0.001940`
- Null MAE: `0.001929`
- Relative MAE: `1.005667`
- Model corr: `0.779586`
- Null corr: `0.784909`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000218`
- Null MSE: `0.000219`
- Relative MSE: `0.998152`
- Model MAE: `0.008846`
- Null MAE: `0.008856`
- Relative MAE: `0.998825`
- Model corr: `0.738554`
- Null corr: `0.738639`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.000011`
- Null MSE: `0.000010`
- Relative MSE: `1.023395`
- Model MAE: `0.002062`
- Null MAE: `0.002047`
- Relative MAE: `1.007629`
- Model corr: `0.767906`
- Null corr: `0.770368`
- Beats null MSE: `False`
