# DS003838 Split Plan

Status: Active

## Purpose

This note defines the first practical split policy for the `DS003838` EEG-PPG path.

## Default full paired cohort

Use subjects that satisfy both:

- `participants.tsv -> EEG_excluded = no`
- `participants.tsv -> ECG_excluded = no`

That is the default full paired pool of `65` subjects.

## Pilot Phase 2 split

The first executable Phase 2 artifact uses a deliberately small pilot subset so iteration stays tractable while the EEGLAB/HDF5 path is still new.

- train: `sub-032`, `sub-034`
- eval: `sub-033`, `sub-035`
- task: `memory`

Rationale:

- all four subjects were source-checked for `task-memory` presence in both `eeg/` and `ecg/`
- event-table equality was confirmed on sampled subjects before implementation
- the earlier two-subject pilot was enough to prove the path, but too small for stable morphology baselines and notch-aware targets

## Expanded development split

The next DS003838 step keeps the pilot split intact as the smoke contract, but adds a broader development split for a more honest EEG-PPG check.

- train: `sub-032`, `sub-034`, `sub-036`, `sub-038`
- eval: `sub-033`, `sub-035`, `sub-039`, `sub-040`
- task: `memory`

Current result:

- `4096` paired windows
- `4096` quality-pass windows
- zero measured alignment residual in the current heuristic
- dominant-beat-valid windows: `4091`
- notch-valid windows: `299`

Practical interpretation:

- this split is still small enough to rerun locally, but large enough to invalidate the earlier assumption that the four-subject morphology result would automatically survive mild expansion
- the current linear ridge baseline no longer beats the null on aggregate standardized MSE on this split

## Rules

- do not treat the pilot split as the final benchmark split
- do treat the pilot split as the default smoke contract for Phase 2 EEG-PPG work
- do treat the expanded development split as the default next-step reality check before any deeper EEG->PPG model work
- expand to a larger leave-one-subject-out or grouped held-out protocol only after the first expanded development split is stable
