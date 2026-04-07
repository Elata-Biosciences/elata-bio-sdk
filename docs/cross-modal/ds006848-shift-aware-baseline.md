# DS006848 Shift-Aware Baseline

Status: Active

## Purpose

This note records the first shift-aware EEG->PPG baseline on the `DS006848` cohort-swap split.

It answers a narrower question than the standard morphology baseline:

- the standard baseline asks whether EEG predicts absolute PPG targets zero-shot
- this shift-aware baseline asks whether subject-specific calibration or subject-normalized target space reveals learnable signal hidden by cross-subject scale mismatch

## Scope

Current diagnostic setup:

- dataset split:
  - train `sub-001`, `sub-010`, `sub-013`, `sub-015`
  - eval `sub-002`, `sub-007`, `sub-012`, `sub-035`
- source branches:
  - `eeg_event_windows`
  - `eeg_clean_windows`
- target families:
  - mean inter-beat interval
  - amplitude range
  - rising-edge slope max
  - dominant-beat amplitude
  - dominant-beat rise time
  - dominant-beat width
- evaluation modes:
  - `oracle_subject_zscore`
  - `calibrated_subject_zscore`

The calibrated mode uses `32` true-target windows per eval subject as a short calibration segment, then scores the remaining windows.

## Current result

Reference zero-shot cohort-swap result:

- best branch: `eeg_clean_windows`
- aggregate delta on the best branch: about `+1.6269`
- still worse than null

Oracle subject-zscore result:

- best branch: `eeg_clean_windows`
- aggregate delta: about `+0.9083`
- still worse than null

Calibrated subject-zscore result:

- best branch: `eeg_clean_windows`
- aggregate delta: about `-0.0083`
- this is the first DS006848 broader-split-style result that edges past null on the cohort-swap path

Per-target reading on calibrated `eeg_clean_windows`:

- `amplitude_range` beats null
- `rising_edge_slope_max` beats null
- `dominant_beat_amplitude` still does not
- timing-family targets still do not beat null overall

## Interpretation

This is the strongest current evidence that the project still has a viable path:

- pure subject filtering was not enough
- zero-shot absolute prediction is still not good enough
- but short subject-specific calibration plus target normalization does recover usable signal for part of the amplitude family

Important caution:

- this is still a diagnostic result, not a production claim
- the calibrated metric lives in a subject-normalized target space, not yet in the final absolute target space

## Practical conclusion

The project should now be read this way:

- broad zero-shot EEG->PPG morphology prediction is still unproven
- subject-calibrated EEG->PPG prediction looks materially more plausible than the zero-shot path
- that next sensible step is now complete in [ds006848-calibrated-absolute-baseline.md](ds006848-calibrated-absolute-baseline.md)
- the remaining next step is to expand the calibrated path carefully rather than jumping to a larger model

## Follow-on

The calibrated absolute-unit follow-on now shows:

- `calibrated_absolute` on `eeg_clean_windows` beats null on aggregate relative MSE on the cohort-swap split
- `amplitude_range`, `rising_edge_slope_max`, and `dominant_beat_rise_time_seconds` beat null in real units after short calibration

## Commands

```powershell
python scripts/cross_modal/train_ds006848_shift_aware_baseline.py --config configs/cross_modal/ds006848_shift_aware_baseline_cohort_swap.toml
python scripts/cross_modal/validate_ds006848_shift_aware_baseline.py --config configs/cross_modal/ds006848_shift_aware_baseline_cohort_swap.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_shift_aware_baseline_cohort_swap.toml](../../configs/cross_modal/ds006848_shift_aware_baseline_cohort_swap.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_shift_aware_baseline_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_swap_shift_aware_baseline_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_shift_aware_baseline_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_swap_shift_aware_baseline_report.md)
