# DS006848 Calibrated Absolute Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_absolute_baseline_cohort_plus_sub011_sub025.toml`
- Ridge lambda: `1000.0`
- Calibration windows per eval subject: `32`
- Runtime seconds: `15.861`
- Peak memory MB: `2215.960`

## Reference

- Zero-shot reference config: `configs/cross_modal/ds006848_morphology_baseline_cohort_plus_sub011_sub025.toml`
- Zero-shot best branch by aggregate relative MSE: `eeg_clean_windows`
- Zero-shot best aggregate relative MSE: `3.336979`

## oracle_absolute

- Best branch: `eeg_clean_windows`
- Aggregate model relative MSE: `3.468034`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `2.468034`
- Beats null aggregate relative MSE: `False`

### eeg_event_windows

- Aggregate model relative MSE: `9.098482`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `8.098482`
- Beats null aggregate relative MSE: `False`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1536`
- Model MSE: `0.486034`
- Null MSE: `0.024626`
- Relative MSE: `19.736351`
- Model MAE: `0.534145`
- Null MAE: `0.126020`
- Relative MAE: `4.238583`
- Model corr: `-0.169061`
- Null corr: `0.605192`
- Beats null MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1536`
- Model MSE: `0.000043`
- Null MSE: `0.000004`
- Relative MSE: `12.097742`
- Model MAE: `0.004352`
- Null MAE: `0.001105`
- Relative MAE: `3.937356`
- Model corr: `-0.554346`
- Null corr: `0.813361`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1536`
- Model MSE: `0.000437`
- Null MSE: `0.000064`
- Relative MSE: `6.866148`
- Model MAE: `0.014638`
- Null MAE: `0.004600`
- Relative MAE: `3.182040`
- Model corr: `-0.200536`
- Null corr: `0.767137`
- Beats null MSE: `False`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1527`
- Model MSE: `0.000024`
- Null MSE: `0.000005`
- Relative MSE: `4.947279`
- Model MAE: `0.003473`
- Null MAE: `0.001319`
- Relative MAE: `2.633539`
- Model corr: `0.287396`
- Null corr: `0.789515`
- Beats null MSE: `False`

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1527`
- Model MSE: `0.354768`
- Null MSE: `0.025466`
- Relative MSE: `13.931249`
- Model MAE: `0.395999`
- Null MAE: `0.121178`
- Relative MAE: `3.267903`
- Model corr: `0.113743`
- Null corr: `0.299793`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1527`
- Model MSE: `0.225621`
- Null MSE: `0.029493`
- Relative MSE: `7.649993`
- Model MAE: `0.389118`
- Null MAE: `0.127740`
- Relative MAE: `3.046180`
- Model corr: `0.168434`
- Null corr: `0.298891`
- Beats null MSE: `False`

### eeg_clean_windows

- Aggregate model relative MSE: `3.468034`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `2.468034`
- Beats null aggregate relative MSE: `False`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1536`
- Model MSE: `0.113292`
- Null MSE: `0.024626`
- Relative MSE: `4.600433`
- Model MAE: `0.250102`
- Null MAE: `0.126020`
- Relative MAE: `1.984631`
- Model corr: `-0.018159`
- Null corr: `0.605192`
- Beats null MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1536`
- Model MSE: `0.000012`
- Null MSE: `0.000004`
- Relative MSE: `3.480957`
- Model MAE: `0.002048`
- Null MAE: `0.001105`
- Relative MAE: `1.853166`
- Model corr: `0.154369`
- Null corr: `0.813361`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1536`
- Model MSE: `0.000191`
- Null MSE: `0.000064`
- Relative MSE: `3.007616`
- Model MAE: `0.009102`
- Null MAE: `0.004600`
- Relative MAE: `1.978635`
- Model corr: `0.196585`
- Null corr: `0.767137`
- Beats null MSE: `False`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1527`
- Model MSE: `0.000010`
- Null MSE: `0.000005`
- Relative MSE: `2.028551`
- Model MAE: `0.001957`
- Null MAE: `0.001319`
- Relative MAE: `1.483806`
- Model corr: `0.533724`
- Null corr: `0.789515`
- Beats null MSE: `False`

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1527`
- Model MSE: `0.156883`
- Null MSE: `0.025466`
- Relative MSE: `6.160558`
- Model MAE: `0.270927`
- Null MAE: `0.121178`
- Relative MAE: `2.235774`
- Model corr: `0.092434`
- Null corr: `0.299793`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1527`
- Model MSE: `0.078525`
- Null MSE: `0.029493`
- Relative MSE: `2.662487`
- Model MAE: `0.198097`
- Null MAE: `0.127740`
- Relative MAE: `1.550786`
- Model corr: `0.126638`
- Null corr: `0.298891`
- Beats null MSE: `False`

## calibrated_absolute

- Best branch: `eeg_clean_windows`
- Aggregate model relative MSE: `1.978477`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `0.978477`
- Beats null aggregate relative MSE: `False`

### eeg_event_windows

- Aggregate model relative MSE: `4.510876`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `3.510876`
- Beats null aggregate relative MSE: `False`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.371793`
- Null MSE: `0.033628`
- Relative MSE: `11.056084`
- Model MAE: `0.457671`
- Null MAE: `0.148190`
- Relative MAE: `3.088418`
- Model corr: `-0.162276`
- Null corr: `0.554616`
- Beats null MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.000016`
- Null MSE: `0.000009`
- Relative MSE: `1.773090`
- Model MAE: `0.002898`
- Null MAE: `0.001710`
- Relative MAE: `1.695168`
- Model corr: `0.397996`
- Null corr: `0.784475`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.000173`
- Null MSE: `0.000192`
- Relative MSE: `0.903893`
- Model MAE: `0.009387`
- Null MAE: `0.007811`
- Relative MAE: `1.201862`
- Model corr: `0.539295`
- Null corr: `0.715859`
- Beats null MSE: `True`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.000014`
- Null MSE: `0.000009`
- Relative MSE: `1.653278`
- Model MAE: `0.002803`
- Null MAE: `0.001832`
- Relative MAE: `1.530596`
- Model corr: `0.556331`
- Null corr: `0.772992`
- Beats null MSE: `False`

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.352676`
- Null MSE: `0.030474`
- Relative MSE: `11.572819`
- Model MAE: `0.399175`
- Null MAE: `0.139431`
- Relative MAE: `2.862886`
- Model corr: `0.097131`
- Null corr: `0.165070`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.241701`
- Null MSE: `0.036339`
- Relative MSE: `6.651299`
- Model MAE: `0.403486`
- Null MAE: `0.147682`
- Relative MAE: `2.732117`
- Model corr: `0.130239`
- Null corr: `0.177149`
- Beats null MSE: `False`

### eeg_clean_windows

- Aggregate model relative MSE: `1.978477`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `0.978477`
- Beats null aggregate relative MSE: `False`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.112745`
- Null MSE: `0.033628`
- Relative MSE: `3.352728`
- Model MAE: `0.259210`
- Null MAE: `0.148190`
- Relative MAE: `1.749176`
- Model corr: `0.003206`
- Null corr: `0.554616`
- Beats null MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.000006`
- Null MSE: `0.000009`
- Relative MSE: `0.732525`
- Model MAE: `0.001455`
- Null MAE: `0.001710`
- Relative MAE: `0.850768`
- Model corr: `0.670136`
- Null corr: `0.784475`
- Beats null MSE: `True`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1344`
- Model MSE: `0.000166`
- Null MSE: `0.000192`
- Relative MSE: `0.867414`
- Model MAE: `0.007534`
- Null MAE: `0.007811`
- Relative MAE: `0.964536`
- Model corr: `0.617503`
- Null corr: `0.715859`
- Beats null MSE: `True`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.000010`
- Null MSE: `0.000009`
- Relative MSE: `1.108012`
- Model MAE: `0.002017`
- Null MAE: `0.001832`
- Relative MAE: `1.101273`
- Model corr: `0.688774`
- Null corr: `0.772992`
- Beats null MSE: `False`

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.146687`
- Null MSE: `0.030474`
- Relative MSE: `4.813442`
- Model MAE: `0.247205`
- Null MAE: `0.139431`
- Relative MAE: `1.772960`
- Model corr: `0.087951`
- Null corr: `0.165070`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1335`
- Model MSE: `0.086159`
- Null MSE: `0.036339`
- Relative MSE: `2.370992`
- Model MAE: `0.215451`
- Null MAE: `0.147682`
- Relative MAE: `1.458878`
- Model corr: `0.113525`
- Null corr: `0.177149`
- Beats null MSE: `False`
