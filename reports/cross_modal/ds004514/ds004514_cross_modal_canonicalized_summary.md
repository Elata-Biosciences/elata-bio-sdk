# DS004514 Canonicalized Cross-Modal Summary

Config: `configs/cross_modal/ds004514_cross_modal_canonicalized.toml`

## Overview

- subjects processed: 4
- train subjects: 2
- eval subjects: 2
- paired windows: 720
- canonical fNIRS channels: 12
- eeg tensor shape: [720, 64, 1229]
- fnirs tensor shape: [720, 12, 78]
- max alignment RMSE (s): 0.037039

## Canonical Channels

- `S1_D3 hbo`
- `S1_D3 hbr`
- `S2_D1 hbo`
- `S2_D1 hbr`
- `S3_D1 hbo`
- `S3_D1 hbr`
- `S3_D4 hbo`
- `S3_D4 hbr`
- `S4_D1 hbo`
- `S4_D1 hbr`
- `S6_D4 hbo`
- `S6_D4 hbr`

## Notes

- This artifact maps both fNIRS variants into a shared overlap-based channel space.
- The time axis is also canonicalized by resampling each fNIRS window to a common sample count.
