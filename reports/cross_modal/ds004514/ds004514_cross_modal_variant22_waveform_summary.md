# DS004514 Cross-Modal Waveform Smoke Summary

Config: `configs/cross_modal/ds004514_cross_modal_waveform_variant22.toml`

## Overview

- subjects processed: 2
- train subjects: 1
- eval subjects: 1
- paired windows: 360
- eeg tensor shape: [360, 64, 1229]
- fnirs tensor shape: [360, 22, 89]
- max alignment RMSE (s): 0.032431

## Per-subject alignment

- sub-10 [train]: paired_windows=180, eeg_shape=[64, 1229], fnirs_shape=[22, 89], rmse=0.032344s, max_abs=0.058027s
- sub-11 [eval]: paired_windows=180, eeg_shape=[64, 1229], fnirs_shape=[22, 89], rmse=0.032431s, max_abs=0.057378s

## Notes

- This is the first true paired waveform artifact in the repo.
- It uses the event-alignment transform to bridge EEG and fNIRS timing instead of assuming shared file-start time.
- The scope is intentionally limited to the uniform fNIRS variant shared by `sub-01` and `sub-03`.
