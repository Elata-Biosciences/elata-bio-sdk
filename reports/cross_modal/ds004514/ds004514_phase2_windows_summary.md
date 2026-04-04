# DS004514 Phase 2 Windowing Summary

Config: `configs/cross_modal/ds004514_phase2_windows.toml`

## Overview

- subjects processed: 4
- train subjects: 2
- eval subjects: 2
- paired windows: 720
- quality-pass windows: 720
- eeg event tensor shape: [720, 64, 1229]
- eeg clean tensor shape: [720, 64, 154]
- fnirs tensor shape: [720, 12, 78]
- canonical fNIRS channels: 12
- max alignment RMSE (s): 0.037039

## Notes

- This is the first reusable Phase 2-style paired window artifact built from the DS004514 canonicalized path.
- The dataset carries both an event-preserving EEG view and a cleaned EEG view for side-by-side baseline comparisons.
- The cleaned EEG view currently uses zero-phase 60 Hz notch filtering plus 2048 Hz to 256 Hz resampling.
