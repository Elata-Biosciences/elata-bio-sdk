# DS006848 Calibrated Detail-Summary Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_detail_summary_amplitude_cohort_plus_sub025.toml`
- Source branch: `eeg_clean_windows`
- Feature view: `eeg_clean_detail_summary_windows`
- Haar levels: `7`
- Detail statistics: `rms, max_abs`
- Include final approximation: `True`
- Feature dimension: `945`
- Ridge lambda: `1000.0`
- Candidate ranks: `8, 16, 32, 64, 128, 256, 512`
- Calibration windows per eval subject: `32`
- Runtime seconds: `1.310`
- Peak memory MB: `81.992`

## Reference Low-Rank Baseline

- Reference config: `configs/cross_modal/ds006848_calibrated_low_rank_amplitude_cohort_plus_sub025.toml`
- Reference branch: `eeg_clean_windows`
- Reference rank: `64`
- Reference aggregate relative MSE: `0.869098`
- Reference aggregate delta relative MSE: `-0.130902`

## Best Detail-Summary Candidate

- Best rank: `256`
- Aggregate relative MSE: `0.990280`
- Aggregate delta relative MSE: `-0.009720`
- Beats null aggregate relative MSE: `True`

## Rank Sweep

- rank `8`: aggregate relative MSE `1.006949`, delta `0.006949`
- rank `16`: aggregate relative MSE `1.059240`, delta `0.059240`
- rank `32`: aggregate relative MSE `1.058658`, delta `0.058658`
- rank `64`: aggregate relative MSE `1.034405`, delta `0.034405`
- rank `128`: aggregate relative MSE `1.012098`, delta `0.012098`
- rank `256`: aggregate relative MSE `0.990280`, delta `-0.009720`
- rank `512`: aggregate relative MSE `1.003102`, delta `0.003102`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000010`
- Null MSE: `0.000010`
- Relative MSE: `0.944048`
- Model MAE: `0.001825`
- Null MAE: `0.001929`
- Relative MAE: `0.946288`
- Model corr: `0.767771`
- Null corr: `0.784909`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000220`
- Null MSE: `0.000219`
- Relative MSE: `1.006226`
- Model MAE: `0.008771`
- Null MAE: `0.008856`
- Relative MAE: `0.990414`
- Model corr: `0.726180`
- Null corr: `0.738639`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.000010`
- Null MSE: `0.000010`
- Relative MSE: `1.020567`
- Model MAE: `0.002041`
- Null MAE: `0.002047`
- Relative MAE: `0.997161`
- Model corr: `0.765241`
- Null corr: `0.770368`
- Beats null MSE: `False`
