# DS004514 Cross-Modal Waveform Smoke Summary

Config: `configs/cross_modal/ds004514_cross_modal_waveform.toml`

## Overview

- subjects processed: 2
- train subjects: 1
- eval subjects: 1
- paired windows: 360
- eeg tensor shape: [360, 64, 1229]
- fnirs tensor shape: [360, 28, 78]
- max alignment RMSE (s): 0.037039

## Per-subject alignment

- sub-01 [train]: paired_windows=180, eeg_shape=[64, 1229], fnirs_shape=[28, 78], rmse=0.037039s, max_abs=0.064830s
- sub-03 [eval]: paired_windows=180, eeg_shape=[64, 1229], fnirs_shape=[28, 78], rmse=0.036930s, max_abs=0.065775s

## Notes

- This is the first true paired waveform artifact in the repo.
- It uses the event-alignment transform to bridge EEG and fNIRS timing instead of assuming shared file-start time.
- The scope is intentionally limited to the uniform fNIRS variant shared by `sub-01` and `sub-03`.
