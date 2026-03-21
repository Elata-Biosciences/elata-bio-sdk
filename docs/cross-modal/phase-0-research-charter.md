# Phase 0 Research Charter

Status: Active

## Purpose

This charter locks the initial scope, success conditions, and stop conditions for the cross-modal biosignals program so that Phase 1 starts from stable assumptions rather than open-ended exploration.

## Locked decisions

### Primary task

- First translation task: `EEG -> fNIRS`
- Initial target granularity: region-level `HbO` and `HbR`
- Initial success condition: beat simple null and lagged linear baselines on held-out subjects or sessions

### Secondary tasks

- `EEG + fNIRS -> PPG` event and morphology prediction
- `EEG -> PPG` embedding prediction as a weaker comparison task
- State targets such as `HR` and `HRV` are derived or predicted only after morphology-level signals are shown to be learnable

### Non-goals for the initial program

- no clinical claims
- no public-scale "foundation model" positioning
- no giant end-to-end tri-modal model trained from scratch
- no shipping SDK integration before research value is proven

## Benchmark rules

### Required splits

- leave-one-subject-out
- leave-one-session-out
- temporal holdout within subject

### Forbidden shortcut

- no random train-test split over windows from the same subject-session recording

### Reporting order

Every major report should present:

1. preprocessing and data quality status
2. baseline results
3. learned-model results
4. stratified error under shift or quality buckets

## Artifact and configuration policy

### Source of truth

- implementation plan: [../implementation-plan-cross-modal-biosignals.md](../implementation-plan-cross-modal-biosignals.md)
- phase artifacts: `docs/cross-modal/`
- future experiment configs: `configs/cross_modal/`
- future reports: `reports/cross_modal/`

### What belongs in git

- manifests
- configs
- scripts
- lightweight reports
- metric summaries

### What does not belong in git

- raw internal Athena recordings
- large public dataset blobs
- model checkpoints unless they are intentionally published and small enough

## Experiment tracking decision

Phase 0 decision:

- start with file-based experiment tracking that writes structured reports and metric summaries to `reports/cross_modal/`
- add hosted experiment tracking later only if local tracking slows the team down

Minimum required metadata for every run:

- code version
- config version
- dataset manifest version
- seed
- split definition
- preprocessing version
- host hardware summary

## Kill criteria

The project should stop, narrow, or pivot if any of the following remain true after the corresponding baseline work is complete:

- `EEG -> fNIRS` does not beat a null baseline after data alignment and preprocessing are verified
- preprocessing distortion is high enough that event-preserving and cleaned paths disagree in ways that invalidate the target
- toy-mode execution cannot run locally in a short feedback loop
- subject leakage dominates the apparent signal
- cross-modal gains disappear under held-out-subject evaluation

## Exit criteria for Phase 0

Phase 0 is complete when all of the following are true:

- the first task and secondary tasks are locked
- benchmark rules are written down
- metric definitions exist
- dataset intake criteria exist
- reproducibility criteria exist
- toy-mode constraints are written down

## Open questions carried into Phase 1

- what exact Athena timestamp and packet-loss behaviors need correction at ingest time
- what public datasets survive license review and channel-geometry compatibility review
- how much event-level labeling can be obtained or approximated with pseudo-labels
