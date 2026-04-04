# DS004514 Phase 2 Windowing

Status: Active

## Purpose

This is the first reusable Phase 2 artifact for `DS004514`.

It takes the canonicalized cross-variant path and emits one paired EEG-fNIRS window dataset with:

- event-preserving EEG windows at native rate
- cleaned EEG windows after explicit notch and resample
- canonicalized fNIRS HbO/HbR targets
- alignment metadata
- per-window quality flags

Related files:

- [../../configs/cross_modal/ds004514_phase2_windows.toml](../../configs/cross_modal/ds004514_phase2_windows.toml)
- [../../scripts/cross_modal/build_windows.py](../../scripts/cross_modal/build_windows.py)
- [../../scripts/cross_modal/validate_windows.py](../../scripts/cross_modal/validate_windows.py)
- [../../scripts/cross_modal/benchmark_filters.py](../../scripts/cross_modal/benchmark_filters.py)
- [../preprocessing-distortion-ledger.md](../preprocessing-distortion-ledger.md)

## Current scope

The current artifact is intentionally narrow:

- dataset: `DS004514`
- subjects: `sub-01`, `sub-03`, `sub-10`, `sub-11`
- event anchor: matched EEG/fNIRS image events
- EEG event view: native `2048 Hz`, `0.6 s`
- EEG cleaned view: zero-phase `60 Hz` notch plus resample to `256 Hz`
- fNIRS target: canonical overlap channel set, resampled to `78` samples per `10 s` window

This is enough to make Phase 2 concrete for the first paired public dataset without pretending the full program-level preprocessing stack already exists.

Current reference output:

- paired windows: `720`
- quality-pass windows: `720`
- EEG event tensor: `720 x 64 x 1229`
- EEG cleaned tensor: `720 x 64 x 154`
- fNIRS tensor: `720 x 12 x 78`
- max alignment RMSE: about `0.0370 s`
- reference runtime: about `120.33 s`
- peak traced memory: about `341.30 MB`

## Commands

Fetch the required raw files:

```powershell
python scripts/cross_modal/fetch_ds004514_assets.py --config configs/cross_modal/ds004514_phase2_windows.toml
```

Build the Phase 2 window artifact:

```powershell
python scripts/cross_modal/build_windows.py --config configs/cross_modal/ds004514_phase2_windows.toml
```

Validate the outputs:

```powershell
python scripts/cross_modal/validate_windows.py --config configs/cross_modal/ds004514_phase2_windows.toml
```

Benchmark the cleaned EEG path:

```powershell
python scripts/cross_modal/benchmark_filters.py --config configs/cross_modal/ds004514_phase2_windows.toml
```

## Promotion rule

This path should become the default `DS004514` Phase 2 dataset only if:

- the emitted windows remain alignment-safe
- the dual-view EEG outputs stay stable across reruns
- the cleaned EEG distortion report remains attached to the exact config version
- later baseline work uses this artifact instead of older smoke-only paired outputs

Current status:

- those conditions now hold for the current four-subject `DS004514` pilot path
- the remaining work is expanding this artifact deliberately, not inventing another parallel dataset path
