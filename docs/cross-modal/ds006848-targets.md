# DS006848 Target Derivation

Status: Active

## Purpose

This note defines the derived PPG target artifacts built on top of the `DS006848` Phase 2 window datasets.

It exists to keep Phase 2 and Phase 3 separate:

- Phase 2 builds paired EEG and PPG windows
- target derivation turns the PPG branch into explicit morphology and timing targets with validity masks
- Phase 3 consumes those targets for modeling

## Current target set

The current artifacts derive targets from `ppg_clean_windows`:

- `ppg_peak_count`
- `mean_ibi_seconds`
- `amplitude_range`
- `rising_edge_slope_max`
- `dominant_beat_amplitude`
- `dominant_beat_rise_time_seconds`
- `dominant_beat_width_seconds`
- `dominant_beat_fall_time_seconds`
- `dominant_beat_peak_time_seconds`
- `dominant_beat_notch_delay_seconds`

Each target also has a `*_valid` mask.

## Current coverage

Smoke-contract pilot result on the 2-subject split:

- quality-pass train windows: `256`
- quality-pass eval windows: `256`
- dominant-beat-valid train windows: `252`
- dominant-beat-valid eval windows: `256`
- notch-valid train windows: `28`
- notch-valid eval windows: `0`

First 4-subject development result:

- quality-pass train windows: `512`
- quality-pass eval windows: `512`
- dominant-beat-valid train windows: `508`
- dominant-beat-valid eval windows: `512`
- notch-valid train windows: `54`
- notch-valid eval windows: `0`

Current broader 8-subject development result:

- quality-pass train windows: `1024`
- quality-pass eval windows: `959`
- dominant-beat-valid train windows: `1019`
- dominant-beat-valid eval windows: `959`
- notch-valid train windows: `55`
- notch-valid eval windows: `123`

Current 2-subject rest smoke result:

- quality-pass train windows: `10`
- quality-pass eval windows: `10`
- dominant-beat-valid train windows: `10`
- dominant-beat-valid eval windows: `10`
- notch-valid train windows: `2`
- notch-valid eval windows: `0`

Practical interpretation:

- dominant-beat morphology targets remain dense even after the broader expansion
- unlike the 4-subject result, notch timing is no longer train-only, but coverage is still too sparse and uneven to promote as a primary target
- the main problem on the broader split is not target availability; it is the combination of eval quality attrition and cross-subject failure
- that broader failure now has an explicit cohort policy attached, with `sub-016` demoted to stress-test-only and `sub-017` retained as borderline-review
- the rest smoke branch is now target-complete at pilot scope, but still too small to treat as a modeling benchmark

## Commands

```powershell
python scripts/cross_modal/derive_ds006848_targets.py --config configs/cross_modal/ds006848_targets.toml
python scripts/cross_modal/validate_ds006848_targets.py --config configs/cross_modal/ds006848_targets.toml

python scripts/cross_modal/derive_ds006848_targets.py --config configs/cross_modal/ds006848_targets_expanded.toml
python scripts/cross_modal/validate_ds006848_targets.py --config configs/cross_modal/ds006848_targets_expanded.toml

python scripts/cross_modal/derive_ds006848_targets.py --config configs/cross_modal/ds006848_targets_broader.toml
python scripts/cross_modal/validate_ds006848_targets.py --config configs/cross_modal/ds006848_targets_broader.toml

python scripts/cross_modal/derive_ds006848_targets.py --config configs/cross_modal/ds006848_targets_rest.toml
python scripts/cross_modal/validate_ds006848_targets.py --config configs/cross_modal/ds006848_targets_rest.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_targets.toml](../../configs/cross_modal/ds006848_targets.toml)
- [../../reports/cross_modal/ds006848/ds006848_target_arrays.npz](../../reports/cross_modal/ds006848/ds006848_target_arrays.npz)
- [../../reports/cross_modal/ds006848/ds006848_target_coverage.json](../../reports/cross_modal/ds006848/ds006848_target_coverage.json)
- [../../reports/cross_modal/ds006848/ds006848_target_summary.md](../../reports/cross_modal/ds006848/ds006848_target_summary.md)
- [../../configs/cross_modal/ds006848_targets_expanded.toml](../../configs/cross_modal/ds006848_targets_expanded.toml)
- [../../reports/cross_modal/ds006848/ds006848_expanded_target_arrays.npz](../../reports/cross_modal/ds006848/ds006848_expanded_target_arrays.npz)
- [../../reports/cross_modal/ds006848/ds006848_expanded_target_coverage.json](../../reports/cross_modal/ds006848/ds006848_expanded_target_coverage.json)
- [../../reports/cross_modal/ds006848/ds006848_expanded_target_summary.md](../../reports/cross_modal/ds006848/ds006848_expanded_target_summary.md)
- [../../configs/cross_modal/ds006848_targets_broader.toml](../../configs/cross_modal/ds006848_targets_broader.toml)
- [../../reports/cross_modal/ds006848/ds006848_broader_target_arrays.npz](../../reports/cross_modal/ds006848/ds006848_broader_target_arrays.npz)
- [../../reports/cross_modal/ds006848/ds006848_broader_target_coverage.json](../../reports/cross_modal/ds006848/ds006848_broader_target_coverage.json)
- [../../reports/cross_modal/ds006848/ds006848_broader_target_summary.md](../../reports/cross_modal/ds006848/ds006848_broader_target_summary.md)
- [../../configs/cross_modal/ds006848_targets_rest.toml](../../configs/cross_modal/ds006848_targets_rest.toml)
- [../../reports/cross_modal/ds006848/ds006848_rest_target_arrays.npz](../../reports/cross_modal/ds006848/ds006848_rest_target_arrays.npz)
- [../../reports/cross_modal/ds006848/ds006848_rest_target_coverage.json](../../reports/cross_modal/ds006848/ds006848_rest_target_coverage.json)
- [../../reports/cross_modal/ds006848/ds006848_rest_target_summary.md](../../reports/cross_modal/ds006848/ds006848_rest_target_summary.md)
