# DS006848 Calibrated Hybrid Detail Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_hybrid_detail_morphology_cohort_swap.toml`
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
- Runtime seconds: `6.145`
- Peak memory MB: `352.053`

## Reference Low-Rank Baseline

- Reference config: `configs/cross_modal/ds006848_calibrated_low_rank_morphology_cohort_swap.toml`
- Reference branch: `eeg_clean_windows`
- Reference rank: `64`
- Reference aggregate relative MSE: `0.919901`
- Reference aggregate delta relative MSE: `-0.080099`

## Best Hybrid Candidate

- Best rank: `16`
- Aggregate relative MSE: `0.809535`
- Aggregate delta relative MSE: `-0.190465`
- Beats null aggregate relative MSE: `True`

## Rank Sweep

- rank `8`: aggregate relative MSE `1.008281`, delta `0.008281`
- rank `16`: aggregate relative MSE `0.809535`, delta `-0.190465`
- rank `32`: aggregate relative MSE `0.936121`, delta `-0.063879`
- rank `64`: aggregate relative MSE `1.593919`, delta `0.593919`
- rank `128`: aggregate relative MSE `1.032267`, delta `0.032267`
- rank `256`: aggregate relative MSE `0.953570`, delta `-0.046430`
- rank `512`: aggregate relative MSE `0.905157`, delta `-0.094843`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.038562`
- Null MSE: `0.028701`
- Relative MSE: `1.343566`
- Model MAE: `0.160101`
- Null MAE: `0.136411`
- Relative MAE: `1.173670`
- Model corr: `0.605477`
- Null corr: `0.524685`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000010`
- Null MSE: `0.000013`
- Relative MSE: `0.781646`
- Model MAE: `0.002250`
- Null MAE: `0.002346`
- Relative MAE: `0.959063`
- Model corr: `0.650962`
- Null corr: `0.741255`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000172`
- Null MSE: `0.000273`
- Relative MSE: `0.631769`
- Model MAE: `0.009557`
- Null MAE: `0.010766`
- Relative MAE: `0.887701`
- Model corr: `0.611180`
- Null corr: `0.678869`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.000011`
- Null MSE: `0.000013`
- Relative MSE: `0.884169`
- Model MAE: `0.002526`
- Null MAE: `0.002479`
- Relative MAE: `1.018971`
- Model corr: `0.663657`
- Null corr: `0.713620`
- Beats null MSE: `True`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.022684`
- Null MSE: `0.026945`
- Relative MSE: `0.841868`
- Model MAE: `0.101226`
- Null MAE: `0.125625`
- Relative MAE: `0.805777`
- Model corr: `-0.017446`
- Null corr: `-0.011514`
- Beats null MSE: `True`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.029644`
- Null MSE: `0.032640`
- Relative MSE: `0.908224`
- Model MAE: `0.125454`
- Null MAE: `0.134725`
- Relative MAE: `0.931192`
- Model corr: `0.085021`
- Null corr: `0.059196`
- Beats null MSE: `True`
