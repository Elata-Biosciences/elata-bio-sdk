# Using EEG In A Browser App

## Start With The Right Path

If you want a working reference app first, scaffold the EEG starter app:

```bash
npm create @elata-biosciences/elata-demo my-app -- --template eeg-demo
cd my-app
pnpm install
pnpm run dev
```

Use this guide when you want to integrate EEG APIs into an existing browser app.

## Install

```bash
pnpm add @elata-biosciences/eeg-web
npm install @elata-biosciences/eeg-web
```

## What `eeg-web` Gives You

`@elata-biosciences/eeg-web` provides:

- browser-side EEG WASM initialization
- signal-processing and model exports such as `band_powers`
- shared types and contracts used by higher-level browser integrations

This package does not handle Bluetooth device connection by itself. If you also
need browser BLE headset transport, add
[`@elata-biosciences/eeg-web-ble`](../../packages/eeg-web-ble/README.md) or
another [`HeadbandTransport`](../../packages/eeg-web/README.md) implementation.
For contributing new headsets, see
[contributing-eeg-transports.md](../contributing-eeg-transports.md).

## Minimal Integration

```ts
import { initEegWasm, band_powers } from "@elata-biosciences/eeg-web";

await initEegWasm();

const eegData = new Float32Array([0, 1, 0, -1]);
const powers = band_powers(eegData, 256);

console.log("alpha", powers.alpha);
```

## Typical Integration Flow

1. Initialize the packaged WASM runtime with `initEegWasm()`.
2. Pass browser-side EEG sample buffers into the exported analysis functions.
3. If you later need live headset transport, combine this package with `eeg-web-ble` or any `HeadbandTransport`.

## When To Use The EEG Template Instead

Prefer the scaffolded `eeg-demo` template when you want:

- a known-good Vite setup
- a reference for how bundled WASM assets should be served
- a synthetic-data app that runs without hardware

## Common Gotchas

- If `initEegWasm()` fails, your app may not be serving the packaged `wasm/` assets correctly.
- If you need a live headset connection, `eeg-web` alone is not enough.
- If you are only evaluating the SDK, the scaffolded app is faster than manual setup.

## Next Steps

- For live device transport, read [using-web-bluetooth-with-supported-devices.md](using-web-bluetooth-with-supported-devices.md).
- For general setup issues, read [troubleshooting.md](troubleshooting.md).
- For package-specific details, see [packages/eeg-web/README.md](../../packages/eeg-web/README.md).
