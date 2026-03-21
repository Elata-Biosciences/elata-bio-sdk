# Phase 0 Reproducibility Checklist

Status: Active

## Purpose

Use this checklist before claiming any baseline or model result in the cross-modal biosignals program.

## Code and environment

- [ ] code revision is recorded
- [ ] local modifications are recorded if the tree is dirty
- [ ] dependency versions are recorded
- [ ] hardware summary is recorded
- [ ] random seed or seed policy is recorded

## Data versioning

- [ ] dataset manifest version is recorded
- [ ] preprocessing version is recorded
- [ ] split definition is recorded
- [ ] held-out subjects or sessions are recorded
- [ ] excluded windows or sessions are recorded with reasons

## Training configuration

- [ ] config file path is recorded
- [ ] override flags are recorded
- [ ] batch size is recorded
- [ ] learning-rate policy is recorded
- [ ] checkpoint selection rule is recorded

## Metric integrity

- [ ] required phase metrics are present
- [ ] optional metrics are marked optional rather than silently omitted
- [ ] missing metrics are called out explicitly
- [ ] confidence intervals or run-to-run variance are reported where available

## Split integrity

- [ ] no random window split leaked within a subject-session recording
- [ ] subject-held-out evaluation is present where required
- [ ] session-held-out evaluation is present where required
- [ ] temporal holdout is present where required

## Artifact logging

- [ ] report file is written
- [ ] metric summary file is written
- [ ] plots used in conclusions are saved
- [ ] checkpoint path or export path is saved when applicable

## Claim review

- [ ] claim language matches the evidence
- [ ] no result is reported as general if it only holds in toy mode
- [ ] no result is reported as robust if shift slices were not checked
- [ ] no result is reported as interpretable if latent tests were not run

## Minimum publishable packet

Before circulating a result internally, the following should exist together:

- [ ] one concise experiment summary
- [ ] one machine-readable metric summary
- [ ] one config snapshot
- [ ] one split definition reference
- [ ] one note on limitations or missing checks
