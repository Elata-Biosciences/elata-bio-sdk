# DS003838 Phase 2 Windowing Summary

Config: `configs/cross_modal/ds003838_phase2_windows_expanded.toml`

## Overview

- subjects processed: 8
- train subjects: 4
- eval subjects: 4
- paired windows: 4096
- quality-pass windows: 4096
- eeg event tensor shape: [4096, 63, 500]
- eeg clean tensor shape: [4096, 63, 128]
- ppg native tensor shape: [4096, 2000]
- ppg clean tensor shape: [4096, 256]
- max alignment abs residual (s): 0.000000
- mean PPG peak count per window: 3.377

## Notes

- This pilot Phase 2 artifact uses matched DS003838 task-memory EEG and cardiovascular event tables.
- The PPG target is extracted from the cardiovascular container rather than a dedicated BIDS ppg/ subtree.
- The raw/native PPG view stays at 1000 Hz to preserve morphology; the cleaned PPG view is a separate mild denoising branch.
