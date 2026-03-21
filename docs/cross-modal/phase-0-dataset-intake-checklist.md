# Phase 0 Dataset Intake Checklist

Status: Active

## Purpose

Use this checklist before a public or internal dataset is admitted into the cross-modal biosignals workflow.

## Dataset identity

- [ ] dataset name and version are recorded
- [ ] source URL or internal source location is recorded
- [ ] owner or maintainer is recorded
- [ ] license or use restriction is recorded
- [ ] commercial-use implications are reviewed

## Modality coverage

- [ ] EEG coverage is documented
- [ ] fNIRS coverage is documented
- [ ] PPG or BVP coverage is documented
- [ ] paired or tri-paired alignment is documented
- [ ] missing modalities are documented explicitly

## Timing and synchronization

- [ ] sampling rate per modality is recorded
- [ ] timestamp format and time base are documented
- [ ] known drift behavior is documented
- [ ] packet loss or missing-chunk behavior is documented
- [ ] synchronized start-stop behavior is documented

## Channel and geometry metadata

- [ ] EEG channel names and montage are recorded
- [ ] fNIRS source-detector geometry is recorded
- [ ] regional labels or coordinates are available
- [ ] channel-layout mismatches versus Athena are noted

## Signal quality and preprocessing history

- [ ] known quality flags are recorded
- [ ] clipping or saturation indicators are available if present
- [ ] motion indicators are available if present
- [ ] preprocessing already applied by the dataset is documented
- [ ] raw versus preprocessed availability is documented

## Labels and annotations

- [ ] task labels are documented
- [ ] event labels are documented
- [ ] beat or pulse annotations are documented if present
- [ ] missing-label regions are documented
- [ ] label quality or annotation source is documented

## Shift metadata

- [ ] age band or cohort descriptors are documented if allowed
- [ ] caffeine metadata is documented if available
- [ ] nicotine metadata is documented if available
- [ ] exercise metadata is documented if available
- [ ] session context such as rest, cognitive load, or affect is documented

## Storage and conversion readiness

- [ ] file formats are readable from the planned pipeline
- [ ] conversion path to canonical manifests is known
- [ ] intake can be represented using `docs/cross-modal/dataset-manifest-template.json`
- [ ] raw data stays out of git
- [ ] derived manifests and lightweight metadata can live in git

## Intake decision

- [ ] accepted for unimodal pretraining
- [ ] accepted for paired alignment
- [ ] accepted for held-out evaluation only
- [ ] rejected

## Intake notes

Use this section to record why the dataset was accepted, narrowed, or rejected.
