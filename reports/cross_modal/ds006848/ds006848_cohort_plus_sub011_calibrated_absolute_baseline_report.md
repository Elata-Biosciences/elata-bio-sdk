# DS006848 Calibrated Absolute Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_absolute_baseline_cohort_plus_sub011.toml`
- Ridge lambda: `1000.0`
- Calibration windows per eval subject: `32`
- Runtime seconds: `14.763`
- Peak memory MB: `1969.762`

## Reference

- Zero-shot reference config: `configs/cross_modal/ds006848_morphology_baseline_cohort_plus_sub011.toml`
- Zero-shot best branch by aggregate relative MSE: `eeg_clean_windows`
- Zero-shot best aggregate relative MSE: `3.483145`

## oracle_absolute

- Best branch: `eeg_clean_windows`
- Aggregate model relative MSE: `3.885352`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `2.885352`
- Beats null aggregate relative MSE: `False`

### eeg_event_windows

- Aggregate model relative MSE: `9.607911`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `8.607911`
- Beats null aggregate relative MSE: `False`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.361231`
- Null MSE: `0.021408`
- Relative MSE: `16.873625`
- Model MAE: `0.434883`
- Null MAE: `0.118761`
- Relative MAE: `3.661829`
- Model corr: `0.134609`
- Null corr: `0.537030`
- Beats null MSE: `False`

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

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1274`
- Model MSE: `0.368505`
- Null MSE: `0.022472`
- Relative MSE: `16.398249`
- Model MAE: `0.381799`
- Null MAE: `0.111051`
- Relative MAE: `3.438049`
- Model corr: `-0.059846`
- Null corr: `0.091070`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1274`
- Model MSE: `0.192783`
- Null MSE: `0.025278`
- Relative MSE: `7.626648`
- Model MAE: `0.357057`
- Null MAE: `0.115644`
- Relative MAE: `3.087567`
- Model corr: `0.029361`
- Null corr: `0.149435`
- Beats null MSE: `False`

### eeg_clean_windows

- Aggregate model relative MSE: `3.885352`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `2.885352`
- Beats null aggregate relative MSE: `False`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.057698`
- Null MSE: `0.021408`
- Relative MSE: `2.695184`
- Model MAE: `0.181900`
- Null MAE: `0.118761`
- Relative MAE: `1.531642`
- Model corr: `0.301573`
- Null corr: `0.537030`
- Beats null MSE: `False`

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

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1274`
- Model MSE: `0.174682`
- Null MSE: `0.022472`
- Relative MSE: `7.773227`
- Model MAE: `0.281174`
- Null MAE: `0.111051`
- Relative MAE: `2.531936`
- Model corr: `-0.082091`
- Null corr: `0.091070`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1274`
- Model MSE: `0.078635`
- Null MSE: `0.025278`
- Relative MSE: `3.110851`
- Model MAE: `0.191855`
- Null MAE: `0.115644`
- Relative MAE: `1.659019`
- Model corr: `-0.041826`
- Null corr: `0.149435`
- Beats null MSE: `False`

## calibrated_absolute

- Best branch: `eeg_clean_windows`
- Aggregate model relative MSE: `2.195706`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `1.195706`
- Beats null aggregate relative MSE: `False`

### eeg_event_windows

- Aggregate model relative MSE: `4.637492`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `3.637492`
- Beats null aggregate relative MSE: `False`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.255336`
- Null MSE: `0.031243`
- Relative MSE: `8.172498`
- Model MAE: `0.358390`
- Null MAE: `0.142756`
- Relative MAE: `2.510514`
- Model corr: `0.126004`
- Null corr: `0.456390`
- Beats null MSE: `False`

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

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.358011`
- Null MSE: `0.028441`
- Relative MSE: `12.587668`
- Model MAE: `0.377096`
- Null MAE: `0.132811`
- Relative MAE: `2.839336`
- Model corr: `-0.080468`
- Null corr: `-0.011507`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.207837`
- Null MSE: `0.033151`
- Relative MSE: `6.269443`
- Model MAE: `0.369070`
- Null MAE: `0.139312`
- Relative MAE: `2.649231`
- Model corr: `-0.025639`
- Null corr: `0.046480`
- Beats null MSE: `False`

### eeg_clean_windows

- Aggregate model relative MSE: `2.195706`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `1.195706`
- Beats null aggregate relative MSE: `False`

#### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.061629`
- Null MSE: `0.031243`
- Relative MSE: `1.972540`
- Model MAE: `0.196660`
- Null MAE: `0.142756`
- Relative MAE: `1.377597`
- Model corr: `0.267422`
- Null corr: `0.456390`
- Beats null MSE: `False`

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

#### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.161189`
- Null MSE: `0.028441`
- Relative MSE: `5.667393`
- Model MAE: `0.250583`
- Null MAE: `0.132811`
- Relative MAE: `1.886762`
- Model corr: `-0.084656`
- Null corr: `-0.011507`
- Beats null MSE: `False`

#### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1114`
- Model MSE: `0.086394`
- Null MSE: `0.033151`
- Relative MSE: `2.606093`
- Model MAE: `0.210782`
- Null MAE: `0.139312`
- Relative MAE: `1.513019`
- Model corr: `-0.044330`
- Null corr: `0.046480`
- Beats null MSE: `False`
