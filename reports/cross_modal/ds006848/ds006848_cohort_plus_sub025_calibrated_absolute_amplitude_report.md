# DS006848 Calibrated Absolute Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub025.toml`
- Ridge lambda: `1000.0`
- Calibration windows per eval subject: `32`
- Runtime seconds: `8.488`
- Peak memory MB: `1969.750`

## Reference

- Zero-shot reference config: `configs/cross_modal/ds006848_morphology_baseline_cohort_plus_sub025.toml`
- Zero-shot best branch by aggregate relative MSE: `eeg_clean_windows`
- Zero-shot best aggregate relative MSE: `1.718319`

## oracle_absolute

- Best branch: `eeg_clean_windows`
- Aggregate model relative MSE: `2.584182`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `1.584182`
- Beats null aggregate relative MSE: `False`

### eeg_event_windows

- Aggregate model relative MSE: `8.382196`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `7.382196`
- Beats null aggregate relative MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000051`
- Null MSE: `0.000004`
- Relative MSE: `12.610346`
- Model MAE: `0.005044`
- Null MAE: `0.001207`
- Relative MAE: `4.179009`
- Model corr: `-0.534734`
- Null corr: `0.812136`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000496`
- Null MSE: `0.000066`
- Relative MSE: `7.478797`
- Model MAE: `0.015763`
- Null MAE: `0.005003`
- Relative MAE: `3.150704`
- Model corr: `-0.196374`
- Null corr: `0.782119`
- Beats null MSE: `False`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1273`
- Model MSE: `0.000029`
- Null MSE: `0.000006`
- Relative MSE: `5.057445`
- Model MAE: `0.003993`
- Null MAE: `0.001438`
- Relative MAE: `2.775876`
- Model corr: `0.345930`
- Null corr: `0.785271`
- Beats null MSE: `False`

### eeg_clean_windows

- Aggregate model relative MSE: `2.584182`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `1.584182`
- Beats null aggregate relative MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000014`
- Null MSE: `0.000004`
- Relative MSE: `3.451888`
- Model MAE: `0.002093`
- Null MAE: `0.001207`
- Relative MAE: `1.734184`
- Model corr: `0.303191`
- Null corr: `0.812136`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1280`
- Model MSE: `0.000160`
- Null MSE: `0.000066`
- Relative MSE: `2.415721`
- Model MAE: `0.007357`
- Null MAE: `0.005003`
- Relative MAE: `1.470557`
- Model corr: `0.433771`
- Null corr: `0.782119`
- Beats null MSE: `False`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1273`
- Model MSE: `0.000011`
- Null MSE: `0.000006`
- Relative MSE: `1.884936`
- Model MAE: `0.001895`
- Null MAE: `0.001438`
- Relative MAE: `1.317530`
- Model corr: `0.586454`
- Null corr: `0.785271`
- Beats null MSE: `False`

## calibrated_absolute

- Best branch: `eeg_clean_windows`
- Aggregate model relative MSE: `0.875321`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `-0.124679`
- Beats null aggregate relative MSE: `True`

### eeg_event_windows

- Aggregate model relative MSE: `1.445540`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `0.445540`
- Beats null aggregate relative MSE: `False`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000019`
- Null MSE: `0.000010`
- Relative MSE: `1.785398`
- Model MAE: `0.003341`
- Null MAE: `0.001929`
- Relative MAE: `1.732245`
- Model corr: `0.425709`
- Null corr: `0.784909`
- Beats null MSE: `False`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000194`
- Null MSE: `0.000219`
- Relative MSE: `0.888238`
- Model MAE: `0.010568`
- Null MAE: `0.008856`
- Relative MAE: `1.193292`
- Model corr: `0.559472`
- Null corr: `0.738639`
- Beats null MSE: `True`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.000017`
- Null MSE: `0.000010`
- Relative MSE: `1.662984`
- Model MAE: `0.003200`
- Null MAE: `0.002047`
- Relative MAE: `1.563504`
- Model corr: `0.569946`
- Null corr: `0.770368`
- Beats null MSE: `False`

### eeg_clean_windows

- Aggregate model relative MSE: `0.875321`
- Aggregate null relative MSE: `1.000000`
- Aggregate delta relative MSE: `-0.124679`
- Beats null aggregate relative MSE: `True`

#### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000007`
- Null MSE: `0.000010`
- Relative MSE: `0.718743`
- Model MAE: `0.001563`
- Null MAE: `0.001929`
- Relative MAE: `0.810471`
- Model corr: `0.671011`
- Null corr: `0.784909`
- Beats null MSE: `True`

#### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000184`
- Null MSE: `0.000219`
- Relative MSE: `0.841276`
- Model MAE: `0.007871`
- Null MAE: `0.008856`
- Relative MAE: `0.888776`
- Model corr: `0.639039`
- Null corr: `0.738639`
- Beats null MSE: `True`

#### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.000011`
- Null MSE: `0.000010`
- Relative MSE: `1.065943`
- Model MAE: `0.002101`
- Null MAE: `0.002047`
- Relative MAE: `1.026469`
- Model corr: `0.689580`
- Null corr: `0.770368`
- Beats null MSE: `False`
