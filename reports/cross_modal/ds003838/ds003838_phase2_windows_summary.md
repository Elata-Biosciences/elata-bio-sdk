# DS003838 Phase 2 Windowing Summary

Config: `configs/cross_modal/ds003838_phase2_windows.toml`

## Overview

- subjects processed: 4
- train subjects: 2
- eval subjects: 2
- paired windows: 2048
- quality-pass windows: 2048
- eeg event tensor shape: [2048, 63, 500]
- eeg clean tensor shape: [2048, 63, 128]
- ppg native tensor shape: [2048, 2000]
- ppg clean tensor shape: [2048, 256]
- max alignment abs residual (s): 0.000000
- mean PPG peak count per window: 3.361

## Notes

- This pilot Phase 2 artifact uses matched DS003838 task-memory EEG and cardiovascular event tables.
- The PPG target is extracted from the cardiovascular container rather than a dedicated BIDS ppg/ subtree.
- The raw/native PPG view stays at 1000 Hz to preserve morphology; the cleaned PPG view is a separate mild denoising branch.
