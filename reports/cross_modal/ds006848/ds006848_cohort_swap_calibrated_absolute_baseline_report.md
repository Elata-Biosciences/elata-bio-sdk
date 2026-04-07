# DS006848 Calibrated Absolute Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_absolute_baseline_cohort_swap.toml`
- Ridge lambda: `1000.0`
- Calibration windows per eval subject: `32`
- Runtime seconds: `13.806`
- Peak memory MB: `1723.600`

## Reference

- Zero-shot reference config: `configs/cross_modal/ds006848_morphology_baseline_cohort_swap.toml`
- Zero-shot best branch by aggregate relative MSE: `eeg_clean_windows`
- Zero-shot best aggregate relative MSE: `1.649413`

## oracle_absolute

- Best branch: `eeg_clean_windows`
- Aggregate model relative MSE: `2.179518`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `1.179518`
- Beats null aggregate relative MSE: `False`

### eeg_event_windows

- Aggregate model relative MSE: `6.280293`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `5.280293`
- Beats null aggregate relative MSE: `False`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `0.099523`
- Null MSE: `0.017342`
- Relative MSE: `5.738741`
- Model MAE: `0.251969`
- Null MAE: `0.106591`
- Relative MAE: `2.363875`
- Model corr: `0.478605`
- Null corr: `0.608234`
- Beats null MSE: `False`

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

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `0.039815`
- Null MSE: `0.019508`
- Relative MSE: `2.041000`
- Model MAE: `0.157729`
- Null MAE: `0.098415`
- Relative MAE: `1.602688`
- Model corr: `0.019594`
- Null corr: `0.066190`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `0.093605`
- Null MSE: `0.022861`
- Relative MSE: `4.094487`
- Model MAE: `0.261493`
- Null MAE: `0.104293`
- Relative MAE: `2.507291`
- Model corr: `0.142191`
- Null corr: `0.161273`
- Beats null MSE: `False`

### eeg_clean_windows

- Aggregate model relative MSE: `2.179518`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `1.179518`
- Beats null aggregate relative MSE: `False`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1024`
- Model MSE: `0.039654`
- Null MSE: `0.017342`
- Relative MSE: `2.286553`
- Model MAE: `0.150761`
- Null MAE: `0.106591`
- Relative MAE: `1.414388`
- Model corr: `0.564101`
- Null corr: `0.608234`
- Beats null MSE: `False`

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

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `0.037217`
- Null MSE: `0.019508`
- Relative MSE: `1.907843`
- Model MAE: `0.144171`
- Null MAE: `0.098415`
- Relative MAE: `1.464924`
- Model corr: `-0.074293`
- Null corr: `0.066190`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1020`
- Model MSE: `0.027766`
- Null MSE: `0.022861`
- Relative MSE: `1.214532`
- Model MAE: `0.115680`
- Null MAE: `0.104293`
- Relative MAE: `1.109182`
- Model corr: `0.024288`
- Null corr: `0.161273`
- Beats null MSE: `False`

## calibrated_absolute

- Best branch: `eeg_clean_windows`
- Aggregate model relative MSE: `0.923777`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `-0.076223`
- Beats null aggregate relative MSE: `True`

### eeg_event_windows

- Aggregate model relative MSE: `1.888851`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `0.888851`
- Beats null aggregate relative MSE: `False`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.087120`
- Null MSE: `0.028701`
- Relative MSE: `3.035416`
- Model MAE: `0.212879`
- Null MAE: `0.136411`
- Relative MAE: `1.560573`
- Model corr: `0.462699`
- Null corr: `0.524685`
- Beats null MSE: `False`

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

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.043354`
- Null MSE: `0.026945`
- Relative MSE: `1.608983`
- Model MAE: `0.158371`
- Null MAE: `0.125625`
- Relative MAE: `1.260661`
- Model corr: `-0.032719`
- Null corr: `-0.011514`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.114194`
- Null MSE: `0.032640`
- Relative MSE: `3.498579`
- Model MAE: `0.277395`
- Null MAE: `0.134725`
- Relative MAE: `2.058976`
- Model corr: `0.049821`
- Null corr: `0.059196`
- Beats null MSE: `False`

### eeg_clean_windows

- Aggregate model relative MSE: `0.923777`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `-0.076223`
- Beats null aggregate relative MSE: `True`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `896`
- Model MSE: `0.057651`
- Null MSE: `0.028701`
- Relative MSE: `2.008665`
- Model MAE: `0.188339`
- Null MAE: `0.136411`
- Relative MAE: `1.380677`
- Model corr: `0.500382`
- Null corr: `0.524685`
- Beats null MSE: `False`

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

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.024748`
- Null MSE: `0.026945`
- Relative MSE: `0.918482`
- Model MAE: `0.108639`
- Null MAE: `0.125625`
- Relative MAE: `0.864791`
- Model corr: `-0.062465`
- Null corr: `-0.011514`
- Beats null MSE: `True`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `892`
- Model MSE: `0.035174`
- Null MSE: `0.032640`
- Relative MSE: `1.077647`
- Model MAE: `0.136992`
- Null MAE: `0.134725`
- Relative MAE: `1.016829`
- Model corr: `0.031127`
- Null corr: `0.059196`
- Beats null MSE: `False`
