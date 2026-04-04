# DS006848 Baseline Analysis

- Config: `configs/cross_modal/ds006848_baseline_analysis_broader.toml`
- Baseline config: `configs/cross_modal/ds006848_morphology_baseline_broader.toml`
- Runtime seconds: `11.203`
- Peak memory MB: `1939.837`
- Recommended default branch: `eeg_clean_windows`

## Headline

- The configured verbalwm split remains clean at the data, alignment, and target-coverage levels.
- The current best branch is `eeg_clean_windows` and it does not beat the null on aggregate standardized MSE.
- The dominant error concentration is currently in the amplitude-style target family.

## Recommended Branch

- Aggregate standardized model MSE: `28.384962`
- Aggregate standardized null MSE: `2.222560`
- Aggregate standardized delta: `26.162401`

## Subject Breakdown

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

### sub-016

- Aggregate standardized model MSE: `99.423030`
- Aggregate standardized null MSE: `1.054761`
- Aggregate standardized delta: `98.368269`
- Amplitude-family delta: `158.452775`
- Timing-family delta: `23.784535`
- Largest gain target: `dominant_beat_width_seconds` (8.194567)
- Largest loss target: `amplitude_range` (170.327608)

### sub-017

- Aggregate standardized model MSE: `5.342657`
- Aggregate standardized null MSE: `0.842436`
- Aggregate standardized delta: `4.500221`
- Amplitude-family delta: `7.548176`
- Timing-family delta: `0.224117`
- Largest gain target: `dominant_beat_rise_time_seconds` (-0.586155)
- Largest loss target: `amplitude_range` (8.888675)

## Quality Slices

### ppg_peak_count

- 1-2_peaks: count `70`, delta `55.615556400112276`
- 3_peaks: count `542`, delta `30.632831419139467`
- 4plus_peaks: count `347`, delta `13.238211100601081`

### ppg_clean_std_quartile

- q1_lowest: count `240`, delta `47.61515799281674`
- q2_lowmid: count `240`, delta `45.13814330552806`
- q3_highmid: count `239`, delta `11.524145456357067`
- q4_highest: count `240`, delta `0.31116563924138396`

## Target Shift

### amplitude_range

- Train mean/std: `0.002538` / `0.002013`
- Eval mean/std: `0.002800` / `0.003676`
- Overall eval mean shift z: `0.129856`
- Overall eval std ratio: `1.826777`

### rising_edge_slope_max

- Train mean/std: `0.011617` / `0.008491`
- Eval mean/std: `0.011462` / `0.013453`
- Overall eval mean shift z: `-0.018267`
- Overall eval std ratio: `1.584446`

### dominant_beat_amplitude

- Train mean/std: `0.002831` / `0.002381`
- Eval mean/std: `0.003021` / `0.003918`
- Overall eval mean shift z: `0.079859`
- Overall eval std ratio: `1.645315`

### dominant_beat_rise_time_seconds

- Train mean/std: `0.582771` / `0.113548`
- Eval mean/std: `0.582443` / `0.129668`
- Overall eval mean shift z: `-0.002893`
- Overall eval std ratio: `1.141966`

### dominant_beat_width_seconds

- Train mean/std: `0.740823` / `0.130021`
- Eval mean/std: `0.729153` / `0.143757`
- Overall eval mean shift z: `-0.089752`
- Overall eval std ratio: `1.105638`
