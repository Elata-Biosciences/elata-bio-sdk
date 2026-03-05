# @elata-biosciences/eeg-web-ble

Web Bluetooth transport package for EEG headband devices.

## Install

Using `pnpm` (recommended):

```bash
pnpm add @elata-biosciences/eeg-web-ble @elata-biosciences/eeg-web
```

Using `npm`:

```bash
npm install @elata-biosciences/eeg-web-ble @elata-biosciences/eeg-web
```

## Requirements

- Node.js **>= 18** for build and tests.
- Browser with **Web Bluetooth** support (typically Chrome/Edge on desktop or Android).
- Served from a **secure context** (`https://`) for Web Bluetooth to work.

## What this package owns

- Web Bluetooth device/session lifecycle.
- Classic + Athena packet handling.
- Emission of normalized `HeadbandFrameV1` frames via `HeadbandTransport`.

## Key exports

- `BleTransport` – main transport class for connecting to a headband over Web Bluetooth.
- `HeadbandTransport` types – normalized frame and status shapes shared with `@elata-biosciences/eeg-web`.

It intentionally depends on `@elata-biosciences/eeg-web` for shared transport and frame
contracts.

## Compatibility Notes

- This package is explicitly built for a family of EEG headband BLE devices and detects both `classic` and `athena` protocols in `src/museDevice.ts`.
- The classic path targets 4-channel EEG headbands using Muse 2 / Muse S-style UUIDs.
- The Athena path is supported only when an Athena decoder is provided via `athenaDecoderFactory`; otherwise startup throws.
- Tests cover transport behavior, but not every headset/firmware variant in the wild.

## Practical Caveats

- Requires Web Bluetooth in a secure context (`https://`), typically Chrome/Edge on desktop or Android.
- Safari/iOS currently does not support Web Bluetooth for this workflow.
- Firmware variants can differ in command behavior even with matching UUIDs.

## Safari / iOS Strategy

Because Safari/iOS lacks usable Web Bluetooth support, use one of these patterns:

1. Native app shell (recommended): implement BLE in Swift with CoreBluetooth and bridge normalized frames to web UI.
2. Companion bridge: run BLE in a native app (or desktop helper) and stream frames to the web app over WebSocket/WebRTC.
3. Hybrid WebView app: package the UI in `WKWebView` and expose BLE through native message handlers.

In all cases, keep `@elata-biosciences/eeg-web` frame schema contracts as the interface boundary so browser and native transports emit the same `HeadbandFrameV1` shape.

## Release Notes

`@elata-biosciences/eeg-web-ble` depends on `@elata-biosciences/eeg-web` and should be released after
`@elata-biosciences/eeg-web` when compatibility changes. Full release process and tagging:
[`docs/releasing.md`](../../docs/releasing.md).

## Roadmap

- [ ] Implement Safari/iOS native BLE bridge plan: [`docs/implementation-plan-ios-safari-ble-bridge.md`](../../docs/implementation-plan-ios-safari-ble-bridge.md)

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
