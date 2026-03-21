# DS004514 Smoke Summary

Config: `configs/cross_modal/ds004514_smoke.toml`

## Overview

- subjects indexed: 12
- train subjects: 9
- eval subjects: 3
- canonical event windows: 26628
- max subject alignment RMSE (s): 0.037067
- max subject absolute residual (s): 0.067397

## Per-subject alignment

- sub-01 [train]: events=2219, rmse=0.037039s, max_abs=0.064830s, eeg_raw=False, fnirs_raw=False
- sub-02 [train]: events=2219, rmse=0.036641s, max_abs=0.064886s, eeg_raw=False, fnirs_raw=False
- sub-05 [train]: events=2219, rmse=0.037067s, max_abs=0.065037s, eeg_raw=False, fnirs_raw=False
- sub-06 [train]: events=2219, rmse=0.036915s, max_abs=0.067397s, eeg_raw=False, fnirs_raw=False
- sub-07 [train]: events=2219, rmse=0.032251s, max_abs=0.057020s, eeg_raw=False, fnirs_raw=False
- sub-08 [train]: events=2219, rmse=0.032409s, max_abs=0.056906s, eeg_raw=False, fnirs_raw=False
- sub-09 [train]: events=2219, rmse=0.032341s, max_abs=0.057033s, eeg_raw=False, fnirs_raw=False
- sub-10 [train]: events=2219, rmse=0.032344s, max_abs=0.058027s, eeg_raw=False, fnirs_raw=False
- sub-12 [train]: events=2219, rmse=0.032436s, max_abs=0.056661s, eeg_raw=False, fnirs_raw=False
- sub-03 [eval]: events=2219, rmse=0.036930s, max_abs=0.065775s, eeg_raw=False, fnirs_raw=False
- sub-04 [eval]: events=2219, rmse=0.036758s, max_abs=0.067057s, eeg_raw=False, fnirs_raw=False
- sub-11 [eval]: events=2219, rmse=0.032431s, max_abs=0.057378s, eeg_raw=False, fnirs_raw=False

## Notes

- This smoke path indexes canonical event-aligned windows from BIDS sidecars and event tables.
- It does not require heavyweight EEG raw downloads by default.
- Real signal-level baselines still require fetching `.bdf` and `.snirf` payloads.
