# DS006848 Baseline Analysis

- Config: `configs/cross_modal/ds006848_baseline_analysis_expanded.toml`
- Baseline config: `configs/cross_modal/ds006848_morphology_baseline_expanded.toml`
- Runtime seconds: `5.628`
- Peak memory MB: `985.849`
- Recommended default branch: `eeg_event_windows`

## Headline

- The configured verbalwm split remains clean at the data, alignment, and target-coverage levels.
- The current best branch is `eeg_event_windows` and it beats the null on aggregate standardized MSE.
- The dominant error concentration is currently in the timing-style target family.

## Recommended Branch

- Aggregate standardized model MSE: `71.105718`
- Aggregate standardized null MSE: `82.954553`
- Aggregate standardized delta: `-11.848836`

## Subject Breakdown

### sub-007

- Aggregate standardized model MSE: `71.683893`
- Aggregate standardized null MSE: `0.650785`
- Aggregate standardized delta: `71.033108`
- Amplitude-family delta: `53.131782`
- Timing-family delta: `291.196611`
- Largest gain target: `amplitude_range` (-0.025738)
- Largest loss target: `mean_ibi_seconds` (677.819640)

### sub-012

- Aggregate standardized model MSE: `70.527543`
- Aggregate standardized null MSE: `165.258322`
- Aggregate standardized delta: `-94.730780`
- Amplitude-family delta: `-181.927790`
- Timing-family delta: `43.355033`
- Largest gain target: `amplitude_range` (-238.511141)
- Largest loss target: `mean_ibi_seconds` (57.935628)

## Quality Slices

### ppg_peak_count

- 1-2_peaks: count `24`, delta `-45.1274603815582`
- 3_peaks: count `265`, delta `4.183204132178874`
- 4plus_peaks: count `223`, delta `-27.31880707424242`

### ppg_clean_std_quartile

- q1_lowest: count `128`, delta `67.84388705864069`
- q2_lowmid: count `128`, delta `73.90908926064574`
- q3_highmid: count `128`, delta `-27.763767854020855`
- q4_highest: count `128`, delta `-161.38455168156293`

## Target Shift

### amplitude_range

- Train mean/std: `0.001207` / `0.000387`
- Eval mean/std: `0.004551` / `0.004315`
- Overall eval mean shift z: `8.652491`
- Overall eval std ratio: `11.162858`

### rising_edge_slope_max

- Train mean/std: `0.005371` / `0.002264`
- Eval mean/std: `0.017277` / `0.015988`
- Overall eval mean shift z: `5.258729`
- Overall eval std ratio: `7.061676`

### dominant_beat_amplitude

- Train mean/std: `0.001283` / `0.000501`
- Eval mean/std: `0.004873` / `0.004609`
- Overall eval mean shift z: `7.162270`
- Overall eval std ratio: `9.195377`

### dominant_beat_rise_time_seconds

- Train mean/std: `0.587245` / `0.133991`
- Eval mean/std: `0.612122` / `0.134104`
- Overall eval mean shift z: `0.185661`
- Overall eval std ratio: `1.000847`

### dominant_beat_width_seconds

- Train mean/std: `0.767363` / `0.153277`
- Eval mean/std: `0.718506` / `0.135840`
- Overall eval mean shift z: `-0.318750`
- Overall eval std ratio: `0.886243`
