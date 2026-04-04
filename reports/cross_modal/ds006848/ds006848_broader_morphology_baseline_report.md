# DS006848 Morphology Baseline Report

- Config: `configs/cross_modal/ds006848_morphology_baseline_broader.toml`
- Ridge lambda: `1000.0`
- Runtime seconds: `9.655`
- Peak memory MB: `1938.090`
- Train windows: `1024`
- Eval windows: `959`
- Best branch by standardized MSE: `eeg_clean_windows`
- Aggregate target set: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude, dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

## eeg_event_windows

- Aggregate standardized model MSE: `49.136834`
- Aggregate standardized null MSE: `2.222560`
- Aggregate standardized model MAE: `4.257710`
- Aggregate standardized null MAE: `1.090043`
- Beats null standardized MSE: `False`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `959`
- Model MSE: `1.049566`
- Null MSE: `0.021541`
- Model MAE: `0.597119`
- Null MAE: `0.119169`
- Model corr: `-0.325006`
- Null corr: `0.000000`
- Model standardized MSE: `50.057720`
- Null standardized MSE: `1.027380`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `959`
- Model MSE: `0.000309`
- Null MSE: `0.000014`
- Model MAE: `0.010533`
- Null MAE: `0.002688`
- Model corr: `-0.260971`
- Null corr: `0.000000`
- Model standardized MSE: `76.389128`
- Null standardized MSE: `3.353976`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `959`
- Model MSE: `0.005377`
- Null MSE: `0.000181`
- Model MAE: `0.049473`
- Null MAE: `0.010103`
- Model corr: `-0.258799`
- Null corr: `0.000000`
- Model standardized MSE: `74.579276`
- Null standardized MSE: `2.510802`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `959`
- Model MSE: `0.000394`
- Null MSE: `0.000015`
- Model MAE: `0.011762`
- Null MAE: `0.002882`
- Model corr: `-0.223268`
- Null corr: `0.000000`
- Model standardized MSE: `69.414077`
- Null standardized MSE: `2.713439`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `959`
- Model MSE: `0.191733`
- Null MSE: `0.016814`
- Model MAE: `0.308290`
- Null MAE: `0.104967`
- Model corr: `0.008711`
- Null corr: `0.000000`
- Model standardized MSE: `14.870851`
- Null standardized MSE: `1.304094`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `959`
- Model MSE: `0.176339`
- Null MSE: `0.020802`
- Model MAE: `0.334723`
- Null MAE: `0.102737`
- Model corr: `-0.200664`
- Null corr: `0.000000`
- Model standardized MSE: `10.430837`
- Null standardized MSE: `1.230492`
- Beats null MSE: `False`

## eeg_clean_windows

- Aggregate standardized model MSE: `28.384962`
- Aggregate standardized null MSE: `2.222560`
- Aggregate standardized model MAE: `3.463497`
- Aggregate standardized null MAE: `1.090043`
- Beats null standardized MSE: `False`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `959`
- Model MSE: `0.304092`
- Null MSE: `0.021541`
- Model MAE: `0.354022`
- Null MAE: `0.119169`
- Model corr: `-0.344220`
- Null corr: `0.000000`
- Model standardized MSE: `14.503307`
- Null standardized MSE: `1.027380`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `959`
- Model MSE: `0.000197`
- Null MSE: `0.000014`
- Model MAE: `0.010298`
- Null MAE: `0.002688`
- Model corr: `-0.409672`
- Null corr: `0.000000`
- Model standardized MSE: `48.521508`
- Null standardized MSE: `3.353976`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `959`
- Model MSE: `0.002963`
- Null MSE: `0.000181`
- Model MAE: `0.038172`
- Null MAE: `0.010103`
- Model corr: `-0.400257`
- Null corr: `0.000000`
- Model standardized MSE: `41.103829`
- Null standardized MSE: `2.510802`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `959`
- Model MSE: `0.000252`
- Null MSE: `0.000015`
- Model MAE: `0.011426`
- Null MAE: `0.002882`
- Model corr: `-0.384204`
- Null corr: `0.000000`
- Model standardized MSE: `44.423226`
- Null standardized MSE: `2.713439`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `959`
- Model MSE: `0.054722`
- Null MSE: `0.016814`
- Model MAE: `0.171928`
- Null MAE: `0.104967`
- Model corr: `0.101589`
- Null corr: `0.000000`
- Model standardized MSE: `4.244262`
- Null standardized MSE: `1.304094`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `959`
- Model MSE: `0.061401`
- Null MSE: `0.020802`
- Model MAE: `0.181137`
- Null MAE: `0.102737`
- Model corr: `-0.141199`
- Null corr: `0.000000`
- Model standardized MSE: `3.631984`
- Null standardized MSE: `1.230492`
- Beats null MSE: `False`
