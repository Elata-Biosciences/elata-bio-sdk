# Vendor Headset Onboarding Checklist

Use this checklist when a device company wants to add headset support to the
Elata browser EEG stack.

This is written for vendors, but it is protocol-agnostic.

## Goal

Converge on Elata's transport boundary:

- **`HeadbandTransport`** lifecycle (`connect`, `start`, `stop`, `disconnect`)
- **`HeadbandFrameV1`** frame shape emitted into browser apps

These contracts are defined in `@elata-biosciences/eeg-web`.

## Pick an integration path

Choose one path up front:

1. **Upstream contribution inside `eeg-web-ble`** (**recommended** if generally useful):
   - add `packages/eeg-web-ble/src/devices/<vendor>/...`
   - reuse `src/transport/bleTransport.ts`
   - add tests in `src/__tests__/` with mocked Web Bluetooth
   - update docs (`packages/eeg-web-ble/README.md`, `docs/contributing-eeg-transports.md`, Mintlify mirrors)
   - add a changeset if publishable
2. **Siblings package** (`packages/eeg-web-<vendor>`) when:
   - vendor SDK/license constraints are heavy
   - a localhost/native bridge is required
3. **App-local adapter** for fast PoC or private integrations

For detailed patterns, see [contributing-eeg-transports.md](contributing-eeg-transports.md).

For vendor headsets that are broadly useful to SDK users, choose option 1 by
default. It keeps transport behavior centralized and avoids parallel adapter
implementations across apps.

## Step-by-step checklist

### 1) Protocol packet and GATT inventory

Provide and validate:

- primary service UUIDs and characteristic UUIDs
- notification/read/write behavior per characteristic
- packet framing: byte order, headers, counters, CRC/checksum
- signal metadata: channel names, sample rate, units, scaling
- timestamps/clock semantics (device vs local clock)

If these are not documented, capture them from vendor tools before coding.

### 2) Implement device adapter

Implement device logic under `src/devices/<vendor>/` or app-local code:

- Web Bluetooth discovery (`requestDevice` filters)
- GATT connect/disconnect lifecycle
- notification subscription/unsubscription
- decode packet bytes to EEG rows (`number[][]`)

The adapter must expose the behavior expected by `BleTransport`:

- metadata (`samplingRate`, `eegNames`, `numEegChannels`, etc.)
- lifecycle methods (`prepareSession`, `startStream`, `stopStream`, `releaseSession`)

Use the exported `BleDeviceLike` type to make this explicit in your adapter:

```ts
import type { BleDeviceLike } from "@elata-biosciences/eeg-web-ble";

export class VendorBleDevice implements BleDeviceLike {
  isAthena = false;
  samplingRate = 250;
  eegNames = ["CH1", "CH2"];
  numEegChannels = 2;
  opticsChannelCount = 0;

  getBoardInfo() { return { device_name: "VENDOR_DEVICE" }; }
  getCharacteristicInfo() { return { characteristics: [] }; }
  async prepareSession() {}
  async releaseSession() {}
  async startStream(eegCb, _ppgCb) { eegCb([[0, 0]]); }
  async stopStream() {}
}
```

Reference:

- `packages/eeg-web-ble/src/devices/muse/museDevice.ts`
- `packages/eeg-web-ble/src/transport/bleTransport.ts`

### 3) Frame contract validation

Before tuning models, verify frame correctness:

- row width always equals `numEegChannels`
- channel order is stable and documented
- sample rate and channel names match vendor spec
- status transitions are emitted for connect/start/stop/disconnect failures

### 4) Optional aux signals

If exposing PPG/IMU/battery:

- map to current frame blocks where practical
- if semantics differ, document the differences clearly
- avoid forcing Muse-specific assumptions for non-Muse hardware

### 5) Tests (required)

Add unit tests with mocked BLE and packet fixtures:

- success path: connect -> start -> frames -> stop -> disconnect
- malformed/short packet handling
- reconnect/disconnect behavior
- protocol variants/firmware quirks you know about

Use existing tests as baseline:

- `packages/eeg-web-ble/src/__tests__/bleTransport.test.ts`
- `packages/eeg-web-ble/src/__tests__/museDevice.test.ts`

Real hardware is not required for CI.

### 6) Docs (required)

Update docs in the same PR:

- package README (`packages/eeg-web-ble/README.md` or vendor package README)
- user guide impact (`docs/guides/using-web-bluetooth-with-supported-devices.md`)
- contributor guidance if expectations changed (`docs/contributing-eeg-transports.md`)

If the docs site is touched, update the `elata-docs/` submodule content as part of the same change.

### 7) Release prep

For user-visible package changes:

- add a changeset: `./run.sh changeset`
- run the narrowest useful checks (tests/build)
- include browser/platform caveats and known limitations in PR notes

Release flow reference: [releasing.md](releasing.md)

## PR template snippet for vendors

Copy this into the PR description:

- Device(s)/firmware tested:
- Service/characteristics added:
- EEG channel map + sample rate:
- Timestamp source (`device` or `local`):
- Browser matrix tested:
- Known limitations:
