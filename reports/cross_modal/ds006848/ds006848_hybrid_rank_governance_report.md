# DS006848 Hybrid Rank Governance Report

- Label: `ds006848_hybrid_rank_governance`
- Best-reference policy: `best_per_run`

## Policy summary

| Policy | Mean primary relative MSE | Accepted amplitude mean | Stress amplitude mean | Morphology mean | Null-beating runs | Worst delta vs best |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| best_per_run | 0.790373 | 0.764471 | 0.779698 | 0.821614 | 5 / 5 | +0.000000 |
| shared_rank_16 | 0.791067 | 0.766205 | 0.779698 | 0.821614 | 5 / 5 | +0.002714 |
| shared_rank_512 | 1.024747 | 0.764471 | 0.817810 | 1.388491 | 4 / 5 | +1.038132 |

## Run details

### cohort_swap_amplitude

- Track: `accepted_amplitude`
- Primary target set: `amplitude_family`
- Source metrics: `reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_hybrid_detail_amplitude_metrics.json`

| Policy | Selected rank | Primary relative MSE | Beats null | Delta vs best |
| --- | ---: | ---: | ---: | ---: |
| best_per_run | 512 | 0.763147 | True | +0.000000 |
| shared_rank_16 | 16 | 0.765861 | True | +0.002714 |
| shared_rank_512 | 512 | 0.763147 | True | +0.000000 |

### cohort_plus_sub025_amplitude

- Track: `accepted_amplitude`
- Primary target set: `amplitude_family`
- Source metrics: `reports/cross_modal/ds006848/ds006848_cohort_plus_sub025_calibrated_hybrid_detail_amplitude_metrics.json`

| Policy | Selected rank | Primary relative MSE | Beats null | Delta vs best |
| --- | ---: | ---: | ---: | ---: |
| best_per_run | 512 | 0.765794 | True | +0.000000 |
| shared_rank_16 | 16 | 0.766548 | True | +0.000754 |
| shared_rank_512 | 512 | 0.765794 | True | +0.000000 |

### cohort_plus_sub011_amplitude

- Track: `stress_amplitude`
- Primary target set: `amplitude_family`
- Source metrics: `reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_hybrid_detail_amplitude_metrics.json`

| Policy | Selected rank | Primary relative MSE | Beats null | Delta vs best |
| --- | ---: | ---: | ---: | ---: |
| best_per_run | 16 | 0.779698 | True | +0.000000 |
| shared_rank_16 | 16 | 0.779698 | True | +0.000000 |
| shared_rank_512 | 512 | 0.817810 | True | +0.038112 |

### cohort_swap_morphology

- Track: `morphology`
- Primary target set: `full`
- Source metrics: `reports/cross_modal/ds006848/ds006848_cohort_swap_calibrated_hybrid_detail_morphology_metrics.json`

| Policy | Selected rank | Primary relative MSE | Beats null | Delta vs best |
| --- | ---: | ---: | ---: | ---: |
| best_per_run | 16 | 0.809535 | True | +0.000000 |
| shared_rank_16 | 16 | 0.809535 | True | +0.000000 |
| shared_rank_512 | 512 | 0.905157 | True | +0.095622 |

- `best_per_run` amplitude_family relative MSE: `0.765861`
- `best_per_run` timing_family relative MSE: `0.875046`

### cohort_plus_sub011_morphology

- Track: `morphology`
- Primary target set: `full`
- Source metrics: `reports/cross_modal/ds006848/ds006848_cohort_plus_sub011_calibrated_hybrid_detail_morphology_metrics.json`

| Policy | Selected rank | Primary relative MSE | Beats null | Delta vs best |
| --- | ---: | ---: | ---: | ---: |
| best_per_run | 16 | 0.833693 | True | +0.000000 |
| shared_rank_16 | 16 | 0.833693 | True | +0.000000 |
| shared_rank_512 | 512 | 1.871824 | False | +1.038132 |

- `best_per_run` amplitude_family relative MSE: `0.779698`
- `best_per_run` timing_family relative MSE: `0.914684`

Focused subject reads:

- `sub-011`: `best_per_run` full `1.174704`, `shared_rank_16` full `1.174704`, `shared_rank_512` full `6.283678`

## Interpretation

- shared `rank 16` keeps `5 / 5` tracked runs below null
- shared `rank 512` keeps `4 / 5` tracked runs below null
- shared `rank 16` average primary relative MSE is `0.791067` versus `1.024747` for shared `rank 512`
- the worst shared-`16` degradation versus per-run best is only `+0.002714`
- the worst shared-`512` degradation versus per-run best is `+1.038132`
