# DS003838 Target Derivation

Status: Active

## Purpose

This note defines the derived PPG target artifact built on top of the `DS003838` Phase 2 window dataset.

It exists to keep Phase 2 and Phase 3 separate:

- Phase 2 builds paired EEG and PPG windows
- target derivation turns the PPG branch into explicit morphology and timing targets with validity masks
- Phase 3 consumes those targets for modeling

## Current target set

The current artifact derives targets from `ppg_clean_windows`:

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

Current smoke-contract pilot result on the 4-subject split:

- quality-pass train windows: `1024`
- quality-pass eval windows: `1024`
- dominant-beat-valid train windows: `1024`
- dominant-beat-valid eval windows: `1022`
- notch-valid train windows: `11`
- notch-valid eval windows: `99`

Expanded development result on the 8-subject split:

- quality-pass train windows: `2048`
- quality-pass eval windows: `2048`
- dominant-beat-valid train windows: `2045`
- dominant-beat-valid eval windows: `2046`
- notch-valid train windows: `77`
- notch-valid eval windows: `222`

Practical interpretation:

- beat-synchronous morphology targets are viable on essentially the full current pilot split
- beat-synchronous morphology targets remain viable on essentially the full expanded split
- notch timing improves on the expanded split, but is still too sparse and too uneven across subjects to be a default baseline target
- the target artifact supports masked experiments without pretending every window has every target

## Commands

```powershell
python scripts/cross_modal/derive_ds003838_targets.py --config configs/cross_modal/ds003838_targets.toml
python scripts/cross_modal/validate_ds003838_targets.py --config configs/cross_modal/ds003838_targets.toml

python scripts/cross_modal/derive_ds003838_targets.py --config configs/cross_modal/ds003838_targets_expanded.toml
python scripts/cross_modal/validate_ds003838_targets.py --config configs/cross_modal/ds003838_targets_expanded.toml
```

## Artifacts

- [../../configs/cross_modal/ds003838_targets.toml](../../configs/cross_modal/ds003838_targets.toml)
- [../../reports/cross_modal/ds003838/ds003838_target_arrays.npz](../../reports/cross_modal/ds003838/ds003838_target_arrays.npz)
- [../../reports/cross_modal/ds003838/ds003838_target_coverage.json](../../reports/cross_modal/ds003838/ds003838_target_coverage.json)
- [../../reports/cross_modal/ds003838/ds003838_target_summary.md](../../reports/cross_modal/ds003838/ds003838_target_summary.md)
- [../../configs/cross_modal/ds003838_targets_expanded.toml](../../configs/cross_modal/ds003838_targets_expanded.toml)
- [../../reports/cross_modal/ds003838/ds003838_expanded_target_arrays.npz](../../reports/cross_modal/ds003838/ds003838_expanded_target_arrays.npz)
- [../../reports/cross_modal/ds003838/ds003838_expanded_target_coverage.json](../../reports/cross_modal/ds003838/ds003838_expanded_target_coverage.json)
- [../../reports/cross_modal/ds003838/ds003838_expanded_target_summary.md](../../reports/cross_modal/ds003838/ds003838_expanded_target_summary.md)
