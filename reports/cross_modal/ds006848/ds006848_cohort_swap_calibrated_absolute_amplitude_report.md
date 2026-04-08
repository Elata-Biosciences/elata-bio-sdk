# DS006848 Calibrated Absolute Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_swap.toml`
- Ridge lambda: `1000.0`
- Calibration windows per eval subject: `32`
- Runtime seconds: `10.216`
- Peak memory MB: `1723.589`

## Reference

- Zero-shot reference config: `configs/cross_modal/ds006848_morphology_baseline_cohort_swap.toml`
- Zero-shot best branch by aggregate relative MSE: `eeg_clean_windows`
- Zero-shot best aggregate relative MSE: `1.581758`

## oracle_absolute

- Best branch: `eeg_clean_windows`
- Aggregate model relative MSE: `2.591739`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `1.591739`
- Beats null aggregate relative MSE: `False`

### eeg_event_windows

- Aggregate model relative MSE: `8.421992`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `7.421992`
- Beats null aggregate relative MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `0.000064`
- Null MSE: `0.000005`
- Relative MSE: `12.666169`
- Model MAE: `0.006226`
- Null MAE: `0.001450`
- Relative MAE: `4.294415`
- Model corr: `-0.430896`
- Null corr: `0.773407`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `0.000619`
- Null MSE: `0.000082`
- Relative MSE: `7.521828`
- Model MAE: `0.019331`
- Null MAE: `0.005961`
- Relative MAE: `3.242855`
- Model corr: `-0.089901`
- Null corr: `0.730715`
- Beats null MSE: `False`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `0.000036`
- Null MSE: `0.000007`
- Relative MSE: `5.077980`
- Model MAE: `0.004890`
- Null MAE: `0.001722`
- Relative MAE: `2.839826`
- Model corr: `0.394189`
- Null corr: `0.731718`
- Beats null MSE: `False`

### eeg_clean_windows

- Aggregate model relative MSE: `2.591739`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `1.591739`
- Beats null aggregate relative MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `0.000018`
- Null MSE: `0.000005`
- Relative MSE: `3.462742`
- Model MAE: `0.002547`
- Null MAE: `0.001450`
- Relative MAE: `1.756579`
- Model corr: `0.183004`
- Null corr: `0.773407`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `0.000199`
- Null MSE: `0.000082`
- Relative MSE: `2.424573`
- Model MAE: `0.008862`
- Null MAE: `0.005961`
- Relative MAE: `1.486694`
- Model corr: `0.310758`
- Null corr: `0.730715`
- Beats null MSE: `False`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `0.000013`
- Null MSE: `0.000007`
- Relative MSE: `1.887903`
- Model MAE: `0.002268`
- Null MAE: `0.001722`
- Relative MAE: `1.317325`
- Model corr: `0.504900`
- Null corr: `0.731718`
- Beats null MSE: `False`

## calibrated_absolute

- Best branch: `eeg_clean_windows`
- Aggregate model relative MSE: `0.874252`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `-0.125748`
- Beats null aggregate relative MSE: `True`

### eeg_event_windows

- Aggregate model relative MSE: `1.445565`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `0.445565`
- Beats null aggregate relative MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000023`
- Null MSE: `0.000013`
- Relative MSE: `1.785874`
- Model MAE: `0.004094`
- Null MAE: `0.002346`
- Relative MAE: `1.744749`
- Model corr: `0.468857`
- Null corr: `0.741255`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000242`
- Null MSE: `0.000273`
- Relative MSE: `0.887103`
- Model MAE: `0.012858`
- Null MAE: `0.010766`
- Relative MAE: `1.194327`
- Model corr: `0.545419`
- Null corr: `0.678869`
- Beats null MSE: `True`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.000021`
- Null MSE: `0.000013`
- Relative MSE: `1.663718`
- Model MAE: `0.003894`
- Null MAE: `0.002479`
- Relative MAE: `1.570818`
- Model corr: `0.558932`
- Null corr: `0.713620`
- Beats null MSE: `False`

### eeg_clean_windows

- Aggregate model relative MSE: `0.874252`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `-0.125748`
- Beats null aggregate relative MSE: `True`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000009`
- Null MSE: `0.000013`
- Relative MSE: `0.717525`
- Model MAE: `0.001879`
- Null MAE: `0.002346`
- Relative MAE: `0.800920`
- Model corr: `0.611953`
- Null corr: `0.741255`
- Beats null MSE: `True`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.000229`
- Null MSE: `0.000273`
- Relative MSE: `0.840521`
- Model MAE: `0.009494`
- Null MAE: `0.010766`
- Relative MAE: `0.881918`
- Model corr: `0.563957`
- Null corr: `0.678869`
- Beats null MSE: `True`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.000014`
- Null MSE: `0.000013`
- Relative MSE: `1.064710`
- Model MAE: `0.002519`
- Null MAE: `0.002479`
- Relative MAE: `1.015899`
- Model corr: `0.619139`
- Null corr: `0.713620`
- Beats null MSE: `False`
