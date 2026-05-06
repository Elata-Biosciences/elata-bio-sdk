# rPPG Model Evaluation And Selection

Status: maintainer-facing protocol for comparing deterministic and learned rPPG
models as the SDK improves. This document complements
[rppg-multi-roi-learned-reconstruction.md](rppg-multi-roi-learned-reconstruction.md)
and [implementation-plan-rppg.md](implementation-plan-rppg.md).

Consumer browser apps should continue to use
`@elata-biosciences/rppg-web` through `createRppgSession()` or
`createRppgAppAdapter()`.

## Purpose

As rPPG models improve, we need a stable way to answer:

- Did this model actually improve signal quality?
- Did it reduce bad BPM estimates or only change averages?
- Is it robust across subjects, devices, lighting, and activities?
- Is the confidence score trustworthy?
- Is the runtime cost acceptable for browser WASM?
- Should this model replace the current default, stay experimental, or be
  rejected?

Use a benchmark ledger and model-card mindset. Every candidate should leave a
reproducible result artifact, not only a screenshot or a single score.

## Candidate Types

Evaluate all model families with the same protocol where possible:

- current production aggregate pipeline
- GREEN baseline
- POS baseline
- CHROM baseline
- POS + CHROM + GREEN deterministic fusion
- three-region multi-ROI fusion
- 30-patch landmark fusion
- learned teacher models
- distilled student models
- calibration or tracker variants

The most important comparison is usually against the current production path and
the previous best candidate, not only against a weak baseline.

## Benchmark Sets

Keep fixed benchmark sets with different jobs:

**Development Set**

- Used for debugging and fast iteration.
- Can be inspected often.
- May include short clips and synthetic fixtures.
- Not used for final model selection.

**Validation Set**

- Used for model selection and threshold tuning.
- Should include representative activities and quality conditions.
- Can be inspected, but avoid overfitting thresholds to a few known failures.

**Locked Test Set**

- Used rarely for release decisions.
- Should not guide routine threshold tuning.
- Results should be recorded before changing defaults.

**Stress Set**

- Contains intentionally hard cases:
  - low light
  - glare
  - darker skin tones when available
  - talking
  - head rotation
  - translation
  - exercise or elevated motion
  - dropped frames
  - camera exposure shifts

Stress results should not automatically block all changes, but they should make
failure modes visible.

## Splits

Use splits that prevent accidental subject or session memorization:

- leave-one-subject-out
- leave-one-session-out
- leave-one-dataset-out when datasets permit
- leave-one-camera-or-device-out when available
- activity-specific splits

For learned models, validation and locked-test subjects must not appear in
training. If a teacher model uses a dataset for training, report separately on
in-dataset validation and out-of-dataset validation.

## Activity Buckets

Every aggregate result should also be broken down by activity:

- rest or steady
- talking
- translation
- rotation
- exercise or high motion
- mixed or unknown

Do not accept an average improvement if it hides a meaningful regression in
talking, rotation, or motion.

## Primary BPM Metrics

Record these for every candidate:

- mean absolute BPM error
- median absolute BPM error
- root mean squared BPM error
- P90 and P95 absolute BPM error
- percent of accepted windows within 3 BPM
- percent of accepted windows within 5 BPM
- percent of accepted windows within 10 BPM
- catastrophic error rate, such as `abs(error) > 15 BPM`
- null or rejected window rate
- warmup time to first publishable BPM
- accepted-window coverage
- total-window coverage

Separate accepted-window metrics from all-window metrics. A model that rejects
half the hard windows may look accurate on accepted windows while being poor for
product usability.

## Confidently Wrong Rate

Track confidently wrong estimates explicitly. This is often more important than
a small mean-error improvement.

Suggested definition:

```text
confidence >= 0.70 and abs(predicted_bpm - reference_bpm) > 10 BPM
```

Record:

- count
- rate over all windows
- rate over accepted windows
- examples with traces and diagnostics

Tune the exact confidence and error thresholds later, but keep the metric stable
within a benchmark report.

## Rejection And Coverage Metrics

Quality gating is part of the model. Record how often the model refuses to
publish:

- null BPM rate
- low-confidence rate
- low-SNR rejection rate
- motion rejection rate
- clipping rejection rate
- low-skin rejection rate
- model fallback rate
- deterministic fallback rate for learned models

Also record the tradeoff curve:

```text
confidence threshold -> accepted-window rate -> BPM error -> confidently-wrong rate
```

This makes threshold changes comparable.

## Waveform Metrics

For waveform reconstruction models, BPM error is not enough. Record:

- Pearson correlation against contact PPG
- aligned RMSE after cross-correlation
- Dynamic Time Warping distance
- spectral peak agreement
- waveform periodicity
- beat-to-beat interval agreement when beat labels are reliable
- SNR or SQI improvement over baseline
- morphology notes for visible failures

Use aligned metrics because contact PPG and rPPG may be shifted by sensor delay,
capture timing, or preprocessing. Always report the alignment method.

## Confidence Calibration Metrics

Confidence should mean something.

Record:

- error by confidence bucket
- accepted-window rate by confidence bucket
- expected calibration error if available
- calibration curve data
- average confidence for correct windows
- average confidence for catastrophic-error windows

Useful buckets:

```text
[0.0, 0.2)
[0.2, 0.4)
[0.4, 0.6)
[0.6, 0.8)
[0.8, 1.0]
```

A candidate should not ship as the default if its high-confidence bucket is not
meaningfully safer than its low-confidence bucket.

## Runtime Metrics

Record runtime cost for browser/WASM candidates:

- mean inference latency
- P95 inference latency
- CPU time per frame or update
- memory usage
- WASM bundle size impact
- JavaScript bundle size impact
- initialization time
- warmup time to first valid metric
- frame drops or capture-loop pressure
- browser and device class

Report latency separately for:

- TypeScript capture and ROI extraction
- WASM sample ingestion
- Rust signal processing
- learned model inference
- total update path

The learned student model should be comfortably cheaper than canvas capture and
MediaPipe FaceMesh.

## Stratification

Every benchmark report should include breakdowns by:

- dataset
- subject
- session
- activity
- skin tone when available and ethically usable
- lighting condition when available
- camera model or source
- fps and resolution
- ROI mode
- model family
- browser/device class

Do not collapse everything into one average until the breakdown has been
reviewed.

## Model Selection Rules

Use a Pareto decision, not a single leaderboard score.

A candidate must:

- not regress locked-test catastrophic error rate
- not increase confidently wrong rate
- stay within latency and bundle budgets
- preserve or improve coverage at comparable error
- improve validation P90/P95 error or rejection behavior
- work on held-out subjects
- for learned models, improve out-of-dataset or leave-one-subject validation
  over deterministic fusion

Prefer:

- lower P90/P95 error over tiny mean-error gains
- fewer confidently wrong estimates over more aggressive publishing
- stable confidence calibration over higher raw confidence
- interpretable deterministic fusion until learned models clearly outperform it

Suggested product weighting for model selection:

```text
35% confidently wrong rate
25% P90/P95 BPM error
20% rejection and coverage behavior
10% waveform quality
10% runtime cost
```

The weights are a guide. If a candidate creates a major safety or trust
regression, reject it even if the weighted score improves.

## Benchmark Result Artifact

Every benchmark run should produce a directory like:

```text
benchmarks/rppg-results/
  2026-05-06-model-name/
    run.json
    aggregate_metrics.json
    stratified_metrics.csv
    per_window_predictions.csv
    calibration_curve.csv
    runtime_metrics.json
    failure_examples.md
    model_card.md
```

These files do not all need to live in git. Large raw artifacts can be stored in
external artifact storage, but the format should remain stable.

## Run Metadata

Record this in `run.json`:

- run ID
- timestamp
- git commit
- branch
- package versions
- Rust crate versions
- WASM build hash
- model name
- model version
- model artifact hash
- feature schema version
- benchmark harness version
- dataset IDs
- split names
- preprocessing settings
- ROI mode
- candidate methods enabled
- thresholds
- browser/device details for runtime runs
- command used to run the benchmark

## Per-Window Prediction Table

The per-window table is the most valuable artifact. It allows later analysis
without reprocessing video.

Recommended columns:

```text
run_id
dataset_id
subject_id
session_id
clip_id
activity
window_start_ms
window_end_ms
model_name
model_version
roi_mode
reference_bpm
predicted_bpm
abs_error_bpm
confidence
signal_quality
snr
accepted
rejection_reason
fallback_reason
motion_mean
skin_ratio_mean
clip_ratio_mean
winning_sources
roi_weights_json
candidate_bpm_json
candidate_quality_json
waveform_quality
runtime_ms
```

For learned models, add:

```text
teacher_model_version
student_model_version
feature_schema_version
model_uncertainty
distillation_target
```

## Aggregate Metrics

Record aggregate metrics for:

- all windows
- accepted windows only
- rejected windows only where meaningful
- each dataset
- each activity
- each subject
- each ROI mode
- each browser/device class for runtime benchmarks

Aggregate metrics should include counts. A mean without the number of windows is
not useful.

## Failure Examples

Keep a short `failure_examples.md` for each important run.

Include:

- worst catastrophic failures
- high-confidence wrong windows
- cases where new model improved over baseline
- cases where new model regressed
- notes on likely cause:
  - motion
  - lighting
  - low skin ratio
  - clipping
  - ROI tracking failure
  - harmonic confusion
  - model fallback

Do not rely only on visual inspection, but do keep enough examples for humans to
understand the failure modes.

## Model Card

Each candidate model should have a model card:

- model name
- model family
- intended use
- non-goals
- training data summary
- validation data summary
- feature schema
- runtime requirements
- default thresholds
- known strengths
- known weaknesses
- fairness or coverage notes
- benchmark summary
- release decision

For learned models, include:

- teacher architecture
- student architecture
- distillation method
- loss functions
- alignment method
- model size
- inference cost

## Release Decision Labels

Use explicit labels:

**Rejected**

- Regresses safety, robustness, or runtime.
- Keep result for historical comparison.

**Research Only**

- Interesting improvement, but not stable enough for SDK users.

**Experimental Opt-In**

- Safe enough for controlled testing behind a flag.
- Not default.

**Default Candidate**

- Beats current default on validation and passes locked-test checks.
- Needs final review before release.

**Default**

- Shipped behavior.
- Must have rollback path and release notes.

## Minimum Bar For Enabling A Learned Student Model

A learned student model should not become default unless it:

- beats deterministic fusion on held-out subjects
- does not regress locked-test catastrophic error
- reduces confidently wrong estimates or improves coverage at equal error
- has calibrated confidence or clear deterministic gating
- falls back safely when out of distribution
- has stable runtime cost on target browsers/devices
- records model and feature schema versions in diagnostics

If it only improves average BPM MAE by a small amount, keep it experimental.

## Practical First Milestone

Before training learned models, build a deterministic benchmark harness that can
compare:

1. current production aggregate path
2. GREEN baseline
3. POS baseline
4. three-region multi-ROI POS fusion
5. three-region POS + CHROM + GREEN fusion

That gives the learned reconstruction work a real bar to clear.

## Summary

The SDK should select models by reliability, calibration, and runtime behavior,
not only by average BPM error. Record raw per-window predictions, stratified
metrics, failure examples, runtime costs, and model-card metadata for every
candidate. This makes progressive rPPG improvements comparable, reversible, and
honest.
