# DS006848 Target Derivation Summary

Config: `configs/cross_modal/ds006848_targets_expanded.toml`

## Coverage

- quality-pass train windows: 512
- quality-pass eval windows: 512
- dominant beat valid train windows: 508
- dominant beat valid eval windows: 512
- notch-valid train windows: 54
- notch-valid eval windows: 0

## Notes

- Beat-synchronous morphology targets are derived from the cleaned PPG branch so peak detection is stable while native morphology remains preserved in the Phase 2 artifact.
- DS006848 target derivation runs on a shared BrainVision-file pilot, so target coverage is not confounded by cross-file synchronization failure.
- Notch timing remains a masked diagnostic target until coverage is shown to be stable under subject expansion.
