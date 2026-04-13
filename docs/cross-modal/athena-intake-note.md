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

## New pilot prep path

The repo now also has a runnable Athena pilot intake path built around a standardized session-export contract:

- recording-spec contract: [athena-recording-spec.md](athena-recording-spec.md)
- prep config: [../../configs/cross_modal/athena_prepare_fixture.toml](../../configs/cross_modal/athena_prepare_fixture.toml)
- fixture-backed pilot report: [../../reports/cross_modal/intake/athena-internal-pilot-report.md](../../reports/cross_modal/intake/athena-internal-pilot-report.md)

That path is intentionally conservative.

It does not claim Athena is Phase 1 complete.
It does make the next Athena step concrete:

- mount real internal session exports into the same sidecar contract
- regenerate the candidate manifest and pilot report
- treat the remaining blockers as explicit Phase 1 work rather than vague open questions

Current open blockers on the runnable pilot path are:

- Athena fNIRS processing remains unconfirmed
- Athena PPG mapping remains unconfirmed
- Athena event-label export is not yet demonstrated

## Current manifest

- [../../manifests/cross_modal/athena_internal.template.json](../../manifests/cross_modal/athena_internal.template.json)
