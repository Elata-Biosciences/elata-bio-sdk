# DS006848 Calibrated Low-Rank Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_low_rank_morphology_cohort_swap.toml`
- Ridge lambda: `1000.0`
- Candidate ranks: `8, 16, 32, 64, 128, 256, 512`
- Calibration windows per eval subject: `32`
- Runtime seconds: `20.872`
- Peak memory MB: `1723.143`

## Reference Linear Baseline

- Linear reference config: `configs/cross_modal/ds006848_calibrated_absolute_baseline_cohort_swap.toml`
- Linear best branch: `eeg_clean_windows`
- Linear best aggregate relative MSE: `0.923777`
- Linear best aggregate delta relative MSE: `-0.076223`

## Best Low-Rank Candidate

- Best branch: `eeg_clean_windows`
- Best rank: `64`
- Aggregate relative MSE: `0.919901`
- Aggregate delta relative MSE: `-0.080099`

## eeg_event_windows

- Best rank: `8`
- Best aggregate relative MSE: `1.013854`
- Best aggregate delta relative MSE: `0.013854`

### Rank Sweep

- rank `8`: aggregate relative MSE `1.013854`, delta `0.013854`
- rank `16`: aggregate relative MSE `1.956250`, delta `0.956250`
- rank `32`: aggregate relative MSE `2.060196`, delta `1.060196`
- rank `64`: aggregate relative MSE `1.764642`, delta `0.764642`
- rank `128`: aggregate relative MSE `1.888430`, delta `0.888430`
- rank `256`: aggregate relative MSE `1.888814`, delta `0.888814`
- rank `512`: aggregate relative MSE `1.889166`, delta `0.889166`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.031218`
- Null MSE: `0.028701`
- Relative MSE: `1.087706`
- Model MAE: `0.142255`
- Null MAE: `0.136411`
- Relative MAE: `1.042841`
- Model corr: `0.587256`
- Null corr: `0.524685`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000013`
- Null MSE: `0.000013`
- Relative MSE: `0.982418`
- Model MAE: `0.002598`
- Null MAE: `0.002346`
- Relative MAE: `1.107014`
- Model corr: `0.629885`
- Null corr: `0.741255`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000234`
- Null MSE: `0.000273`
- Relative MSE: `0.858584`
- Model MAE: `0.011450`
- Null MAE: `0.010766`
- Relative MAE: `1.063538`
- Model corr: `0.588140`
- Null corr: `0.678869`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.000016`
- Null MSE: `0.000013`
- Relative MSE: `1.219336`
- Model MAE: `0.003007`
- Null MAE: `0.002479`
- Relative MAE: `1.212855`
- Model corr: `0.639799`
- Null corr: `0.713620`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.027775`
- Null MSE: `0.026945`
- Relative MSE: `1.030810`
- Model MAE: `0.137300`
- Null MAE: `0.125625`
- Relative MAE: `1.092938`
- Model corr: `-0.016103`
- Null corr: `-0.011514`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.031926`
- Null MSE: `0.032640`
- Relative MSE: `0.978120`
- Model MAE: `0.143014`
- Null MAE: `0.134725`
- Relative MAE: `1.061532`
- Model corr: `0.093005`
- Null corr: `0.059196`
- Beats null MSE: `True`

## eeg_clean_windows

- Best rank: `64`
- Best aggregate relative MSE: `0.919901`
- Best aggregate delta relative MSE: `-0.080099`

### Rank Sweep

- rank `8`: aggregate relative MSE `1.012536`, delta `0.012536`
- rank `16`: aggregate relative MSE `1.676555`, delta `0.676555`
- rank `32`: aggregate relative MSE `1.034095`, delta `0.034095`
- rank `64`: aggregate relative MSE `0.919901`, delta `-0.080099`
- rank `128`: aggregate relative MSE `0.923762`, delta `-0.076238`
- rank `256`: aggregate relative MSE `0.923775`, delta `-0.076225`
- rank `512`: aggregate relative MSE `0.923775`, delta `-0.076225`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.057325`
- Null MSE: `0.028701`
- Relative MSE: `1.997311`
- Model MAE: `0.187736`
- Null MAE: `0.136411`
- Relative MAE: `1.376254`
- Model corr: `0.500685`
- Null corr: `0.524685`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000009`
- Null MSE: `0.000013`
- Relative MSE: `0.715812`
- Model MAE: `0.001875`
- Null MAE: `0.002346`
- Relative MAE: `0.799074`
- Model corr: `0.610351`
- Null corr: `0.741255`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000227`
- Null MSE: `0.000273`
- Relative MSE: `0.833635`
- Model MAE: `0.009457`
- Null MAE: `0.010766`
- Relative MAE: `0.878448`
- Model corr: `0.561750`
- Null corr: `0.678869`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.000013`
- Null MSE: `0.000013`
- Relative MSE: `1.054599`
- Model MAE: `0.002506`
- Null MAE: `0.002479`
- Relative MAE: `1.010864`
- Model corr: `0.618139`
- Null corr: `0.713620`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.024825`
- Null MSE: `0.026945`
- Relative MSE: `0.921335`
- Model MAE: `0.108620`
- Null MAE: `0.125625`
- Relative MAE: `0.864635`
- Model corr: `-0.062458`
- Null corr: `-0.011514`
- Beats null MSE: `True`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.035059`
- Null MSE: `0.032640`
- Relative MSE: `1.074123`
- Model MAE: `0.136642`
- Null MAE: `0.134725`
- Relative MAE: `1.014232`
- Model corr: `0.031215`
- Null corr: `0.059196`
- Beats null MSE: `False`
