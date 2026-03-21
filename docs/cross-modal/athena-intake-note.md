# Athena Intake Note

Status: Active

## Purpose

This note records what the repository confirms locally about Athena and what still requires real device or internal dataset verification.

## Confirmed from local code

The following items are supported directly by the current repo:

- Athena protocol is distinct from classic Muse protocol.
- Athena EEG transport uses `8` channels at `256 Hz`.
- Athena EEG channel names used by the Web Bluetooth path are:
  - `TP9`
  - `AF7`
  - `AF8`
  - `TP10`
  - `AUX1`
  - `AUX2`
  - `AUX3`
  - `AUX4`
- Athena optics transport is present on the auxiliary characteristic.
- Athena optics transport has a nominal sample rate of `64 Hz`.
- Athena optics packet variants support `4`, `8`, or `16` channels depending on packet type.
- Athena acc/gyro transport is present with `6` channels at `52 Hz`.
- Battery samples are also decoded on the Athena auxiliary path.

Primary local sources:

- `crates/muse-proto/src/athena.rs`
- `packages/eeg-web-ble/src/museDevice.ts`
- `crates/eeg-wasm/src/athena.rs`

## Not confirmed from local code

The following items should not be treated as confirmed just because the product plan expects them:

- exact internal fNIRS derivation path from Athena optical channels
- HbO and HbR channel count after processing
- final fNIRS sampling rate after preprocessing
- exact PPG channel layout for Athena internal research recordings
- exact subject/session storage layout for internal Athena captures
- exact timestamp drift behavior on real internal recordings

## Intake implication

The Athena internal manifest is now partially populated with confirmed transport-level values, but it still needs real Phase 1 completion work:

1. verify internal storage and recording layout
2. verify real subject/session metadata fields
3. verify how optical channels map into the internal fNIRS processing pipeline
4. verify whether Athena internal recordings expose PPG as a distinct stream, a derived stream, or an optical subset
5. fill split counts after real ingest

## Current manifest

- [../../manifests/cross_modal/athena_internal.template.json](../../manifests/cross_modal/athena_internal.template.json)
