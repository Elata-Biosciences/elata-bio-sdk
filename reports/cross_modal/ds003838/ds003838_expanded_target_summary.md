# DS003838 Target Derivation Summary

Config: `configs/cross_modal/ds003838_targets_expanded.toml`

## Coverage

- quality-pass train windows: 2048
- quality-pass eval windows: 2048
- dominant beat valid train windows: 2045
- dominant beat valid eval windows: 2046
- notch-valid train windows: 77
- notch-valid eval windows: 222

## Notes

- Beat-synchronous morphology targets are derived from the cleaned PPG branch so peak detection is stable while native morphology remains preserved in the Phase 2 artifact.
- Dominant-beat targets are conservative and require a plausible preceding trough, following trough, rise time, and width.
- Notch timing remains a masked diagnostic target; the current config still has sparse and uneven train-side notch coverage.
