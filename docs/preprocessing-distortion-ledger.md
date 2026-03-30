# Preprocessing Distortion Ledger

Status: Active

## Purpose

This ledger records measured distortion for preprocessing paths that the repo is treating as candidate defaults.

No preprocessing path should be treated as neutral until it has an entry here.

## Current entries

### DS004514 cleaned EEG Phase 2 path

- Config: [ds004514_phase2_windows.toml](c:/Users/cwhit/Documents/elata-bio-sdk/configs/cross_modal/ds004514_phase2_windows.toml)
- Benchmark script: [benchmark_filters.py](c:/Users/cwhit/Documents/elata-bio-sdk/scripts/cross_modal/benchmark_filters.py)
- Report: [ds004514_phase2_filter_benchmark.md](c:/Users/cwhit/Documents/elata-bio-sdk/reports/cross_modal/ds004514/ds004514_phase2_filter_benchmark.md)
- Metrics: [ds004514_phase2_filter_benchmark.json](c:/Users/cwhit/Documents/elata-bio-sdk/reports/cross_modal/ds004514/ds004514_phase2_filter_benchmark.json)

Path under test:

- zero-phase `60 Hz` IIR notch
- resample `2048 Hz -> 256 Hz`

Required review points for this entry:

- group delay at `10`, `20`, `40`, `60`, and `80 Hz`
- attenuation relative to resample-only baseline
- transient burst distortion
- pulse rise-time and waveform error
- CPU cost per 64-channel window

Current measured result:

- near-zero measured group delay at `10`, `20`, `40`, and `80 Hz` relative to the resample-only baseline
- `60 Hz` attenuation of about `-25.732 dB`; group delay at the notch frequency is treated as not meaningful once the tone is strongly suppressed
- transient burst RMSE of about `0.000035` versus resample-only
- pulse rise-time error of `0.000000 s` versus resample-only
- pulse waveform RMSE of about `0.000215` versus resample-only
- average CPU cost per 64-channel window:
  - notch: about `19.853 ms`
  - resample: about `5.807 ms`
  - combined cleaned path: about `25.612 ms`

### DS003838 pilot EEG-PPG Phase 2 paths

- Config: [ds003838_phase2_windows.toml](c:/Users/cwhit/Documents/elata-bio-sdk/configs/cross_modal/ds003838_phase2_windows.toml)
- Benchmark script: [benchmark_ds003838_filters.py](c:/Users/cwhit/Documents/elata-bio-sdk/scripts/cross_modal/benchmark_ds003838_filters.py)
- Report: [ds003838_phase2_filter_benchmark.md](c:/Users/cwhit/Documents/elata-bio-sdk/reports/cross_modal/ds003838/ds003838_phase2_filter_benchmark.md)
- Metrics: [ds003838_phase2_filter_benchmark.json](c:/Users/cwhit/Documents/elata-bio-sdk/reports/cross_modal/ds003838/ds003838_phase2_filter_benchmark.json)

Paths under test:

- EEG cleaned path:
  - zero-phase `60 Hz` IIR notch
  - resample `1000 Hz -> 256 Hz`
- PPG cleaned path:
  - zero-phase `60 Hz` IIR notch
  - zero-phase IIR bandpass `0.5-20 Hz`
  - resample `1000 Hz -> 128 Hz`

Required review points for this entry:

- EEG delay and attenuation at `10`, `20`, `40`, `60`, and `80 Hz`
- PPG delay and attenuation at `1`, `2`, `5`, `10`, `20`, `30`, and `60 Hz`
- EEG transient burst distortion
- PPG pulse rise-time and waveform error
- CPU cost per EEG and PPG window

Current measured result:

- EEG cleaned path:
  - near-zero measured group delay at `10`, `20`, `40`, and `80 Hz`
  - `60 Hz` attenuation of about `-20.604 dB`
  - transient burst RMSE of about `0.000035` versus resample-only
  - average CPU cost of about `18.417 ms` per `63`-channel window
- PPG cleaned path:
  - near-zero measured group delay at `1-30 Hz` relative to resample-only
  - about `-0.010 dB` at `1 Hz`, `-0.003 dB` at `2 Hz`, `-0.004 dB` at `5 Hz`, `-0.020 dB` at `10 Hz`
  - about `-6.004 dB` at `20 Hz`, `-23.809 dB` at `30 Hz`, and `-19.574 dB` at `60 Hz`
  - pulse rise-time error of `0.000000 s` versus resample-only
  - pulse waveform RMSE of about `0.039175` versus resample-only
  - average CPU cost of about `4.242 ms` per window

## Rule

If a cleaned path changes, its distortion report must be regenerated before that path is treated as the current default.
