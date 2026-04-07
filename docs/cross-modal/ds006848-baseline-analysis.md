# DS006848 Baseline Analysis

Status: Active

## Purpose

This note records the explicit slice-analysis passes on the `DS006848` EEG-PPG verbalwm splits.

It exists to answer:

- whether the aggregate result is broad or concentrated in a narrow slice
- which subjects and target families are carrying the current gain or failure
- whether `eeg_event` or `eeg_clean` should be the default source branch

## Current result

Current broader-split finding:

- the `8`-subject verbalwm development split stays clean enough to analyze, but no EEG branch beats the null on aggregate standardized MSE
- `eeg_clean_windows` is now the least-bad branch
- the dominant error concentration is still in the amplitude-style target family
- the earlier 4-subject DS006848 win does not survive the next subject expansion
- the reviewed cohort now has an explicit subject-quality policy:
  - `sub-016` is stress-test-only
  - `sub-017` is borderline-review

Subject-level interpretation on the recommended `eeg_clean_windows` branch:

- `sub-016` is the dominant failure case by a wide margin
- `sub-017` is also worse than null, though much less severely than `sub-016`
- `sub-012` is close to neutral overall and still retains some dominant-beat-amplitude gain
- `sub-007` is worse than null across the aggregate, with amplitude-family losses dominating

Quality-slice interpretation:

- all peak-count slices are now worse than null
- all `ppg_clean_std` quartiles are also worse than null, though the highest quartile is closest to neutral
- broader DS006848 failure is therefore not confined to one trivial quality bucket
- the broader split also introduces visible quality attrition:
  - `sub-016` keeps `235 / 256` eval windows
  - `sub-017` keeps `212 / 256` eval windows

Shift interpretation:

- unlike the earlier 4-subject result, broader DS006848 failure is not dominated by a simple train-to-eval mean shift
- amplitude-family targets still show the largest variance mismatch, but overall mean shifts are modest
- that points more strongly to subject-specific quality and morphology variation than to one obvious global distribution-shift bug

Historical note:

- the earlier 4-subject DS006848 split was still useful
- it showed that a narrow aggregate win was possible
- the broader split now shows that that win was not robust enough to justify deeper modeling yet

Current cohort-swap finding:

- the first model-aware cohort swap keeps the reviewed train side fixed and replaces eval `sub-016` and `sub-017` with pending-review shortlist subjects `sub-002` and `sub-035`
- the swapped split stays fully clean:
  - `2048 / 2048` quality-pass windows
  - `1020` dominant-beat-valid eval windows
- `eeg_clean_windows` remains the least-bad branch
- the branch still does not beat null on aggregate standardized MSE
- but the failure is much smaller than on the reviewed broader split:
  - aggregate standardized delta on `eeg_clean` drops from about `26.16` to about `1.63`

Subject-level interpretation on the cohort-swap `eeg_clean_windows` branch:

- `sub-002` is close to neutral overall and now shows a small timing-family gain
- `sub-012` stays close to neutral overall and still retains dominant-beat-amplitude gain
- `sub-007` remains meaningfully worse than null, driven mostly by amplitude-family loss
- `sub-035` is much cleaner than `sub-016`, but still worse than null overall

Shift interpretation on the cohort-swap split:

- the catastrophic broader failure was substantially amplified by bad-subject selection, especially `sub-016`
- after removing that failure mode, the remaining issue looks more like amplitude-family scale mismatch across subjects than like a broken data path
- mean and variance shifts are still largest for:
  - `amplitude_range`
  - `rising_edge_slope_max`
  - `dominant_beat_amplitude`

## Practical conclusion

The current `DS006848` result is now better characterized:

- the data path is working
- the target artifact is not sparse for the dominant-beat family
- the earlier aggregate win was not stable under the next subject expansion
- the cohort-swap run shows that subject filtering matters, but is not enough on its own
- the next best step is a shift-aware or scale-robust baseline on the cohort-swap split, not a deeper model

At this point, both `DS003838` and broader `DS006848` act more like stress-test datasets than positive baselines.

## Commands

```powershell
python scripts/cross_modal/analyze_ds006848_baseline.py --config configs/cross_modal/ds006848_baseline_analysis_expanded.toml
python scripts/cross_modal/validate_ds006848_baseline_analysis.py --config configs/cross_modal/ds006848_baseline_analysis_expanded.toml

python scripts/cross_modal/analyze_ds006848_baseline.py --config configs/cross_modal/ds006848_baseline_analysis_broader.toml
python scripts/cross_modal/validate_ds006848_baseline_analysis.py --config configs/cross_modal/ds006848_baseline_analysis_broader.toml

python scripts/cross_modal/analyze_ds006848_baseline.py --config configs/cross_modal/ds006848_baseline_analysis_cohort_swap.toml
python scripts/cross_modal/validate_ds006848_baseline_analysis.py --config configs/cross_modal/ds006848_baseline_analysis_cohort_swap.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_baseline_analysis_expanded.toml](../../configs/cross_modal/ds006848_baseline_analysis_expanded.toml)
- [../../reports/cross_modal/ds006848/ds006848_expanded_baseline_analysis_metrics.json](../../reports/cross_modal/ds006848/ds006848_expanded_baseline_analysis_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_expanded_baseline_analysis_report.md](../../reports/cross_modal/ds006848/ds006848_expanded_baseline_analysis_report.md)
- [../../configs/cross_modal/ds006848_baseline_analysis_broader.toml](../../configs/cross_modal/ds006848_baseline_analysis_broader.toml)
- [../../reports/cross_modal/ds006848/ds006848_broader_baseline_analysis_metrics.json](../../reports/cross_modal/ds006848/ds006848_broader_baseline_analysis_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_broader_baseline_analysis_report.md](../../reports/cross_modal/ds006848/ds006848_broader_baseline_analysis_report.md)
- [../../configs/cross_modal/ds006848_baseline_analysis_cohort_swap.toml](../../configs/cross_modal/ds006848_baseline_analysis_cohort_swap.toml)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_baseline_analysis_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_swap_baseline_analysis_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_baseline_analysis_report.md](../../reports/cross_modal/ds006848/ds006848_cohort_swap_baseline_analysis_report.md)
