# DS006848 Calibrated Absolute Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub011.toml`
- Ridge lambda: `1000.0`
- Calibration windows per eval subject: `32`
- Runtime seconds: `11.464`
- Peak memory MB: `1969.750`

## Reference

- Zero-shot reference config: `configs/cross_modal/ds006848_morphology_baseline_cohort_plus_sub011.toml`
- Zero-shot best branch by aggregate relative MSE: `eeg_clean_windows`
- Zero-shot best aggregate relative MSE: `4.424210`

## oracle_absolute

- Best branch: `eeg_clean_windows`
- Aggregate model relative MSE: `2.847561`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `1.847561`
- Beats null aggregate relative MSE: `False`

### eeg_event_windows

- Aggregate model relative MSE: `8.004885`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `7.004885`
- Beats null aggregate relative MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000052`
- Null MSE: `0.000004`
- Relative MSE: `12.148448`
- Model MAE: `0.005159`
- Null MAE: `0.001279`
- Relative MAE: `4.033099`
- Model corr: `-0.497239`
- Null corr: `0.786870`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000524`
- Null MSE: `0.000076`
- Relative MSE: `6.899587`
- Model MAE: `0.017268`
- Null MAE: `0.005286`
- Relative MAE: `3.266560`
- Model corr: `-0.118422`
- Null corr: `0.728352`
- Beats null MSE: `False`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1274`
- Model MSE: `0.000029`
- Null MSE: `0.000006`
- Relative MSE: `4.966621`
- Model MAE: `0.004088`
- Null MAE: `0.001522`
- Relative MAE: `2.685973`
- Model corr: `0.301549`
- Null corr: `0.752685`
- Beats null MSE: `False`

### eeg_clean_windows

- Aggregate model relative MSE: `2.847561`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `1.847561`
- Beats null aggregate relative MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000015`
- Null MSE: `0.000004`
- Relative MSE: `3.491438`
- Model MAE: `0.002402`
- Null MAE: `0.001279`
- Relative MAE: `1.877858`
- Model corr: `0.015918`
- Null corr: `0.786870`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000229`
- Null MSE: `0.000076`
- Relative MSE: `3.019051`
- Model MAE: `0.010655`
- Null MAE: `0.005286`
- Relative MAE: `2.015696`
- Model corr: `0.044386`
- Null corr: `0.728352`
- Beats null MSE: `False`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1274`
- Model MSE: `0.000012`
- Null MSE: `0.000006`
- Relative MSE: `2.032195`
- Model MAE: `0.002268`
- Null MAE: `0.001522`
- Relative MAE: `1.490038`
- Model corr: `0.451774`
- Null corr: `0.752685`
- Beats null MSE: `False`

## calibrated_absolute

- Best branch: `eeg_clean_windows`
- Aggregate model relative MSE: `0.901681`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `-0.098319`
- Beats null aggregate relative MSE: `True`

### eeg_event_windows

- Aggregate model relative MSE: `1.443449`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `0.443449`
- Beats null aggregate relative MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000019`
- Null MSE: `0.000011`
- Relative MSE: `1.773530`
- Model MAE: `0.003412`
- Null MAE: `0.002000`
- Relative MAE: `1.705947`
- Model corr: `0.421952`
- Null corr: `0.755187`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000207`
- Null MSE: `0.000230`
- Relative MSE: `0.902848`
- Model MAE: `0.010983`
- Null MAE: `0.009129`
- Relative MAE: `1.203066`
- Model corr: `0.525191`
- Null corr: `0.672047`
- Beats null MSE: `True`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.000017`
- Null MSE: `0.000010`
- Relative MSE: `1.653969`
- Model MAE: `0.003281`
- Null MAE: `0.002135`
- Relative MAE: `1.536476`
- Model corr: `0.540902`
- Null corr: `0.733926`
- Beats null MSE: `False`

### eeg_clean_windows

- Aggregate model relative MSE: `0.901681`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `-0.098319`
- Beats null aggregate relative MSE: `True`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000008`
- Null MSE: `0.000011`
- Relative MSE: `0.731362`
- Model MAE: `0.001686`
- Null MAE: `0.002000`
- Relative MAE: `0.842843`
- Model corr: `0.625866`
- Null corr: `0.755187`
- Beats null MSE: `True`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000199`
- Null MSE: `0.000230`
- Relative MSE: `0.866754`
- Model MAE: `0.008765`
- Null MAE: `0.009129`
- Relative MAE: `0.960086`
- Model corr: `0.556339`
- Null corr: `0.672047`
- Beats null MSE: `True`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.000012`
- Null MSE: `0.000010`
- Relative MSE: `1.106927`
- Model MAE: `0.002335`
- Null MAE: `0.002135`
- Relative MAE: `1.093537`
- Model corr: `0.634874`
- Null corr: `0.733926`
- Beats null MSE: `False`
