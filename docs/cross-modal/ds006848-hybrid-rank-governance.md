# DS006848 Hybrid Rank Governance

Status: Active

## Purpose

This note resolves the remaining DS006848 hybrid-policy question:

- keep separate hybrid ranks for amplitude and morphology
- or standardize on one shared hybrid rank for the active EEG->PPG path

The comparison uses the already-computed hybrid rank sweeps across:

- accepted amplitude cohort-swap
- accepted amplitude `sub-025` stress test
- timing-heavy amplitude `sub-011` stress test
- cohort-swap full morphology
- `cohort_plus_sub011` full morphology
- `cohort_plus_sub025` full morphology
- `cohort_plus_sub011_sub025` full morphology

## Policies compared

- `best_per_run`
- shared `rank 16`
- shared `rank 512`

## Current result

Policy summary:

- `best_per_run` mean primary relative MSE: about `0.8100`
- shared `rank 16` mean primary relative MSE: about `0.8105`
- shared `rank 512` mean primary relative MSE: about `1.1127`

Run coverage:

- shared `rank 16` keeps `7 / 7` tracked runs below null
- shared `rank 512` keeps only `5 / 7` tracked runs below null

Accepted amplitude tradeoff:

- cohort-swap amplitude:
  - best-per-run `0.7631`
  - shared `rank 16` `0.7659`
  - delta versus best: about `+0.0027`
- `cohort_plus_sub025` amplitude:
  - best-per-run `0.7658`
  - shared `rank 16` `0.7665`
  - delta versus best: about `+0.0008`

Stress and morphology tradeoff:

- `cohort_plus_sub011` amplitude:
  - best-per-run and shared `rank 16`: `0.7797`
  - shared `rank 512`: `0.8178`
- cohort-swap morphology:
  - shared `rank 16`: `0.8095`
  - shared `rank 512`: `0.9052`
- `cohort_plus_sub011` morphology:
  - shared `rank 16`: `0.8337`
  - shared `rank 512`: `1.8718`
- `cohort_plus_sub025` morphology:
  - shared `rank 16`: `0.8525`
  - shared `rank 512`: `0.9593`
- `cohort_plus_sub011_sub025` morphology:
  - shared `rank 16`: `0.8655`
  - shared `rank 512`: `1.7062`

Focused `sub-011` morphology read:

- shared `rank 16` full relative MSE: about `1.1747`
- shared `rank 512` full relative MSE: about `6.2837`

Focused `sub-025` morphology read:

- shared `rank 16` full relative MSE: about `1.1371`
- shared `rank 512` full relative MSE: about `1.7144`

## Interpretation

- the accepted amplitude cohorts do not justify keeping `rank 512` as a separate default because the `rank 16` loss there is negligible
- `rank 16` is already the best setting on the timing-heavy `sub-011` amplitude stress test
- `rank 16` is also the best setting on all four tracked morphology runs
- `rank 512` is not just unnecessary for the broader path; it becomes actively unsafe on the harder morphology expansion

So the rank question is now settled:

- keep the hybrid raw-plus-detail feature view
- retire the split-rank default
- standardize the active DS006848 hybrid benchmark on shared `rank 16`

## Recommendation

Treat shared hybrid raw-plus-detail `rank 16` on `eeg_clean_windows` as the active DS006848 EEG->PPG reference baseline for both:

- amplitude-family work
- full-morphology follow-ons

The next experiment should no longer be another rank sweep or another stress-only rerun. The combined `sub-011` plus `sub-025` full-morphology expansion now exists and stays below null on aggregate, so the next useful test is a promotion-oriented cohort decision under the fixed shared `rank 16` default.

## Commands

```powershell
python scripts/cross_modal/analyze_ds006848_hybrid_rank_governance.py --config configs/cross_modal/ds006848_hybrid_rank_governance.toml
```

## Artifacts

- [../../configs/cross_modal/ds006848_hybrid_rank_governance.toml](../../configs/cross_modal/ds006848_hybrid_rank_governance.toml)
- [../../reports/cross_modal/ds006848/ds006848_hybrid_rank_governance_metrics.json](../../reports/cross_modal/ds006848/ds006848_hybrid_rank_governance_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_hybrid_rank_governance_report.md](../../reports/cross_modal/ds006848/ds006848_hybrid_rank_governance_report.md)
