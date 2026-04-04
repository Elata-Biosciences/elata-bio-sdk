# Contributing EEG browser transports

This document is for **contributors and device vendors** who want to add or extend
how headset data reaches the Elata browser EEG stack.

## Design goal

`@elata-biosciences/eeg-web-ble` is the **shared Web Bluetooth transport package**
for the Elata EEG web stack. It ships a **built-in** Muse 2 / Muse S (classic and
Athena) implementation and is **open to additional devices** that speak other BLE
protocols or need companion bridges, as long as they converge on the same frame
contract.

The integration boundary for the rest of the SDK is **`HeadbandTransport`** and
**`HeadbandFrameV1`**, defined in `@elata-biosciences/eeg-web` — not Muse-specific
UUIDs or packet layouts.

## Where code usually lives

Pick one of these patterns and discuss larger additions in a GitHub issue first.

### 1. New device module inside `eeg-web-ble` (typical for Web Bluetooth)

Add a new device class (for example next to `museDevice.ts`) that implements Web
Bluetooth discovery, GATT I/O, and decoding for your hardware. Wire it into
`BleTransport` by letting apps pass `new BleTransport({ device: yourDevice })`, or
add a small factory if that improves ergonomics.

**Reference implementation:** `packages/eeg-web-ble/src/museDevice.ts` and
`packages/eeg-web-ble/src/bleTransport.ts`.

### 2. Custom `device` with existing `BleTransport`

`BleTransport` accepts an optional `device` in its constructor options. The object
must satisfy the same **lifecycle and metadata** shape that `MuseBleDevice`
implements (prepare session, start/stop stream, channel counts, names, sample
rate). The TypeScript type for that shape is currently internal to
`bleTransport.ts`; match `MuseBleDevice`’s public fields and methods, or open a
PR to export a named interface for contributors.

**EEG samples:** the stream callback should pass `number[][]` where each **row**
is one time step and row length equals `numEegChannels`, consistent with
`eegNames`.

**Auxiliary data:** `BleTransport`’s PPG/aux merge path is oriented toward the
Muse-style callbacks (`PPG1`–`PPG3`, `interleaved`, `athena`). If your device
differs, you can omit those callbacks or extend `BleTransport` with maintainer
review.

### 3. Separate workspace package under `packages/`

Use a **new package** (for example `packages/eeg-web-<vendor>`) when:

- the integration pulls in heavy or licensed vendor SDKs,
- you need a **localhost bridge** (desktop helper + WebSocket) rather than pure
  Web Bluetooth in the page, or
- you want a clearly owned publish line and changelog separate from `eeg-web-ble`.

That package should still expose a **`HeadbandTransport`** (or a thin wrapper
around one) so apps match the same contract as `BleTransport`.

### 4. App-local transport only

You may implement **`HeadbandTransport`** entirely inside your application if you
do not need to publish the integration. Use `@elata-biosciences/eeg-web` types
only.

## Contribution checklist (SDK repo)

- **Tests:** add unit tests with mocked Bluetooth / bridge I/O where possible,
  following `packages/eeg-web-ble/src/__tests__/`. Real hardware is not required
  for CI.
- **Docs:** update `packages/eeg-web-ble/README.md` (or the new package README)
  with requirements, limitations, and setup. Do not commit API tokens or
  secrets.
- **Consumer docs:** if behavior or install steps change for published users,
  update the relevant guides under `docs/guides/` and mirrored Mintlify sources
  under `external/docs-site/` when applicable.
- **Changesets:** for user-visible published packages, add a changeset
  (`./run.sh changeset`). See [releasing.md](releasing.md).

## Related reading

- [packages/eeg-web-ble/README.md](../packages/eeg-web-ble/README.md)
- [packages/eeg-web/README.md](../packages/eeg-web/README.md) (transport types)
- [CONTRIBUTING.md](../CONTRIBUTING.md)
