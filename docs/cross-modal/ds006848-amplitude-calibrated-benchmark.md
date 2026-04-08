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

Per-target reading on both runs:

- `amplitude_range` beats null
- `rising_edge_slope_max` beats null
- `dominant_beat_amplitude` is still close but remains slightly worse than null

## Practical conclusion

This is the first DS006848 benchmark that is both:

- subject-calibrated
- stable under the first cautious cohort expansion

That makes it the right near-term benchmark for EEG-to-PPG work in this repo.

## Commands

```powershell
python scripts/cross_modal/train_ds006848_calibrated_absolute_baseline.py --config configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_swap.toml
python scripts/cross_modal/validate_ds006848_calibrated_absolute_baseline.py --config configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_swap.toml

python scripts/cross_modal/train_ds006848_calibrated_absolute_baseline.py --config configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub011.toml
python scripts/cross_modal/validate_ds006848_calibrated_absolute_baseline.py --config configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub011.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_swap.toml](../../configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_swap.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_absolute_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_absolute_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_absolute_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_absolute_amplitude_report.md)
- [../../configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub011.toml](../../configs/cross_modal/ds006848_calibrated_absolute_amplitude_cohort_plus_sub011.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_absolute_amplitude_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_absolute_amplitude_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_absolute_amplitude_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_absolute_amplitude_report.md)
