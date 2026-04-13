# Athena Phase 2 Windowing Smoke Summary

Config: `configs/cross_modal/athena_phase2_fixture.toml`

## Overview

- sessions processed: 2
- train subjects: 1
- eval subjects: 1
- paired windows: 2
- quality-pass windows: 2
- inherited Athena Phase 1 blockers: 3
- eeg event tensor shape: [2, 8, 512]
- eeg clean tensor shape: [2, 8, 128]
- optics transport tensor shape: [2, 8, 128]
- ppg native tensor shape: [2, 128]
- ppg clean tensor shape: [2, 64]
- minimum shared overlap (s): 1.984375
- maximum timestamp-step jitter (s): 0.000001
- mean PPG peak count per window: 3.000

## Notes

- This is a transport-level Athena smoke artifact built from the standardized session-export contract, not a canonical Athena fNIRS/HbO/HbR dataset.
- The optics branch is intentionally preserved as `optics_transport_windows` because the internal fNIRS processing path is still unconfirmed.
- The fixture now contains short synthetic captures so the repo can exercise timestamp alignment, tensor shaping, and QC logic before real internal recordings are mounted.
- This artifact is suitable for Athena Phase 2 contract validation and lightweight encoder smoke work, but not for claims about held-out physiology.
