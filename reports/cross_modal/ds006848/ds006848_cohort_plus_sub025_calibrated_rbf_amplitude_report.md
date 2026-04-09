# DS006848 Calibrated RBF Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_rbf_amplitude_cohort_plus_sub025.toml`
- Kernel: `rbf_median`
- Ridge lambda: `1000.0`
- Gamma scale: `1.000000`
- Calibration windows per eval subject: `32`
- Runtime seconds: `10.993`
- Peak memory MB: `2124.360`

## Reference Linear Baseline

- Linear reference config: `configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub025.toml`
- Linear best branch: `eeg_clean_windows`
- Linear best aggregate relative MSE: `0.875321`
- Linear best aggregate delta relative MSE: `-0.124679`

## Calibrated Absolute

- Best branch: `eeg_event_windows`
- Aggregate model relative MSE: `0.998596`
- Aggregate delta relative MSE: `-0.001404`
- Beats null aggregate relative MSE: `True`

### eeg_event_windows

- Aggregate model relative MSE: `0.998596`
- Aggregate delta relative MSE: `-0.001404`
- Beats null aggregate relative MSE: `True`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Gamma: `0.00001381`
- Median squared distance: `72405.79120154`
- Model MSE: `0.000010`
- Null MSE: `0.000010`
- Relative MSE: `0.998464`
- Model MAE: `0.001927`
- Null MAE: `0.001929`
- Relative MAE: `0.998863`
- Model corr: `0.784644`
- Null corr: `0.784909`
- Beats null MSE: `True`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Gamma: `0.00001381`
- Median squared distance: `72405.79120154`
- Model MSE: `0.000219`
- Null MSE: `0.000219`
- Relative MSE: `0.999474`
- Model MAE: `0.008852`
- Null MAE: `0.008856`
- Relative MAE: `0.999597`
- Model corr: `0.738445`
- Null corr: `0.738639`
- Beats null MSE: `True`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1113`
- Gamma: `0.00001382`
- Median squared distance: `72349.85176646`
- Model MSE: `0.000010`
- Null MSE: `0.000010`
- Relative MSE: `0.997849`
- Model MAE: `0.002044`
- Null MAE: `0.002047`
- Relative MAE: `0.998877`
- Model corr: `0.770318`
- Null corr: `0.770368`
- Beats null MSE: `True`

### eeg_clean_windows

- Aggregate model relative MSE: `0.998596`
- Aggregate delta relative MSE: `-0.001404`
- Beats null aggregate relative MSE: `True`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Gamma: `0.00005395`
- Median squared distance: `18535.88062545`
- Model MSE: `0.000010`
- Null MSE: `0.000010`
- Relative MSE: `0.998464`
- Model MAE: `0.001927`
- Null MAE: `0.001929`
- Relative MAE: `0.998863`
- Model corr: `0.784644`
- Null corr: `0.784909`
- Beats null MSE: `True`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Gamma: `0.00005395`
- Median squared distance: `18535.88062545`
- Model MSE: `0.000219`
- Null MSE: `0.000219`
- Relative MSE: `0.999474`
- Model MAE: `0.008852`
- Null MAE: `0.008856`
- Relative MAE: `0.999597`
- Model corr: `0.738445`
- Null corr: `0.738639`
- Beats null MSE: `True`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1113`
- Gamma: `0.00005399`
- Median squared distance: `18521.59955238`
- Model MSE: `0.000010`
- Null MSE: `0.000010`
- Relative MSE: `0.997849`
- Model MAE: `0.002044`
- Null MAE: `0.002047`
- Relative MAE: `0.998877`
- Model corr: `0.770318`
- Null corr: `0.770368`
- Beats null MSE: `True`
