# DS006848 Calibrated Low-Rank Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub025.toml`
- Ridge lambda: `1000.0`
- Candidate ranks: `8, 16, 32, 64, 128, 256, 512`
- Calibration windows per eval subject: `32`
- Runtime seconds: `19.148`
- Peak memory MB: `1907.713`

## Reference Linear Baseline

- Linear reference config: `configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub025.toml`
- Linear best branch: `eeg_clean_windows`
- Linear best aggregate relative MSE: `0.875321`
- Linear best aggregate delta relative MSE: `-0.124679`

## Best Low-Rank Candidate

- Best branch: `eeg_clean_windows`
- Best rank: `64`
- Aggregate relative MSE: `0.869098`
- Aggregate delta relative MSE: `-0.130902`

## eeg_event_windows

- Best rank: `8`
- Best aggregate relative MSE: `1.020114`
- Best aggregate delta relative MSE: `0.020114`

### Rank Sweep

- rank `8`: aggregate relative MSE `1.020114`, delta `0.020114`
- rank `16`: aggregate relative MSE `2.458412`, delta `1.458412`
- rank `32`: aggregate relative MSE `1.541751`, delta `0.541751`
- rank `64`: aggregate relative MSE `1.453188`, delta `0.453188`
- rank `128`: aggregate relative MSE `1.445493`, delta `0.445493`
- rank `256`: aggregate relative MSE `1.445458`, delta `0.445458`
- rank `512`: aggregate relative MSE `1.445539`, delta `0.445539`

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

## eeg_clean_windows

- Best rank: `64`
- Best aggregate relative MSE: `0.869098`
- Best aggregate delta relative MSE: `-0.130902`

### Rank Sweep

- rank `8`: aggregate relative MSE `1.018449`, delta `0.018449`
- rank `16`: aggregate relative MSE `2.107386`, delta `1.107386`
- rank `32`: aggregate relative MSE `1.022425`, delta `0.022425`
- rank `64`: aggregate relative MSE `0.869098`, delta `-0.130902`
- rank `128`: aggregate relative MSE `0.875318`, delta `-0.124682`
- rank `256`: aggregate relative MSE `0.875313`, delta `-0.124687`
- rank `512`: aggregate relative MSE `0.875305`, delta `-0.124695`

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
