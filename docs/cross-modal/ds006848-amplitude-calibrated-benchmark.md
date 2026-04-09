# DS006848 Amplitude Calibrated Benchmark

Status: Active

## Purpose

This note records the narrowed DS006848 benchmark that only scores the amplitude family under short subject calibration.

It exists because the first broader calibrated expansion showed:

- the full morphology aggregate is still brittle under subject expansion
- the amplitude family stays below null even when the timing family breaks

## Scope

The current benchmark is:

- source branch:
  - `eeg_clean_windows`
- mode:
  - `calibrated_absolute`
- target family:
  - `amplitude_range`
  - `rising_edge_slope_max`
  - `dominant_beat_amplitude`

The same calibration contract is kept:

- `32` calibration windows per eval subject
- real-unit scoring
- null baseline = per-subject calibration-mean predictor

## Intended role

This is now the stable near-term DS006848 benchmark.

Use it to answer:

- whether the subject-calibrated EEG->PPG path survives cautious cohort expansion
- whether amplitude-family morphology can be treated as the first real business-relevant success criterion

Do not treat it as a replacement for the full morphology benchmark. It is the narrower benchmark that currently survives wider subject expansion.

## Current result

On the cohort-swap split:

- best branch: `eeg_clean_windows`
- calibrated aggregate relative MSE: about `0.8743`
- aggregate delta relative MSE: about `-0.1257`

After adding `sub-011` to eval:

- best branch: `eeg_clean_windows`
- calibrated aggregate relative MSE: about `0.9017`
- aggregate delta relative MSE: about `-0.0983`

After adding the weak-amplitude `sub-025` stress-test subject to eval:

- best branch: `eeg_clean_windows`
- calibrated aggregate relative MSE: about `0.8753`
- aggregate delta relative MSE: about `-0.1247`
- this is effectively unchanged from the original cohort-swap run and slightly stronger than the `sub-011` expansion

Per-target reading on both runs:

- `amplitude_range` beats null
- `rising_edge_slope_max` beats null
- `dominant_beat_amplitude` is still close but remains slightly worse than null

## Practical conclusion

This is the first DS006848 benchmark that is both:

- subject-calibrated
- stable under two cautious cohort expansions

`sub-011` still blocks promotion into the default full-morphology calibrated cohort, and `sub-025` should still stay pending for full morphology because its waveform amplitude is weak. But neither subject now breaks the narrowed amplitude-family benchmark.

That makes this the right active benchmark for EEG-to-PPG work in this repo.

## Model-class comparison

The first direct model-class comparison on this benchmark is now complete.

A median-heuristic RBF-kernel calibrated baseline was tested on:

- the fixed cohort-swap benchmark
- the `sub-025` amplitude stress test

It did not beat the calibrated linear baseline on either run.

On both runs, the RBF aggregate relative MSE stays near `0.9986`, which is far worse than the current calibrated linear benchmark and effectively near-null.

So this note remains anchored to the calibrated linear path, not the nonlinear comparison path.

## Low-rank follow-on

The first low-rank follow-on is now complete.

Projecting EEG into a rank-64 low-rank space before the calibrated linear model improves the benchmark on both:

- the fixed cohort-swap split
- the `sub-025` amplitude stress test

So the active DS006848 amplitude reference should now move from full-resolution calibrated linear to low-rank calibrated linear on `eeg_clean_windows`.

## Commands

```powershell
python scripts/cross_modal/train_ds006848_calibrated_absolute_baseline.py --config configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_swap.toml
python scripts/cross_modal/validate_ds006848_calibrated_absolute_baseline.py --config configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_swap.toml

python scripts/cross_modal/train_ds006848_calibrated_absolute_baseline.py --config configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub011.toml
python scripts/cross_modal/validate_ds006848_calibrated_absolute_baseline.py --config configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub011.toml

python scripts/cross_modal/train_ds006848_calibrated_absolute_baseline.py --config configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub025.toml
python scripts/cross_modal/validate_ds006848_calibrated_absolute_baseline.py --config configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub025.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_swap.toml](../../configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_swap.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_absolute_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_absolute_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_absolute_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_absolute_amplitude_report.md)
- [../../configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub011.toml](../../configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub011.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_absolute_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_absolute_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_absolute_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_absolute_amplitude_report.md)
- [../../configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub025.toml](../../configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub025.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_absolute_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_absolute_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_absolute_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_absolute_amplitude_report.md)
