# DS006848 Target Derivation Summary

Config: `configs/cross_modal/ds006848_targets_cohort_plus_sub025.toml`

## Coverage

- quality-pass train windows: 1024
- quality-pass eval windows: 1280
- dominant beat valid train windows: 1019
- dominant beat valid eval windows: 1273
- notch-valid train windows: 55
- notch-valid eval windows: 32

## Notes

- Beat-synchronous morphology targets are derived from the cleaned PPG branch so peak detection is stable while native morphology remains preserved in the Phase 2 artifact.
- DS006848 target derivation runs on a shared BrainVision-file pilot, so target coverage is not confounded by cross-file synchronization failure.
- Notch timing remains a masked diagnostic target until coverage is shown to be stable under subject expansion.
