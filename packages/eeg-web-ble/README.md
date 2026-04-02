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
import {
  AthenaWasmDecoder,
  getEegChannelSamples,
} from "@elata-biosciences/eeg-web";

const transport = new BleTransport({
  deviceOptions: {
    athenaDecoderFactory: () => new AthenaWasmDecoder()
  },
  // Set eegProcessing: false if you want raw transport data in frame.eeg.
});

transport.onFrame = (frame) => {
  console.log(getEegChannelSamples(frame, 0).length, frame.eegRaw?.samples.length);
};

transport.onStatus = (status) => {
  console.log(status.state, status.reason);
};

await transport.connect();
await transport.start();
```

By default, `frame.eeg` carries processed EEG and `frame.eegRaw` preserves the
original transport samples. Pass `eegProcessing: false` if you want
`frame.eeg` to remain raw.

## EEG Signal Contract

`BleTransport` now applies the SDK EEG preprocessing pipeline automatically by
default. That keeps the transport aligned with the same Rust/WASM DSP used by
the rest of the repo instead of forcing each app or demo to maintain its own
notch, detrend, and rereference logic.

Default transport behavior:

- `frame.eeg` contains processed EEG
- `frame.eegRaw` preserves the original decoded transport rows
- `frame.eegProcessing` describes what was applied

Default processing stages:

- notch filtering at `60 Hz` and `120 Hz`
- detrending via `0.5 Hz` high-pass cleanup
- common-average rereferencing

If you want raw transport samples as the primary signal, disable processing:

```ts
const transport = new BleTransport({
  eegProcessing: false,
});
```

If you want processing but need to tune it, pass options through to the
underlying `@elata-biosciences/eeg-web` preprocessor:

```ts
const transport = new BleTransport({
  eegProcessing: {
    notch: { mainsHz: 50 },
    detrend: { mode: "linear" },
    reference: { mode: "custom-average", channels: ["TP9", "TP10"] },
  },
});
```

Signal-selection helpers such as `getEegChannelSamples(frame, 0, "raw")` come
from `@elata-biosciences/eeg-web`.

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
- If your analysis expects raw EEG, explicitly set `eegProcessing: false` or read from `frame.eegRaw`.

## Release Notes

`@elata-biosciences/eeg-web-ble` depends on `@elata-biosciences/eeg-web` and
should be released after it when compatibility changes. Full release flow:
[docs/releasing.md](https://github.com/Elata-Biosciences/elata-bio-sdk/blob/main/docs/releasing.md).

## Roadmap

- Safari and iOS BLE bridge plan:
  [docs/implementation-plan-ios-safari-ble-bridge.md](https://github.com/Elata-Biosciences/elata-bio-sdk/blob/main/docs/implementation-plan-ios-safari-ble-bridge.md)
