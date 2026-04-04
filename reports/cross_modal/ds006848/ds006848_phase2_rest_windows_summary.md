# DS006848 Phase 2 Windowing Summary

Config: `configs/cross_modal/ds006848_phase2_windows_rest.toml`

## Overview

- subjects processed: 2
- train subjects: 1
- eval subjects: 1
- task: `rest`
- paired windows: 20
- quality-pass windows: 20
- eeg event tensor shape: [20, 63, 500]
- eeg clean tensor shape: [20, 63, 128]
- ppg native tensor shape: [20, 2000]
- ppg clean tensor shape: [20, 256]
- mean PPG peak count per window: 3.150

## Notes

- This Phase 2 artifact uses DS006848 task-rest BrainVision recordings.
- EEG, PPG, and ECG come from the same task file, so alignment residual is zero by construction for this path.
- The raw/native PPG view stays at 1000 Hz to preserve morphology; the cleaned PPG view is a separate mild denoising branch.
