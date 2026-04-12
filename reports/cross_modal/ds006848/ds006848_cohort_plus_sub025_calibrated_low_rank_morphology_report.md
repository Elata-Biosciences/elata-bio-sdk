# DS006848 Calibrated Low-Rank Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_low_rank_morphology_cohort_plus_sub025.toml`
- Ridge lambda: `1000.0`
- Candidate ranks: `8, 16, 32, 64, 128, 256, 512`
- Calibration windows per eval subject: `32`
- Runtime seconds: `17.100`
- Peak memory MB: `1907.713`

## Reference Linear Baseline

- Linear reference config: `configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub025.toml`
- Linear best branch: `eeg_clean_windows`
- Linear best aggregate relative MSE: `0.875321`
- Linear best aggregate delta relative MSE: `-0.124679`

## Best Low-Rank Candidate

- Best branch: `eeg_clean_windows`
- Best rank: `64`
- Aggregate relative MSE: `0.997498`
- Aggregate delta relative MSE: `-0.002502`

## eeg_event_windows

- Best rank: `8`
- Best aggregate relative MSE: `1.020934`
- Best aggregate delta relative MSE: `0.020934`

### Rank Sweep

- rank `8`: aggregate relative MSE `1.020934`, delta `0.020934`
- rank `16`: aggregate relative MSE `1.954695`, delta `0.954695`
- rank `32`: aggregate relative MSE `2.873521`, delta `1.873521`
- rank `64`: aggregate relative MSE `2.348977`, delta `1.348977`
- rank `128`: aggregate relative MSE `2.485959`, delta `1.485959`
- rank `256`: aggregate relative MSE `2.486028`, delta `1.486028`
- rank `512`: aggregate relative MSE `2.486219`, delta `1.486219`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.033681`
- Null MSE: `0.032071`
- Relative MSE: `1.050194`
- Model MAE: `0.147703`
- Null MAE: `0.144200`
- Relative MAE: `1.024288`
- Model corr: `0.625388`
- Null corr: `0.589766`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000010`
- Null MSE: `0.000010`
- Relative MSE: `0.982441`
- Model MAE: `0.002128`
- Null MAE: `0.001929`
- Relative MAE: `1.103515`
- Model corr: `0.698632`
- Null corr: `0.784909`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000188`
- Null MSE: `0.000219`
- Relative MSE: `0.859082`
- Model MAE: `0.009389`
- Null MAE: `0.008856`
- Relative MAE: `1.060243`
- Model corr: `0.678616`
- Null corr: `0.738639`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.000013`
- Null MSE: `0.000010`
- Relative MSE: `1.218817`
- Model MAE: `0.002474`
- Null MAE: `0.002047`
- Relative MAE: `1.208667`
- Model corr: `0.715288`
- Null corr: `0.770368`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.031236`
- Null MSE: `0.029681`
- Relative MSE: `1.052407`
- Model MAE: `0.145048`
- Null MAE: `0.134992`
- Relative MAE: `1.074493`
- Model corr: `0.025370`
- Null corr: `0.187849`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.036270`
- Null MSE: `0.036566`
- Relative MSE: `0.991921`
- Model MAE: `0.152924`
- Null MAE: `0.145675`
- Relative MAE: `1.049763`
- Model corr: `0.129913`
- Null corr: `0.198306`
- Beats null MSE: `True`

## eeg_clean_windows

- Best rank: `64`
- Best aggregate relative MSE: `0.997498`
- Best aggregate delta relative MSE: `-0.002502`

### Rank Sweep

- rank `8`: aggregate relative MSE `1.019411`, delta `0.019411`
- rank `16`: aggregate relative MSE `1.690800`, delta `0.690800`
- rank `32`: aggregate relative MSE `1.129612`, delta `0.129612`
- rank `64`: aggregate relative MSE `0.997498`, delta `-0.002502`
- rank `128`: aggregate relative MSE `1.003763`, delta `0.003763`
- rank `256`: aggregate relative MSE `1.003787`, delta `0.003787`
- rank `512`: aggregate relative MSE `1.003792`, delta `0.003792`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.119241`
- Null MSE: `0.032071`
- Relative MSE: `3.718012`
- Model MAE: `0.264331`
- Null MAE: `0.144200`
- Relative MAE: `1.833080`
- Model corr: `0.161661`
- Null corr: `0.589766`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000007`
- Null MSE: `0.000010`
- Relative MSE: `0.717034`
- Model MAE: `0.001560`
- Null MAE: `0.001929`
- Relative MAE: `0.808668`
- Model corr: `0.669521`
- Null corr: `0.784909`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000182`
- Null MSE: `0.000219`
- Relative MSE: `0.834398`
- Model MAE: `0.007840`
- Null MAE: `0.008856`
- Relative MAE: `0.885281`
- Model corr: `0.637109`
- Null corr: `0.738639`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.000011`
- Null MSE: `0.000010`
- Relative MSE: `1.055862`
- Model MAE: `0.002091`
- Null MAE: `0.002047`
- Relative MAE: `1.021569`
- Model corr: `0.688777`
- Null corr: `0.770368`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.034361`
- Null MSE: `0.029681`
- Relative MSE: `1.157703`
- Model MAE: `0.132529`
- Null MAE: `0.134992`
- Relative MAE: `0.981755`
- Model corr: `0.270245`
- Null corr: `0.187849`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.044701`
- Null MSE: `0.036566`
- Relative MSE: `1.222494`
- Model MAE: `0.156595`
- Null MAE: `0.145675`
- Relative MAE: `1.074958`
- Model corr: `0.216925`
- Null corr: `0.198306`
- Beats null MSE: `False`
