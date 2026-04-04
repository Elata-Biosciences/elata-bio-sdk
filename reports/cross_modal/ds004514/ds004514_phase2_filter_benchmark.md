# DS004514 Phase 2 Filter Benchmark

- Config: `configs/cross_modal/ds004514_phase2_windows.toml`
- Cleaned path: `zero_phase_iir_notch_60hz_plus_resample_2048_to_256`

## Frequency probes

- 10.0 Hz: group_delay=0.000000s, attenuation=-0.000 dB
- 20.0 Hz: group_delay=0.000000s, attenuation=-0.000 dB
- 40.0 Hz: group_delay=0.000000s, attenuation=0.000 dB
- 60.0 Hz: group_delay=n/a, attenuation=-25.732 dB
- 80.0 Hz: group_delay=0.000000s, attenuation=0.000 dB

## Transients

- Burst RMSE vs resample-only: `0.000035`
- Pulse rise-time error vs resample-only: `0.000000s`
- Pulse waveform RMSE vs resample-only: `0.000215`

## Compute

- Average notch CPU ms per 64-channel window: `19.853`
- Average resample CPU ms per 64-channel window: `5.807`
- Average combined CPU ms per 64-channel window: `25.612`
