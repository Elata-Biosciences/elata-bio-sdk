# DS006848 Hybrid Morphology Family Comparison

Status: Active

## Purpose

This note records the first test of whether the hybrid raw-plus-detail EEG view helps the broader DS006848 timing-family and full-morphology failure, not just the narrowed amplitude benchmark.

## Scope

Feature view under test:

- raw `eeg_clean_windows`
- plus channel-preserving multiscale detail summaries

Runs:

- `cohort_swap`
- `cohort_plus_sub011`

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

Compared with older `cohort_plus_sub011` baselines:

- calibrated absolute full aggregate: about `2.1957`
- calibrated absolute timing-family aggregate: about `4.1367`
- calibrated low-rank full aggregate: about `1.0969`
- calibrated low-rank timing-family aggregate: about `1.1813`

Per-subject `sub-011` reading under the best hybrid rank:

- full relative MSE: about `1.1747`
- amplitude-family relative MSE: about `1.2620`
- timing-family relative MSE: about `1.0438`

## Interpretation

- the hybrid feature view does materially soften the broader DS006848 failure
- at the aggregate level, it pushes both full morphology and timing family below null even after adding `sub-011`
- that is a real change from the earlier calibrated absolute and low-rank predecessor baselines

The remaining caution is more specific:

- `sub-011` itself is still slightly above null on timing family and full morphology
- the feature view improves the problem a lot, but it does not erase the subject-specific difficulty entirely

There is also an operational detail:

- the best morphology rank is `16`
- the amplitude benchmark previously favored `512`
- so the feature view transfers, but the rank choice does not transfer cleanly

## Recommendation

Treat the hybrid raw-plus-detail feature view as the default DS006848 EEG feature view for both amplitude and morphology work.

The remaining rank question is now resolved by [DS006848 Hybrid Rank Governance](ds006848-hybrid-rank-governance.md):

- shared hybrid `rank 16` should replace the earlier split between amplitude `rank 512` and morphology `rank 16`

Do not yet promote `sub-011` into the default full-morphology cohort. The new blocker is cohort policy, not rank choice:

- aggregate recovery is now strong enough to justify continued full-morphology follow-on work
- `sub-011` itself is still slightly above null
- the next check should be the next cautious cohort expansion under the shared `rank 16` default

## Commands

```powershell
python scripts/cross_modal/train_ds006848_calibrated_low_rank_baseline.py --config configs/cross_modal/ds006848_calibrated_low_rank_morphology_cohort_swap.toml
python scripts/cross_modal/train_ds006848_calibrated_low_rank_baseline.py --config configs/cross_modal/ds006848_calibrated_low_rank_morphology_cohort_plus_sub011.toml
python scripts/cross_modal/train_ds006848_calibrated_hybrid_detail_baseline.py --config configs/cross_modal/ds006848_calibrated_hybrid_detail_morphology_cohort_swap.toml
python scripts/cross_modal/train_ds006848_calibrated_hybrid_detail_baseline.py --config configs/cross_modal/ds006848_calibrated_hybrid_detail_morphology_cohort_plus_sub011.toml
python scripts/cross_modal/analyze_ds006848_ranked_family_comparison.py --config configs/cross_modal/ds006848_hybrid_detail_family_comparison.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_hybrid_detail_family_comparison.toml](../../configs/cross_modal/ds006848_hybrid_detail_family_comparison.toml)
- [../../reports/cross_modal/ds006848/ds006848_hybrid_detail_family_comparison_metrics.json](../../reports/cross_modal/ds006848/ds006848_hybrid_detail_family_comparison_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_hybrid_detail_family_comparison_report.md](../../reports/cross_modal/ds006848/ds006848_hybrid_detail_family_comparison_report.md)
- [../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_hybrid_detail_morphology_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_hybrid_detail_morphology_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_hybrid_detail_morphology_metrics.json](../../reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_hybrid_detail_morphology_metrics.json)
