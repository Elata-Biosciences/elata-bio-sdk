# Phase 0A Local Prototype Path

Status: Active

## Purpose

This document defines the first toy-mode execution path for the cross-modal biosignals program. It is intentionally synthetic and dependency-light so researchers can validate the repo workflow before private data and heavier models are introduced.

The manifest emitted by this path follows the shared contract described in [dataset-manifest-contract.md](dataset-manifest-contract.md).

## Commands

Build the toy dataset:

```powershell
python scripts/cross_modal/make_toy_subset.py --config configs/cross_modal/proto_cpu.toml
```

Run the smoke-test train and evaluation path:

```powershell
python scripts/cross_modal/train_proto.py --config configs/cross_modal/proto_cpu.toml
```

Validate the toy-mode artifacts:

```powershell
python scripts/cross_modal/validate_toy_run.py --config configs/cross_modal/proto_cpu.toml
```

Single-command local path:

```powershell
npm run cross-modal:toy:all
```

Alternative if you prefer the workspace package manager explicitly:

```powershell
corepack pnpm run cross-modal:toy:all
```

Optional larger local variant:

```powershell
python scripts/cross_modal/make_toy_subset.py --config configs/cross_modal/proto_gpu_small.toml
python scripts/cross_modal/train_proto.py --config configs/cross_modal/proto_gpu_small.toml
```

## Outputs

- dataset JSON under `reports/cross_modal/toy/`
- manifest JSON under `reports/cross_modal/toy/`
- Markdown smoke report under `reports/cross_modal/toy/`
- JSON metric summary under `reports/cross_modal/toy/`

## What this path does

- builds a tiny synthetic multimodal dataset with subject, session, protocol, shift metadata, and held-out subjects
- writes a lightweight toy manifest that mirrors the future dataset contract more closely
- trains a smoke-test `EEG -> fNIRS` linear model
- trains a smoke-test `EEG + fNIRS -> PPG morphology` linear model
- compares each model against a null mean baseline
- records runtime and peak memory for toy-mode tracking
- validates the output contract explicitly

## What this path does not do yet

- use Athena recordings
- implement real preprocessing
- implement real event annotations
- run deep models
- exercise deployment code paths

## Acceptance target

The `proto_cpu` path should finish in a short local feedback loop and always emit:

- one dataset artifact
- one manifest artifact
- one Markdown report
- one JSON metric summary

Reference run observed on March 21, 2026 on this workspace:

- runtime: about `2.3s`
- peak memory: about `0.21 MB`
