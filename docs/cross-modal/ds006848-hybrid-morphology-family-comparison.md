# DS006848 Hybrid Morphology Family Comparison

Status: Active

## Purpose

This note tracks whether the hybrid raw-plus-detail EEG view continues to help the broader DS006848 timing-family and full-morphology problem, not just the narrowed amplitude benchmark.

## Scope

Feature view under test:

- raw `eeg_clean_windows`
- plus channel-preserving multiscale detail summaries

Runs:

- `cohort_swap`
- `cohort_plus_sub011`
- `cohort_plus_sub025`
- `cohort_plus_sub011_sub025`

Families:

- full morphology aggregate
- amplitude family
- timing family

## Current result

On the hybrid cohort-swap run:

- best rank: `16`
- full aggregate relative MSE: about `0.8095`
- amplitude-family aggregate relative MSE: about `0.7659`
- timing-family aggregate relative MSE: about `0.8750`

On the hybrid `cohort_plus_sub011` run:

- best rank: `16`
- full aggregate relative MSE: about `0.8337`
- amplitude-family aggregate relative MSE: about `0.7797`
- timing-family aggregate relative MSE: about `0.9147`

On the hybrid `cohort_plus_sub025` run:

- best rank: `16`
- full aggregate relative MSE: about `0.8525`
- amplitude-family aggregate relative MSE: about `0.7665`
- timing-family aggregate relative MSE: about `0.9815`

On the hybrid `cohort_plus_sub011_sub025` run:

- best rank: `16`
- full aggregate relative MSE: about `0.8655`
- amplitude-family aggregate relative MSE: about `0.7803`
- timing-family aggregate relative MSE: about `0.9932`

Compared with split-matched `cohort_plus_sub011_sub025` predecessors:

- calibrated absolute full aggregate: about `1.9785`
- calibrated low-rank full aggregate: about `1.0863`

Compared with older `cohort_plus_sub011` baselines:

- calibrated absolute full aggregate: about `2.1957`
- calibrated absolute timing-family aggregate: about `4.1367`
- calibrated low-rank full aggregate: about `1.0969`
- calibrated low-rank timing-family aggregate: about `1.1813`

Per-subject `sub-011` reading under the best hybrid rank:

- full relative MSE: about `1.1747`
- amplitude-family relative MSE: about `1.2620`
- timing-family relative MSE: about `1.0438`

Per-subject `sub-025` reading under the best hybrid rank:

- full relative MSE: about `1.1371`
- amplitude-family relative MSE: about `1.0552`
- timing-family relative MSE: about `1.2599`

## Interpretation

- the hybrid feature view does materially soften the broader DS006848 failure
- at the aggregate level, it keeps full morphology below null on all four tracked cohort variants
- it also keeps timing family below null on all four tracked cohort variants, but the combined `cohort_plus_sub011_sub025` run is only marginal at about `0.9932`
- on that combined run, the timing-family survival is carried by `dominant_beat_width_seconds`; `dominant_beat_rise_time_seconds` is still slightly above null at about `1.0049`
- that is a real change from the earlier calibrated absolute and low-rank predecessor baselines
- the combined stress-test run matters because it shows the aggregate benchmark survives `sub-011` and `sub-025` together, not only one at a time

The remaining caution is more specific:

- `sub-011` itself is still slightly above null on timing family and full morphology
- `sub-025` itself is also still above null on full morphology, with timing as the weaker side
- the feature view improves the problem a lot, but it does not erase the subject-specific difficulty entirely

## Recommendation

Treat the hybrid raw-plus-detail feature view as the default DS006848 EEG feature view for both amplitude and morphology work.

The remaining rank question is now resolved by [DS006848 Hybrid Rank Governance](ds006848-hybrid-rank-governance.md):

- shared hybrid `rank 16` should replace the earlier split between amplitude `rank 512` and morphology `rank 16`

Do not yet promote `sub-011` into the default full-morphology cohort. The new blocker is cohort policy, not rank choice:

- aggregate recovery is now strong enough to justify continued full-morphology follow-on work
- `sub-011` and `sub-025` are both still individually above null
- the next check should be a promotion-oriented cohort decision around cleaner candidates such as `sub-002` and `sub-035`, not another stress-only rerun

## Commands

```powershell
python scripts/cross_modal/train_ds006848_calibrated_low_rank_baseline.py --config configs/cross_modal/ds006848_calibrated_low_rank_morphology_cohort_swap.toml
python scripts/cross_modal/train_ds006848_calibrated_low_rank_baseline.py --config configs/cross_modal/ds006848_calibrated_low_rank_morphology_cohort_plus_sub011.toml
python scripts/cross_modal/train_ds006848_calibrated_low_rank_baseline.py --config configs/cross_modal/ds006848_calibrated_low_rank_morphology_cohort_plus_sub025.toml
python scripts/cross_modal/train_ds006848_calibrated_low_rank_baseline.py --config configs/cross_modal/ds006848_calibrated_low_rank_morphology_cohort_plus_sub011_sub025.toml
python scripts/cross_modal/train_ds006848_calibrated_hybrid_detail_baseline.py --config configs/cross_modal/ds006848_calibrated_hybrid_detail_morphology_cohort_swap.toml
python scripts/cross_modal/train_ds006848_calibrated_hybrid_detail_baseline.py --config configs/cross_modal/ds006848_calibrated_hybrid_detail_morphology_cohort_plus_sub011.toml
python scripts/cross_modal/train_ds006848_calibrated_hybrid_detail_baseline.py --config configs/cross_modal/ds006848_calibrated_hybrid_detail_morphology_cohort_plus_sub025.toml
python scripts/cross_modal/train_ds006848_calibrated_hybrid_detail_baseline.py --config configs/cross_modal/ds006848_calibrated_hybrid_detail_morphology_cohort_plus_sub011_sub025.toml
python scripts/cross_modal/analyze_ds006848_ranked_family_comparison.py --config configs/cross_modal/ds006848_hybrid_detail_family_comparison.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_hybrid_detail_family_comparison.toml](../../configs/cross_modal/ds006848_hybrid_detail_family_comparison.toml)
- [../../reports/cross_modal/ds006848/ds006848_hybrid_detail_family_comparison_metrics.json](../../reports/cross_modal/ds006848/ds006848_hybrid_detail_family_comparison_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_hybrid_detail_family_comparison_report.md](../../reports/cross_modal/ds006848/ds006848_hybrid_detail_family_comparison_report.md)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_hybrid_detail_morphology_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_hybrid_detail_morphology_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_hybrid_detail_morphology_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_hybrid_detail_morphology_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_hybrid_detail_morphology_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_hybrid_detail_morphology_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_sub025_calibrated_hybrid_detail_morphology_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_sub025_calibrated_hybrid_detail_morphology_metrics.json)
