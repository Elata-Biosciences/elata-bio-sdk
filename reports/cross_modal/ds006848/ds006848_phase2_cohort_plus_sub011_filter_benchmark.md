# DS006848 Phase 2 Filter Benchmark

- Config: `configs/cross_modal/ds006848_phase2_windows_cohort_plus_sub011.toml`

## EEG cleaned path

- Path: `zero_phase_iir_notch_50hz_plus_resample_1000_to_256`

- 10.0 Hz: group_delay=0.000000s, attenuation=0.000 dB
- 20.0 Hz: group_delay=0.000000s, attenuation=-0.000 dB
- 40.0 Hz: group_delay=0.000000s, attenuation=-0.000 dB
- 50.0 Hz: group_delay=n/a, attenuation=-21.898 dB
- 80.0 Hz: group_delay=0.000000s, attenuation=-0.000 dB
- EEG burst RMSE vs resample-only: `0.006788`
- EEG average CPU ms per 63-channel window: `17.940`

## PPG cleaned path

- Path: `zero_phase_iir_notch_50hz_plus_bandpass_0p5_20hz_plus_resample_1000_to_128`

- 1.0 Hz: group_delay=0.000000s, attenuation=-0.010 dB
- 2.0 Hz: group_delay=0.000000s, attenuation=-0.003 dB
- 5.0 Hz: group_delay=0.000000s, attenuation=-0.004 dB
- 10.0 Hz: group_delay=0.000000s, attenuation=-0.020 dB
- 20.0 Hz: group_delay=0.000000s, attenuation=-6.003 dB
- 30.0 Hz: group_delay=0.000000s, attenuation=-23.924 dB
- 50.0 Hz: group_delay=n/a, attenuation=-21.084 dB
- PPG pulse rise-time error vs resample-only: `0.000000s`
- PPG pulse waveform RMSE vs resample-only: `0.039175`
- PPG average CPU ms per window: `4.311`
