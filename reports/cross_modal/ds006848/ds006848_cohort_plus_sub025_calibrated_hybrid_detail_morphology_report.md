# DS006848 Calibrated Hybrid Detail Baseline Report

- Config: `configs/cross_modal/ds006848_calibrated_hybrid_detail_morphology_cohort_plus_sub025.toml`
- Source branch: `eeg_clean_windows`
- Feature view: `eeg_clean_hybrid_detail_windows`
- Haar levels: `7`
- Detail statistics: `rms, max_abs`
- Include final approximation: `True`
- Raw feature dim: `8064`
- Detail feature dim: `945`
- Combined feature dim: `9009`
- Ridge lambda: `1000.0`
- Candidate ranks: `8, 16, 32, 64, 128, 256, 512`
- Calibration windows per eval subject: `32`
- Runtime seconds: `4.735`
- Peak memory MB: `387.245`

## Reference Low-Rank Baseline

- Reference config: `configs/cross_modal/ds006848_calibrated_low_rank_morphology_cohort_plus_sub025.toml`
- Reference branch: `eeg_clean_windows`
- Reference rank: `64`
- Reference aggregate relative MSE: `0.997498`
- Reference aggregate delta relative MSE: `-0.002502`

## Best Hybrid Candidate

- Best rank: `16`
- Aggregate relative MSE: `0.852510`
- Aggregate delta relative MSE: `-0.147490`
- Beats null aggregate relative MSE: `True`

## Rank Sweep

- rank `8`: aggregate relative MSE `0.987484`, delta `-0.012516`
- rank `16`: aggregate relative MSE `0.852510`, delta `-0.147490`
- rank `32`: aggregate relative MSE `0.954667`, delta `-0.045333`
- rank `64`: aggregate relative MSE `1.636749`, delta `0.636749`
- rank `128`: aggregate relative MSE `1.057156`, delta `0.057156`
- rank `256`: aggregate relative MSE `1.004444`, delta `0.004444`
- rank `512`: aggregate relative MSE `0.959293`, delta `-0.040707`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.040678`
- Null MSE: `0.032071`
- Relative MSE: `1.268359`
- Model MAE: `0.164809`
- Null MAE: `0.144200`
- Relative MAE: `1.142914`
- Model corr: `0.632883`
- Null corr: `0.589766`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000008`
- Null MSE: `0.000010`
- Relative MSE: `0.782053`
- Model MAE: `0.001849`
- Null MAE: `0.001929`
- Relative MAE: `0.958781`
- Model corr: `0.715034`
- Null corr: `0.784909`
- Beats null MSE: `True`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1120`
- Model MSE: `0.000138`
- Null MSE: `0.000219`
- Relative MSE: `0.632965`
- Model MAE: `0.007880`
- Null MAE: `0.008856`
- Relative MAE: `0.889763`
- Model corr: `0.695195`
- Null corr: `0.738639`
- Beats null MSE: `True`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.000009`
- Null MSE: `0.000010`
- Relative MSE: `0.884627`
- Model MAE: `0.002087`
- Null MAE: `0.002047`
- Relative MAE: `1.019852`
- Model corr: `0.733750`
- Null corr: `0.770368`
- Beats null MSE: `True`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.029137`
- Null MSE: `0.029681`
- Relative MSE: `0.981683`
- Model MAE: `0.118418`
- Null MAE: `0.134992`
- Relative MAE: `0.877220`
- Model corr: `0.064438`
- Null corr: `0.187849`
- Beats null MSE: `True`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1113`
- Model MSE: `0.035879`
- Null MSE: `0.036566`
- Relative MSE: `0.981223`
- Model MAE: `0.140694`
- Null MAE: `0.145675`
- Relative MAE: `0.965803`
- Model corr: `0.115401`
- Null corr: `0.198306`
- Beats null MSE: `True`
