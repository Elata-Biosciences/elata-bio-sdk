# Using Web Bluetooth With Supported Devices

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

- Chrome or Edge
- `https://` or `localhost`
- Bluetooth enabled on the machine
- a supported Muse-compatible EEG device

Supported device classes in this repo today:

- Muse 2 and Muse S classic BLE devices
- Muse S Athena protocol v2 devices
- the synthetic Muse-compatible BLE bridge used for testing

Safari and iOS do not support this browser BLE workflow.

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

Prefer the scaffolded `eeg-demo` app, via the `eeg-ble` alias when helpful, when you want:

- a quick environment check for browser BLE support
- a reference for transport startup and status handling
- a simpler starting point than wiring the callbacks from scratch

## Common Gotchas

- If `navigator.bluetooth` is missing, you are likely in an unsupported browser or non-secure context.
- If the device chooser never appears, confirm Bluetooth is enabled and the page is served from `https://` or `localhost`.
- If Athena devices fail to decode, make sure you pass an `athenaDecoderFactory` backed by `@elata-biosciences/eeg-web`.
- If you need Safari or iOS support, plan for a native bridge or hybrid strategy instead of this browser path.

## Next Steps

- For raw EEG browser APIs, read [using-eeg-in-a-browser-app.md](using-eeg-in-a-browser-app.md).
- For setup failures, read [troubleshooting.md](troubleshooting.md).
- For package details, see [packages/eeg-web-ble/README.md](../../packages/eeg-web-ble/README.md).
