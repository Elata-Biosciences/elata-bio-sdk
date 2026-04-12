# DS006848 Morphology Baseline Report

- Config: `configs/cross_modal/ds006848_morphology_baseline_cohort_plus_sub011_sub025.toml`
- Ridge lambda: `1000.0`
- Runtime seconds: `11.326`
- Peak memory MB: `2584.598`
- Train windows: `1024`
- Eval windows: `1536`
- Best branch by standardized MSE: `eeg_clean_windows`
- Aggregate target set: `amplitude_range, rising_edge_slope_max, dominant_beat_amplitude, dominant_beat_rise_time_seconds, dominant_beat_width_seconds`

## eeg_event_windows

- Aggregate standardized model MSE: `10.469478`
- Aggregate standardized null MSE: `2.314777`
- Aggregate standardized model MAE: `2.476025`
- Aggregate standardized null MAE: `1.069718`
- Beats null standardized MSE: `False`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1536`
- Model MSE: `0.258735`
- Null MSE: `0.041118`
- Model MAE: `0.387438`
- Null MAE: `0.165374`
- Model corr: `-0.271657`
- Null corr: `0.000000`
- Model standardized MSE: `12.340060`
- Null standardized MSE: `1.961082`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1536`
- Model MSE: `0.000050`
- Null MSE: `0.000011`
- Model MAE: `0.005040`
- Null MAE: `0.002211`
- Model corr: `-0.143352`
- Null corr: `0.000000`
- Model standardized MSE: `12.229283`
- Null standardized MSE: `2.809111`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1536`
- Model MSE: `0.000906`
- Null MSE: `0.000160`
- Model MAE: `0.025987`
- Null MAE: `0.008608`
- Model corr: `-0.137309`
- Null corr: `0.000000`
- Model standardized MSE: `12.562779`
- Null standardized MSE: `2.220334`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1527`
- Model MSE: `0.000068`
- Null MSE: `0.000014`
- Model MAE: `0.005962`
- Null MAE: `0.002481`
- Model corr: `-0.081653`
- Null corr: `0.000000`
- Model standardized MSE: `11.992766`
- Null standardized MSE: `2.399406`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1527`
- Model MSE: `0.130627`
- Null MSE: `0.028108`
- Model MAE: `0.271239`
- Null MAE: `0.134200`
- Model corr: `0.086169`
- Null corr: `0.000000`
- Model standardized MSE: `10.131455`
- Null standardized MSE: `2.180094`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1527`
- Model MSE: `0.091816`
- Null MSE: `0.033218`
- Model MAE: `0.250007`
- Null MAE: `0.131679`
- Model corr: `0.038245`
- Null corr: `0.000000`
- Model standardized MSE: `5.431107`
- Null standardized MSE: `1.964939`
- Beats null MSE: `False`

## eeg_clean_windows

- Aggregate standardized model MSE: `7.997978`
- Aggregate standardized null MSE: `2.314777`
- Aggregate standardized model MAE: `2.172976`
- Aggregate standardized null MAE: `1.069718`
- Beats null standardized MSE: `False`

### mean_ibi_seconds

- Train windows: `1024`
- Eval windows: `1536`
- Model MSE: `0.092071`
- Null MSE: `0.041118`
- Model MAE: `0.222739`
- Null MAE: `0.165374`
- Model corr: `-0.276951`
- Null corr: `0.000000`
- Model standardized MSE: `4.391195`
- Null standardized MSE: `1.961082`
- Beats null MSE: `False`

### amplitude_range

- Train windows: `1024`
- Eval windows: `1536`
- Model MSE: `0.000049`
- Null MSE: `0.000011`
- Model MAE: `0.005679`
- Null MAE: `0.002211`
- Model corr: `-0.386767`
- Null corr: `0.000000`
- Model standardized MSE: `12.075057`
- Null standardized MSE: `2.809111`
- Beats null MSE: `False`

### rising_edge_slope_max

- Train windows: `1024`
- Eval windows: `1536`
- Model MSE: `0.000650`
- Null MSE: `0.000160`
- Model MAE: `0.020038`
- Null MAE: `0.008608`
- Model corr: `-0.368945`
- Null corr: `0.000000`
- Model standardized MSE: `9.012613`
- Null standardized MSE: `2.220334`
- Beats null MSE: `False`

### dominant_beat_amplitude

- Train windows: `1019`
- Eval windows: `1527`
- Model MSE: `0.000066`
- Null MSE: `0.000014`
- Model MAE: `0.006515`
- Null MAE: `0.002481`
- Model corr: `-0.338927`
- Null corr: `0.000000`
- Model standardized MSE: `11.678901`
- Null standardized MSE: `2.399406`
- Beats null MSE: `False`

### dominant_beat_rise_time_seconds

- Train windows: `1019`
- Eval windows: `1527`
- Model MSE: `0.055520`
- Null MSE: `0.028108`
- Model MAE: `0.185964`
- Null MAE: `0.134200`
- Model corr: `0.024670`
- Null corr: `0.000000`
- Model standardized MSE: `4.306188`
- Null standardized MSE: `2.180094`
- Beats null MSE: `False`

### dominant_beat_width_seconds

- Train windows: `1019`
- Eval windows: `1527`
- Model MSE: `0.049316`
- Null MSE: `0.033218`
- Model MAE: `0.170271`
- Null MAE: `0.131679`
- Model corr: `-0.058538`
- Null corr: `0.000000`
- Model standardized MSE: `2.917131`
- Null standardized MSE: `1.964939`
- Beats null MSE: `False`
