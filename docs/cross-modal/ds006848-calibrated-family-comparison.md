# DS006848 Calibrated Family Comparison

Status: Active

## Purpose

This note compares the calibrated absolute `eeg_clean -> PPG` path across the current DS006848 cohort variants.

It answers a narrower question than the main calibrated baseline:

- when the full morphology aggregate changes under cohort expansion, which target family actually breaks?

## Scope

Current comparison:

- mode: `calibrated_absolute`
- branch: `eeg_clean_windows`
- runs:
  - `cohort_swap`
  - `cohort_plus_sub011`
- target sets:
  - full morphology family
  - amplitude family
  - timing family

## Current result

On the current cohort-swap path:

- full aggregate relative MSE: about `0.9238`
- amplitude-family aggregate relative MSE: about `0.8743`
- timing-family aggregate relative MSE: about `0.9981`

After adding `sub-011` to eval:

- full aggregate relative MSE worsens to about `2.1957`
- amplitude-family aggregate relative MSE stays below null at about `0.9017`
- timing-family aggregate relative MSE collapses to about `4.1367`

Per-subject reading on the expanded cohort:

- `sub-011` is the dominant new timing-family failure
- `sub-011` timing-family relative MSE is about `14.4451`
- `sub-011` amplitude-family relative MSE is also worse than null at about `2.0505`
- the previously evaluated subjects keep the same family pattern as before

## Interpretation

This is a useful narrowing result:

- the calibrated DS006848 path does not fail uniformly when `sub-011` is added
- the main break is concentrated in the timing family, especially dominant-beat rise and width behavior
- the amplitude family remains the more stable near-term target set under calibrated subject expansion

## Practical conclusion

The DS006848 default policy should now be:

- do not promote `sub-011` into the default full-morphology calibrated cohort yet
- keep the current cohort-swap split as the reference calibrated positive path
- treat amplitude-family calibrated prediction as the stable near-term target family
- treat full calibrated morphology as still sensitive to subject expansion

## Commands

```powershell
python scripts/cross_modal/analyze_ds006848_calibrated_family_comparison.py --config configs/cross_modal/ds006848_calibrated_family_comparison.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_calibrated_family_comparison.toml](../../configs/cross_modal/ds006848_calibrated_family_comparison.toml)
- [../../reports/cross_modal/ds006848/ds006848_calibrated_family_comparison_metrics.json](../../reports/cross_modal/ds006848/ds006848_calibrated_family_comparison_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_calibrated_family_comparison_report.md](../../reports/cross_modal/ds006848/ds006848_calibrated_family_comparison_report.md)
