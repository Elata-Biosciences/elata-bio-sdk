# DS006848 Split Plan

Status: Active

## Purpose

This note defines the practical split policy for the `DS006848` EEG-PPG path.

## Default full paired verbalwm cohort

Use subjects that satisfy:

- `participants.tsv -> EEG_excluded = no`

That is the default full verbalwm EEG+PPG pool of `30` subjects.

## Default rest subset

Use subjects that satisfy both:

- `participants.tsv -> EEG_excluded = no`
- `participants.tsv -> RS_excluded = no`

That is the default rest EEG+PPG subset of `22` subjects.

## Pilot Phase 2 split

The first executable Phase 2 artifact stays deliberately small because the raw BrainVision payloads are larger than the current `DS003838` pilot path.

- train: `sub-001`
- eval: `sub-007`
- task: `verbalwm`

Rationale:

- both subjects were source-checked for `task-verbalwm` presence in the shared BrainVision container
- both subjects also have `task-rest`, so they can anchor the later rest branch
- the first goal is to validate the direct BrainVision EEG+PPG path and morphology-quality metadata, not to claim a stable benchmark result yet

## Pilot rest Phase 2 split

The first executable rest artifact stays small and reuses the same anchored pair:

- train: `sub-001`
- eval: `sub-007`
- task: `rest`

Rationale:

- both subjects already anchor the verbalwm smoke contract
- both subjects have confirmed `task-rest` recordings in the shared BrainVision container
- the first goal is to validate rest-specific event anchors and paired window construction before deriving rest targets or broadening the rest cohort

## First verbalwm development split

The first broader development split was:

- train: `sub-001`, `sub-010`
- eval: `sub-007`, `sub-012`
- task: `verbalwm`

Rationale:

- it expands beyond the initial smoke contract without making local reruns impractical
- both eval subjects remain inside the `task-verbalwm` full paired cohort
- the split is large enough to test whether the initial positive EEG->PPG signal survives mild subject expansion
- it is still small enough to support slice analysis before committing to a broader cohort run

## Current broader verbalwm development split

The current broader development split is:

- train: `sub-001`, `sub-010`, `sub-013`, `sub-015`
- eval: `sub-007`, `sub-012`, `sub-016`, `sub-017`
- task: `verbalwm`

Rationale:

- it reuses the earlier DS006848 subjects so the result is directly comparable to the 4-subject check
- it adds four more rest-capable subjects rather than jumping immediately to the full cohort
- it is large enough to test whether the earlier DS006848 gain survives the next subject expansion
- it exposes real quality attrition in `sub-016` and `sub-017`, which is now part of the dataset story

## Rules

- do not treat the pilot split as the final benchmark split
- do treat the pilot split as the DS006848 smoke contract for Phase 2 EEG-PPG work
- do treat the current 2-subject rest split as the DS006848 rest smoke contract
- do treat the 8-subject verbalwm split as the current DS006848 development default
- do treat [ds006848-subject-quality-policy.md](ds006848-subject-quality-policy.md) as the current cohort gate for that development default
- do treat the earlier 4-subject split as a historical positive-check result, not the current benchmark
- do not treat the current rest split as a full rest benchmark; it is only the first rest Phase 2 branch
