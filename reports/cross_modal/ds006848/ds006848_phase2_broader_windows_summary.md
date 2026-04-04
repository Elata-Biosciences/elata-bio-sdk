# DS006848 Phase 2 Windowing Summary

Config: `configs/cross_modal/ds006848_phase2_windows_broader.toml`

## Overview

- subjects processed: 8
- train subjects: 4
- eval subjects: 4
- paired windows: 2048
- quality-pass windows: 1983
- eeg event tensor shape: [2048, 63, 500]
- eeg clean tensor shape: [2048, 63, 128]
- ppg native tensor shape: [2048, 2000]
- ppg clean tensor shape: [2048, 256]
- mean PPG peak count per window: 3.293

## Notes

- This pilot Phase 2 artifact uses DS006848 task-verbalwm BrainVision recordings.
- EEG, PPG, and ECG come from the same task file, so alignment residual is zero by construction for this path.
- The raw/native PPG view stays at 1000 Hz to preserve morphology; the cleaned PPG view is a separate mild denoising branch.
