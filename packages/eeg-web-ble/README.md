# @elata-biosciences/eeg-web-ble

Web Bluetooth transport package for Muse-compatible EEG headband devices.

## What This Package Is

This package owns:

- browser-side Web Bluetooth device and session lifecycle
- classic and Athena packet handling
- emission of normalized `HeadbandFrameV1` frames

It intentionally depends on `@elata-biosciences/eeg-web` for shared transport
and frame contracts.

## When To Use It

Use `@elata-biosciences/eeg-web-ble` when you want:

- browser BLE discovery and session control for Muse-compatible EEG devices
- normalized headband frames in a browser app
- a transport layer that plugs into the rest of the Elata EEG web stack

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
- `HeadbandTransport` types

## Compatibility Notes

- The classic path targets Muse 2 and Muse S style UUIDs
- The Athena path requires an `athenaDecoderFactory`
- Tests cover transport behavior, but not every headset and firmware variant

## Platform Caveats

- Safari and iOS do not provide usable Web Bluetooth support for this workflow
- firmware variants may differ in command behavior

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
