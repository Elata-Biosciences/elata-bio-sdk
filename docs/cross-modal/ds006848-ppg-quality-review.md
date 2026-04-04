# DS006848 PPG Quality Review

Status: Active

## Purpose

This note summarizes the broader morphology-grade raw PPG quality review on a representative `DS006848` verbalwm subset.

It exists to answer a narrower question than the baseline-analysis docs:

- baseline analysis asks whether EEG predicts PPG targets well enough to beat null
- this review asks which subjects actually have morphology-grade PPG worth admitting into the default verbalwm cohort

## Reviewed subset

- task: `verbalwm`
- subjects reviewed: `12`
- reviewed subjects:
  - `sub-001`
  - `sub-002`
  - `sub-007`
  - `sub-010`
  - `sub-011`
  - `sub-012`
  - `sub-013`
  - `sub-015`
  - `sub-016`
  - `sub-017`
  - `sub-025`
  - `sub-035`

## Aggregate result

- sampled windows: `1536`
- quality-pass windows: `1509`
- dominant-beat-valid windows: `1526`
- notch-valid windows: `131`

Practical reading:

- morphology-grade raw PPG is available for most of this representative subset
- the broader DS006848 verbalwm problem is not caused by a universal lack of usable PPG
- the weak subjects line up with the same cases that already hurt the broader baseline pass

## Strongest reviewed subjects

- `sub-012`
- `sub-002`
- `sub-015`
- `sub-013`

Important interpretation:

- `sub-012`, `sub-015`, and `sub-013` reinforce the current reviewed cohort
- `sub-002` is the strongest pending-review verbalwm promotion candidate from this pass

## Weakest reviewed subjects

- `sub-017`
- `sub-016`
- `sub-025`

Interpretation:

- `sub-017` remains borderline because waveform quality is materially weaker than the default cohort
- `sub-016` remains stress-test-only; the waveform review agrees with the broader baseline failure
- `sub-025` should stay pending and should not be promoted on waveform quality alone

## Pending-review guidance

This pass is enough to create a shortlist, but not enough to change the machine-readable cohort policy by itself.

Current recommendation:

- first promotion candidates:
  - `sub-002`
  - `sub-035`
- verbalwm-only secondary candidate:
  - `sub-011`
- keep pending:
  - `sub-025`

Why `sub-011` is secondary:

- waveform quality is acceptable
- but `RS_excluded=yes`, so it is not a candidate for the rest branch

## Commands

```powershell
python scripts/cross_modal/fetch_ds006848_assets.py --config configs/cross_modal/ds006848_ppg_quality_review.toml
python scripts/cross_modal/review_ds006848_ppg_quality.py --config configs/cross_modal/ds006848_ppg_quality_review.toml
python scripts/cross_modal/validate_ds006848_ppg_quality.py --config configs/cross_modal/ds006848_ppg_quality_review.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_ppg_quality_review.toml](../../configs/cross_modal/ds006848_ppg_quality_review.toml)
- [../../reports/cross_modal/ds006848/ds006848_ppg_quality_fetch_report.json](../../reports/cross_modal/ds006848/ds006848_ppg_quality_fetch_report.json)
- [../../reports/cross_modal/ds006848/ds006848_ppg_quality_review_metrics.json](../../reports/cross_modal/ds006848/ds006848_ppg_quality_review_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_ppg_quality_review_report.md](../../reports/cross_modal/ds006848/ds006848_ppg_quality_review_report.md)
