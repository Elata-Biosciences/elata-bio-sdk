# DS006848 Calibrated RBF Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_rbf_amplitude_cohort_swap.toml`
- Kernel: `rbf_median`
- Ridge lambda: `1000.0`
- Gamma scale: `1.000000`
- Calibration windows per eval subject: `32`
- Runtime seconds: `10.199`
- Peak memory MB: `1939.748`

## Reference Linear Baseline

- Linear reference config: `configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_swap.toml`
- Linear best branch: `eeg_clean_windows`
- Linear best aggregate relative MSE: `0.874252`
- Linear best aggregate delta relative MSE: `-0.125748`

## Calibrated Absolute

- Best branch: `eeg_event_windows`
- Aggregate model relative MSE: `0.998595`
- Aggregate delta relative MSE: `-0.001405`
- Beats null aggregate relative MSE: `True`

### eeg_event_windows

- Aggregate model relative MSE: `0.998595`
- Aggregate delta relative MSE: `-0.001405`
- Beats null aggregate relative MSE: `True`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Gamma: `0.00001381`
- Median squared distance: `72405.79120154`
- Model MSE: `0.000013`
- Null MSE: `0.000013`
- Relative MSE: `0.998467`
- Model MAE: `0.002344`
- Null MAE: `0.002346`
- Relative MAE: `0.998912`
- Model corr: `0.740937`
- Null corr: `0.741255`
- Beats null MSE: `True`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Gamma: `0.00001381`
- Median squared distance: `72405.79120154`
- Model MSE: `0.000273`
- Null MSE: `0.000273`
- Relative MSE: `0.999473`
- Model MAE: `0.010762`
- Null MAE: `0.010766`
- Relative MAE: `0.999625`
- Model corr: `0.678617`
- Null corr: `0.678869`
- Beats null MSE: `True`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Gamma: `0.00001382`
- Median squared distance: `72349.85176646`
- Model MSE: `0.000013`
- Null MSE: `0.000013`
- Relative MSE: `0.997845`
- Model MAE: `0.002477`
- Null MAE: `0.002479`
- Relative MAE: `0.998914`
- Model corr: `0.713548`
- Null corr: `0.713620`
- Beats null MSE: `True`

### eeg_clean_windows

- Aggregate model relative MSE: `0.998595`
- Aggregate delta relative MSE: `-0.001405`
- Beats null aggregate relative MSE: `True`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Gamma: `0.00005395`
- Median squared distance: `18535.88062545`
- Model MSE: `0.000013`
- Null MSE: `0.000013`
- Relative MSE: `0.998467`
- Model MAE: `0.002344`
- Null MAE: `0.002346`
- Relative MAE: `0.998912`
- Model corr: `0.740937`
- Null corr: `0.741255`
- Beats null MSE: `True`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Gamma: `0.00005395`
- Median squared distance: `18535.88062545`
- Model MSE: `0.000273`
- Null MSE: `0.000273`
- Relative MSE: `0.999473`
- Model MAE: `0.010762`
- Null MAE: `0.010766`
- Relative MAE: `0.999625`
- Model corr: `0.678617`
- Null corr: `0.678869`
- Beats null MSE: `True`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Gamma: `0.00005399`
- Median squared distance: `18521.59955238`
- Model MSE: `0.000013`
- Null MSE: `0.000013`
- Relative MSE: `0.997845`
- Model MAE: `0.002477`
- Null MAE: `0.002479`
- Relative MAE: `0.998914`
- Model corr: `0.713548`
- Null corr: `0.713620`
- Beats null MSE: `True`
