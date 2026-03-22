# DS004514 EEG Waveform Smoke Summary

Config: `configs/cross_modal/ds004514_eeg_waveform.toml`

## Overview

- subjects processed: 2
- train subjects: 1
- eval subjects: 1
- image events indexed: 360
- raw sampling rates observed: 2048.0
- total raw channel counts observed: 80

## Per-subject metrics

- sub-01 [train]: sfreq=2048.0, raw_nchan=80, eeg_nchan=64, image_events=180, window_shape=[64, 1229], duration=4350.000s
- sub-03 [eval]: sfreq=2048.0, raw_nchan=80, eeg_nchan=64, image_events=180, window_shape=[64, 1229], duration=4291.000s

## Notes

- This stage validates real BDF loading and event-anchored waveform access on a laptop-safe two-subject subset.
- It avoids full-dataset EEG download while still proving the raw EEG branch is workable.
- The next step is to align these EEG waveform windows against the already-validated fNIRS waveform branch.
