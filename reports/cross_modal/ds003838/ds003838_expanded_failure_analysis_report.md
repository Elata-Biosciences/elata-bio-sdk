# DS003838 Expanded Failure Analysis

- Config: `configs/cross_modal/ds003838_failure_analysis_expanded.toml`
- Baseline config: `configs/cross_modal/ds003838_morphology_baseline_expanded.toml`
- Runtime seconds: `28.723`
- Peak memory MB: `3941.735`
- Recommended default branch: `eeg_clean_windows`

## Headline

- The 8-subject split remains clean at the data, alignment, and target-coverage levels.
- The least-bad branch is `eeg_clean_windows`, but it still does not beat null on aggregate standardized MSE.
- The surviving positive signal is narrow and amplitude-heavy rather than timing-heavy.

## Recommended Branch

- Aggregate standardized model MSE: `11.361128`
- Aggregate standardized null MSE: `6.051848`
- Aggregate standardized delta: `5.309280`

## Subject Breakdown

### sub-033

- Aggregate standardized model MSE: `22.554721`
- Aggregate standardized null MSE: `22.151068`
- Aggregate standardized delta: `0.403653`
- Amplitude-family delta: `-6.612832`
- Timing-family delta: `8.976635`
- Largest gain target: `rising_edge_slope_max` (-8.318100)
- Largest loss target: `dominant_beat_rise_time_seconds` (13.723589)

### sub-035

- Aggregate standardized model MSE: `3.736096`
- Aggregate standardized null MSE: `0.443164`
- Aggregate standardized delta: `3.292932`
- Amplitude-family delta: `5.243471`
- Timing-family delta: `0.263300`
- Largest gain target: `mean_ibi_seconds` (0.055653)
- Largest loss target: `rising_edge_slope_max` (11.983102)

### sub-039

- Aggregate standardized model MSE: `14.306596`
- Aggregate standardized null MSE: `1.098336`
- Aggregate standardized delta: `13.208260`
- Amplitude-family delta: `12.510957`
- Timing-family delta: `10.799140`
- Largest gain target: `dominant_beat_amplitude` (1.323441)
- Largest loss target: `rising_edge_slope_max` (31.400739)

### sub-040

- Aggregate standardized model MSE: `4.913708`
- Aggregate standardized null MSE: `0.664211`
- Aggregate standardized delta: `4.249497`
- Amplitude-family delta: `0.238654`
- Timing-family delta: `7.405284`
- Largest gain target: `dominant_beat_amplitude` (-0.676066)
- Largest loss target: `dominant_beat_rise_time_seconds` (16.968966)

## Quality Slices

### ppg_peak_count

- 1-2_peaks: count `173`, delta `3.2368368387626`
- 3_peaks: count `988`, delta `5.695869316169948`
- 4plus_peaks: count `887`, delta `5.235097263080306`

### ppg_clean_std_quartile

- q1_lowest: count `512`, delta `11.347915468513818`
- q2_lowmid: count `512`, delta `5.503996152675418`
- q3_highmid: count `512`, delta `5.485537033161139`
- q4_highest: count `512`, delta `-1.1831069945182078`

## Target Shift

### amplitude_range

- Train mean/std: `3954.967005` / `2775.124382`
- Eval mean/std: `5602.264616` / `7622.742200`
- Overall eval mean shift z: `0.593594`
- Overall eval std ratio: `2.746811`

### rising_edge_slope_max

- Train mean/std: `18499.646538` / `21305.115200`
- Eval mean/std: `32996.423876` / `79234.927885`
- Overall eval mean shift z: `0.680436`
- Overall eval std ratio: `3.719057`

### dominant_beat_amplitude

- Train mean/std: `4393.229472` / `3002.890483`
- Eval mean/std: `5991.670119` / `7299.165219`
- Overall eval mean shift z: `0.532301`
- Overall eval std ratio: `2.430713`

### dominant_beat_rise_time_seconds

- Train mean/std: `0.555742` / `0.124974`
- Eval mean/std: `0.559682` / `0.119702`
- Overall eval mean shift z: `0.031527`
- Overall eval std ratio: `0.957819`

### dominant_beat_width_seconds

- Train mean/std: `0.691133` / `0.137889`
- Eval mean/std: `0.705336` / `0.134172`
- Overall eval mean shift z: `0.103001`
- Overall eval std ratio: `0.973040`
