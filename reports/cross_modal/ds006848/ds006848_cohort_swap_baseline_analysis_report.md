# DS006848 Baseline Analysis

- Config: `configs/cross_modal/ds006848_baseline_analysis_cohort_swap.toml`
- Baseline config: `configs/cross_modal/ds006848_morphology_baseline_cohort_swap.toml`
- Runtime seconds: `11.001`
- Peak memory MB: `1971.198`
- Recommended default branch: `eeg_clean_windows`

## Headline

- The configured verbalwm split remains clean at the data, alignment, and target-coverage levels.
- The current best branch is `eeg_clean_windows` and it does not beat the null on aggregate standardized MSE.
- The dominant error concentration is currently in the amplitude-style target family.

## Recommended Branch

- Aggregate standardized model MSE: `4.279015`
- Aggregate standardized null MSE: `2.652098`
- Aggregate standardized delta: `1.626918`

## Subject Breakdown

### sub-002

- Aggregate standardized model MSE: `4.093461`
- Aggregate standardized null MSE: `3.552906`
- Aggregate standardized delta: `0.540554`
- Amplitude-family delta: `0.729335`
- Timing-family delta: `-0.051677`
- Largest gain target: `mean_ibi_seconds` (-0.608418)
- Largest loss target: `rising_edge_slope_max` (3.009461)

### sub-007

- Aggregate standardized model MSE: `4.436833`
- Aggregate standardized null MSE: `0.800180`
- Aggregate standardized delta: `3.636653`
- Amplitude-family delta: `5.854447`
- Timing-family delta: `0.143445`
- Largest gain target: `mean_ibi_seconds` (-0.189589)
- Largest loss target: `amplitude_range` (7.993096)

### sub-012

- Aggregate standardized model MSE: `6.204273`
- Aggregate standardized null MSE: `5.859860`
- Aggregate standardized delta: `0.344413`
- Amplitude-family delta: `-0.885417`
- Timing-family delta: `1.334980`
- Largest gain target: `dominant_beat_amplitude` (-3.075671)
- Largest loss target: `dominant_beat_rise_time_seconds` (3.287153)

### sub-035

- Aggregate standardized model MSE: `2.394651`
- Aggregate standardized null MSE: `0.410961`
- Aggregate standardized delta: `1.983690`
- Amplitude-family delta: `2.075784`
- Timing-family delta: `1.449051`
- Largest gain target: `mean_ibi_seconds` (0.656058)
- Largest loss target: `amplitude_range` (2.992784)

## Quality Slices

### ppg_peak_count

- 1-2_peaks: count `168`, delta `0.7208192837557109`
- 3_peaks: count `582`, delta `1.593052840653137`
- 4plus_peaks: count `274`, delta `2.2522075245690294`

### ppg_clean_std_quartile

- q1_lowest: count `256`, delta `3.568949445165226`
- q2_lowmid: count `256`, delta `1.9058627636203387`
- q3_highmid: count `256`, delta `0.34114812157739344`
- q4_highest: count `256`, delta `0.6893492581643823`

## Target Shift

### amplitude_range

- Train mean/std: `0.002538` / `0.002013`
- Eval mean/std: `0.004426` / `0.003549`
- Overall eval mean shift z: `0.938007`
- Overall eval std ratio: `1.763475`

### rising_edge_slope_max

- Train mean/std: `0.011617` / `0.008491`
- Eval mean/std: `0.017534` / `0.013287`
- Overall eval mean shift z: `0.696853`
- Overall eval std ratio: `1.564819`

### dominant_beat_amplitude

- Train mean/std: `0.002831` / `0.002381`
- Eval mean/std: `0.004715` / `0.003904`
- Overall eval mean shift z: `0.791111`
- Overall eval std ratio: `1.639489`

### dominant_beat_rise_time_seconds

- Train mean/std: `0.582771` / `0.113548`
- Eval mean/std: `0.621170` / `0.139976`
- Overall eval mean shift z: `0.338176`
- Overall eval std ratio: `1.232750`

### dominant_beat_width_seconds

- Train mean/std: `0.740823` / `0.130021`
- Eval mean/std: `0.738557` / `0.153205`
- Overall eval mean shift z: `-0.017427`
- Overall eval std ratio: `1.178306`
