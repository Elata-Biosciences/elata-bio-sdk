# @elata-biosciences/eeg-web-ble

Web Bluetooth transport package for EEG headbands in the browser. It emits
normalized **`HeadbandFrameV1`** frames for the Elata EEG web stack.

**New to the SDK?** `npm create @elata-biosciences/elata-demo my-app` is the
recommended start. You can also run
`npx @elata-biosciences/create-elata-demo my-app`. Either path scaffolds a
working app with synthetic mode, correct Vite config, and WASM imports already
set up — no hardware required to get started.

## Bluetooth vs built-in devices

Keep two ideas separate:

1. **Web Bluetooth + transport** — Chromium `navigator.bluetooth`, secure
   context, GATT connect/disconnect, and turning peripheral data into
   **`HeadbandFrameV1`** via **`BleTransport`**. That contract comes from
   **`@elata-biosciences/eeg-web`** (`HeadbandTransport`, frame types). It is
   not tied to a single vendor.
2. **Device protocol** — service UUIDs, characteristics, packet decode, and
   channel maps for a **specific** headset. Today the repo ships **Muse 2 /
   Muse S (classic + Athena)** under `src/devices/muse/`. Other protocols belong
   in new modules (or a custom `device` passed into `BleTransport`).

## What This Package Is

This package owns:

- **`BleTransport`** (`src/transport/`) — session lifecycle and frame assembly
  for Web Bluetooth (default device: `MuseBleDevice`)
- **`MuseBleDevice`** (`src/devices/muse/`) — Muse classic + Athena GATT handling
- optional hooks for **other headsets** via `new BleTransport({ device })`
- emission of normalized `HeadbandFrameV1` frames

It intentionally depends on `@elata-biosciences/eeg-web` for shared transport
and frame contracts.

## Source layout (maintainers)

| Path | Role |
|------|------|
| `src/transport/bleTransport.ts` | Web Bluetooth–oriented transport; merges EEG + Muse-shaped PPG/aux into frames |
| `src/devices/muse/museDevice.ts` | Muse 2 / Muse S classic and Athena protocol |
| `src/index.ts` | Public exports only — **import from the package root**, not deep paths |

Tests live under `src/__tests__/`.

## When To Use It

Use `@elata-biosciences/eeg-web-ble` when you want:

- browser BLE discovery and session control for **supported** headsets (today:
  Muse 2, Muse S classic, Muse S Athena — see below)
- normalized headband frames in a browser app
- a transport layer that plugs into the rest of the Elata EEG web stack

For **additional hardware** (non-Muse BLE, or bridge-based flows), implement the
same transport contract and either pass a custom `device` into `BleTransport` or
contribute a new module — see
[docs/contributing-eeg-transports.md](../../docs/contributing-eeg-transports.md).

If you only need EEG signal APIs without device transport, start with
`@elata-biosciences/eeg-web`.

## Install

```bash
pnpm add @elata-biosciences/eeg-web-ble @elata-biosciences/eeg-web
npm install @elata-biosciences/eeg-web-ble @elata-biosciences/eeg-web
```

## Requirements

- Node.js `>= 20` for build and tests
- browser with Web Bluetooth support, typically Chrome or Edge
- secure context (`https://`) for browser BLE access

## Usage

```ts
import { BleTransport } from "@elata-biosciences/eeg-web-ble";
import { AthenaWasmDecoder } from "@elata-biosciences/eeg-web";

const transport = new BleTransport({
  deviceOptions: {
    athenaDecoderFactory: () => new AthenaWasmDecoder()
  }
});

transport.onFrame = (frame) => {
  console.log(frame.eeg.samples.length);
};

transport.onStatus = (status) => {
  console.log(status.state, status.reason);
};

await transport.connect();
await transport.start();
```

## Key Exports

- `BleTransport`
- `BleDeviceLike` (adapter contract for custom headset integrations)
- `MuseBleDevice` (reference implementation and default device)
- `HeadbandTransport` types (re-exported usage flows align with `@elata-biosciences/eeg-web`)

## Built-In Device Support

These device classes are implemented **in this package** today:

- Muse 2 and Muse S **classic** BLE (documented UUIDs and framing)
- Muse S **Athena** protocol v2 (requires `athenaDecoderFactory` from `eeg-web`)
- the synthetic Muse-compatible BLE bridge used for testing

Other headsets can be integrated by contributors; see
[docs/contributing-eeg-transports.md](../../docs/contributing-eeg-transports.md).

## Platform Caveats

- Safari and iOS do not provide usable Web Bluetooth support for this workflow
- Muse firmware variants may differ in command behavior

For Safari and iOS, prefer a native BLE shell, a companion bridge, or a hybrid
WebView strategy with `@elata-biosciences/eeg-web` frame contracts as the
boundary.

## Build And Dev Notes

From the repo root:

```bash
pnpm --dir packages/eeg-web-ble test
pnpm --dir packages/eeg-web-ble build
```

If you are working across repo workflows, prefer starting with:

```bash
./run.sh test
```

## Troubleshooting

- If `navigator.bluetooth` is missing, use a supported Chromium-based browser and a secure context.
- If device selection never appears, confirm the site is running on `https://` or `localhost` and that Bluetooth is enabled on the machine.
- If you are targeting Safari or iOS, this package is not the right browser-side transport; use a native or bridge strategy instead.
- If Athena startup fails, verify that you passed an `athenaDecoderFactory` backed by `@elata-biosciences/eeg-web`.

## Release Notes

`@elata-biosciences/eeg-web-ble` depends on `@elata-biosciences/eeg-web` and
should be released after it when compatibility changes. Full release flow:
[docs/releasing.md](https://github.com/Elata-Biosciences/elata-bio-sdk/blob/main/docs/releasing.md).

## Roadmap

- Safari and iOS BLE bridge plan:
  [docs/implementation-plan-ios-safari-ble-bridge.md](https://github.com/Elata-Biosciences/elata-bio-sdk/blob/main/docs/implementation-plan-ios-safari-ble-bridge.md)
