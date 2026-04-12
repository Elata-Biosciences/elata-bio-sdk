# DS006848 Phase 2 Windowing Summary

Config: `configs/cross_modal/ds006848_phase2_windows_cohort_plus_sub011_sub025.toml`

## Overview

- subjects processed: 10
- train subjects: 4
- eval subjects: 6
- task: `verbalwm`
- paired windows: 2560
- quality-pass windows: 2560
- eeg event tensor shape: [2560, 63, 500]
- eeg clean tensor shape: [2560, 63, 128]
- ppg native tensor shape: [2560, 2000]
- ppg clean tensor shape: [2560, 256]
- mean PPG peak count per window: 3.162

## Notes

- This Phase 2 artifact uses DS006848 task-verbalwm BrainVision recordings.
- EEG, PPG, and ECG come from the same task file, so alignment residual is zero by construction for this path.
- The raw/native PPG view stays at 1000 Hz to preserve morphology; the cleaned PPG view is a separate mild denoising branch.
