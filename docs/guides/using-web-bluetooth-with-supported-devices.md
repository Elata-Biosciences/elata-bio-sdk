# Using Web Bluetooth With Supported Devices

## 1. Web Bluetooth and the transport layer

This section is **vendor-agnostic**: it applies to any headset you connect through
the same Elata browser stack.

- **Platform:** Web Bluetooth needs a **supported browser** (typically Chrome or
  Edge on desktop; Chrome on Android; **Bluefy** on iOS if you stay in-browser),
  Bluetooth enabled, and a **secure context** (`https://` or `localhost`).
- **Contract:** live headset data should flow through a **`HeadbandTransport`**
  implementation that emits **`HeadbandFrameV1`**. Those types live in
  **`@elata-biosciences/eeg-web`**.
- **This repo’s Web Bluetooth adapter:** **`BleTransport`** in
  **`@elata-biosciences/eeg-web-ble`** connects that contract to **`navigator.bluetooth`**
  and assembles frames. You can pass a **custom `device`** or use the **default**
  built-in implementation (see §2).

Safari and the **system** iOS browser do **not** support this Web Bluetooth
workflow. Plan for **Bluefy**, a **native** BLE layer, or a **bridge** if you
target iOS.

For **additional hardware** beyond the built-ins below, see
[contributing-eeg-transports.md](../contributing-eeg-transports.md).

## 2. Built-in device support (Muse)

The **default** `BleTransport` uses **`MuseBleDevice`**, which speaks the Muse
GATT layout (classic and Athena). **Built-in device classes** in this repo today:

- Muse 2 and Muse S **classic** BLE
- Muse S **Athena** protocol v2 (requires `athenaDecoderFactory` from `eeg-web`)
- the synthetic Muse-compatible BLE bridge used for testing

Package layout in the monorepo separates **transport** (`src/transport/`) from
**this protocol** (`src/devices/muse/`); see
[packages/eeg-web-ble/README.md](../../packages/eeg-web-ble/README.md).

## Start With A Known-Good Scaffolded App

If you want the fastest path to a working browser BLE example, scaffold the EEG
starter app first:

```bash
npm create @elata-biosciences/elata-demo my-app -- --template eeg-ble
cd my-app
pnpm install
pnpm run dev
```

Use this guide when you want to add the same browser BLE flow to an existing
app.

## Requirements

- Chrome or Edge (desktop), or Chrome on Android, or Bluefy on iOS for in-browser BLE
- `https://` or `localhost`
- Bluetooth enabled on the machine
- a **Muse-class** headset for the default transport, or a custom `BleTransport` `device` you provide

## Install

```bash
pnpm add @elata-biosciences/eeg-web @elata-biosciences/eeg-web-ble
npm install @elata-biosciences/eeg-web @elata-biosciences/eeg-web-ble
```

## Minimal Integration

```ts
import { AthenaWasmDecoder } from "@elata-biosciences/eeg-web";
import { BleTransport } from "@elata-biosciences/eeg-web-ble";

const transport = new BleTransport({
  deviceOptions: {
    athenaDecoderFactory: () => new AthenaWasmDecoder(),
  },
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

## Typical Flow

1. Confirm the app is running in a secure context.
2. Construct `BleTransport`.
3. Provide `athenaDecoderFactory` if you need Athena support.
4. Subscribe to frame and status callbacks.
5. Call `connect()` and then `start()`.

## When To Use The BLE Template Instead

Prefer the scaffolded `eeg-demo` app, or the dedicated `eeg-ble` starter, when you want:

- a quick environment check for browser BLE support
- a reference for transport startup and status handling
- a simpler starting point than wiring the callbacks from scratch

## Common Gotchas

- If `navigator.bluetooth` is missing, you are likely in an unsupported browser or non-secure context.
- If the device chooser never appears, confirm Bluetooth is enabled and the page is served from `https://` or `localhost`.
- If Athena devices fail to decode, make sure you pass an `athenaDecoderFactory` backed by `@elata-biosciences/eeg-web`.
- If you need Safari or the stock iOS browser, plan for a native bridge or hybrid strategy instead of this path.

## Next Steps

- For raw EEG browser APIs, read [using-eeg-in-a-browser-app.md](using-eeg-in-a-browser-app.md).
- For setup failures, read [troubleshooting.md](troubleshooting.md).
- For package details, see [packages/eeg-web-ble/README.md](../../packages/eeg-web-ble/README.md).
- For adding other headsets, read [contributing-eeg-transports.md](../contributing-eeg-transports.md).
