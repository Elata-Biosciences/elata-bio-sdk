# DS006848 Subject Quality Policy

Status: Active

## Purpose

This note makes the current `DS006848` verbalwm subject-quality policy explicit and machine-readable.

Related files:

- [../../configs/cross_modal/ds006848_subject_quality_policy.json](../../configs/cross_modal/ds006848_subject_quality_policy.json)
- [ds006848-baseline-analysis.md](ds006848-baseline-analysis.md)
- [ds006848-ppg-quality-review.md](ds006848-ppg-quality-review.md)
- [../../reports/cross_modal/ds006848/ds006848_phase2_broader_windows_metrics.json](../../reports/cross_modal/ds006848/ds006848_phase2_broader_windows_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_broader_baseline_analysis_metrics.json](../../reports/cross_modal/ds006848/ds006848_broader_baseline_analysis_metrics.json)
- [../../reports/cross_modal/ds006848/ds006848_ppg_quality_review_metrics.json](../../reports/cross_modal/ds006848/ds006848_ppg_quality_review_metrics.json)

## Scope

This policy is intentionally narrow for now:

- it covers the reviewed `8`-subject `verbalwm` development cohort
- it also marks the remaining `22` verbalwm subjects as `pending_review`
- it does not yet define the rest-branch cohort policy

## Policy tiers

Default train/eval pool:

- `sub-001`
- `sub-007`
- `sub-010`
- `sub-012`
- `sub-013`
- `sub-015`
- `sub-017`

Borderline review:

- `sub-017`

Stress-test only:

- `sub-016`

Pending review:

- `sub-002`
- `sub-003`
- `sub-004`
- `sub-005`
- `sub-006`
- `sub-008`
- `sub-009`
- `sub-011`
- `sub-018`
- `sub-020`
- `sub-021`
- `sub-022`
- `sub-023`
- `sub-024`
- `sub-025`
- `sub-026`
- `sub-027`
- `sub-028`
- `sub-031`
- `sub-032`
- `sub-034`
- `sub-035`

## Interpretation

- `default_train_eval` is the current reviewed cohort for DS006848 verbalwm baselines and slice analyses
- `borderline_review` subjects are still eligible, but their per-subject metrics should always be broken out explicitly
- `stress_test_only` subjects should not enter default training or evaluation unless the experiment is about robustness, denoising, or artifact correction
- `pending_review` subjects are not rejected; they simply have not yet been promoted into the reviewed default cohort

## Why this is explicit now

The broader DS006848 verbalwm pass already gave enough evidence to stop treating this as an open question:

- `sub-016` is the dominant failure case by a wide margin and also loses windows at the quality gate
- `sub-017` also loses windows at the quality gate and still underperforms, but not at the same severity
- the remaining reviewed subjects may still be difficult, but they do not currently justify automatic exclusion

The remaining work is no longer to define the reviewed verbalwm cohort. It is to:

- use the completed broader waveform-quality review to choose the first pending-review promotion experiment
- keep building the `22`-subject rest branch beyond the current smoke contract
- decide whether any `pending_review` subjects should be promoted into the default verbalwm pool after a model-aware follow-up

## Broader waveform-quality review result

The broader `12`-subject verbalwm waveform-quality pass did not overturn the current policy. It strengthened it.

What it reinforced:

- `sub-016` still looks like a stress-test subject, not a default-train subject
- `sub-017` still looks borderline rather than default-clean

What it added:

- the strongest pending-review promotion candidates are now `sub-002` and `sub-035`
- `sub-011` is a reasonable verbalwm-only secondary candidate, but not a rest candidate because `RS_excluded=yes`
- `sub-025` should stay pending because morphology amplitude remains weak even though the coarse quality-pass rate stays high

Operational reading:

- keep the machine-readable cohort policy unchanged for now
- use the waveform-quality review to decide the next cohort-swap experiment rather than promoting subjects blindly
