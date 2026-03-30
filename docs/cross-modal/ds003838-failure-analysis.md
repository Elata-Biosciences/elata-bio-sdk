# DS003838 Expanded Failure Analysis

Status: Active

## Purpose

This note records the first explicit failure-analysis pass on the expanded `DS003838` EEG-PPG split.

It exists to answer the question raised by the 8-subject result:

- was the earlier morphology signal only a tiny-pilot artifact
- which subjects and target families are driving the expanded-split failure
- whether `eeg_clean` should remain the default source branch

## Current result

Current expanded-split finding:

- the `8`-subject development split stays clean at the data, alignment, and target-coverage levels
- `eeg_clean_windows` is the least-bad branch and remains the default source branch
- neither branch beats null on aggregate standardized MSE
- the remaining positive signal is narrow and amplitude-heavy rather than timing-heavy

Subject-level interpretation on the recommended `eeg_clean_windows` branch:

- `sub-033` is strongly shifted in amplitude-like targets relative to train and still shows some amplitude-family gains, but timing-family losses dominate
- `sub-039` is the clearest failure case; it has the largest aggregate loss and broad degradation across both amplitude and timing families
- `sub-040` is near-neutral on the amplitude family and still shows a small dominant-beat-amplitude gain
- `sub-035` is relatively low-variance, but the model still underperforms null overall

Quality-slice interpretation:

- the failure is not explained by peak-count slices alone
- the highest `ppg_clean_std` quartile is the only quality slice where the recommended branch is slightly better than null on aggregate standardized MSE
- the lower three `ppg_clean_std` quartiles remain clearly worse than null

Shift interpretation:

- amplitude-like targets show much larger train-to-eval distribution shift than timing-style targets
- the strongest shift is concentrated in `sub-033`, especially for `amplitude_range`, `rising_edge_slope_max`, and `dominant_beat_amplitude`
- timing targets are not sparse, but they still do not produce a useful baseline signal on the expanded split

## Practical conclusion

The current `DS003838` result is now better characterized:

- the problem is not missing data access
- the problem is not target sparsity for the dominant-beat family
- the problem is not just one bad ridge setting
- the problem is that the simple linear baseline is not robust enough under mild subject expansion

That means the next best step is no longer another blind `DS003838` baseline tweak. It is:

1. expand the `DS006848` verbalwm path beyond the current 2-subject pilot now that the target artifact exists
2. reuse the same Phase 2, target, and analysis structure there
3. compare whether the failure pattern is dataset-specific or generic

## Commands

```powershell
python scripts/cross_modal/analyze_ds003838_failure.py --config configs/cross_modal/ds003838_failure_analysis_expanded.toml
python scripts/cross_modal/validate_ds003838_failure_analysis.py --config configs/cross_modal/ds003838_failure_analysis_expanded.toml
```

## Artifacts

- [../../configs/cross_modal/ds003838_failure_analysis_expanded.toml](../../configs/cross_modal/ds003838_failure_analysis_expanded.toml)
- [../../reports/cross_modal/ds003838/ds003838_expanded_failure_analysis_metrics.json](../../reports/cross_modal/ds003838/ds003838_expanded_failure_analysis_metrics.json)
- [../../reports/cross_modal/ds003838/ds003838_expanded_failure_analysis_report.md](../../reports/cross_modal/ds003838/ds003838_expanded_failure_analysis_report.md)
