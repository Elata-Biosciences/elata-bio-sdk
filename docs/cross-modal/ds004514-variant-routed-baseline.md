# DS004514 Variant-Routed Baseline

Status: Active

## Purpose

This document describes the first executable answer to the remaining `DS004514` normalization problem.

Instead of forcing the `22`-channel and `28`-channel fNIRS cohorts into one tensor shape immediately, the baseline trains one EEG-to-fNIRS model per variant.

Related files:

- [../../configs/cross_modal/ds004514_variant_routed_baseline.toml](../../configs/cross_modal/ds004514_variant_routed_baseline.toml)
- [../../scripts/cross_modal/train_ds004514_variant_routed_baseline.py](../../scripts/cross_modal/train_ds004514_variant_routed_baseline.py)
- [../../scripts/cross_modal/validate_ds004514_variant_routed_baseline.py](../../scripts/cross_modal/validate_ds004514_variant_routed_baseline.py)

## Routing rule

- `variant28`: use the paired waveform artifact built from `sub-01` train and `sub-03` eval
- `variant22`: use the paired waveform artifact built from `sub-10` train and `sub-11` eval

Each variant gets its own linear dual-ridge regressor from flattened EEG windows to flattened fNIRS windows.

Current status:

- executable and validated as a routed negative-control baseline
- does not currently beat the constant null on held-out subjects
- still valuable because it makes the routing decision concrete in code

## Commands

Train the routed baseline:

```powershell
python scripts/cross_modal/train_ds004514_variant_routed_baseline.py --config configs/cross_modal/ds004514_variant_routed_baseline.toml
```

Validate the outputs:

```powershell
python scripts/cross_modal/validate_ds004514_variant_routed_baseline.py --config configs/cross_modal/ds004514_variant_routed_baseline.toml
```

Or use the package script:

```powershell
npm run cross-modal:ds004514:routed:all
```

## Why this matters

This is the first executable normalization policy in the repo.

It does not solve cross-variant canonicalization, but it does turn the design choice into code:

- route by observed variant first
- baseline each cohort separately
- only unify later if the routed baselines justify the extra complexity

## Interpretation

Treat this baseline as a floor, not as an expected production model.

If a future geometry-aware or adapter-based model cannot beat this routed baseline cleanly, the added complexity is not justified.
