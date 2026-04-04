# Getting Started

## Fastest Path

If you are evaluating the SDK for the first time, scaffold a starter app:

```bash
npm create @elata-biosciences/elata-demo my-app
cd my-app
pnpm install
pnpm run dev
```

Templates:

- `rppg-demo`: camera-based rPPG starter app
- `eeg-demo`: browser EEG starter app with synthetic data and optional Web Bluetooth (Muse built-in via `eeg-web-ble`)

## Existing App Path

If you already have an app, install only what you need:

- `@elata-biosciences/eeg-web`: EEG WASM APIs
- `@elata-biosciences/eeg-web-ble`: Web Bluetooth headset transport (see [contributing-eeg-transports.md](../contributing-eeg-transports.md) to extend beyond built-in devices)
- `@elata-biosciences/rppg-web`: browser rPPG processing and demo helpers

See [choose-the-right-package.md](choose-the-right-package.md) for the decision guide.

Follow-up guides:

- [using-eeg-in-a-browser-app.md](using-eeg-in-a-browser-app.md)
- [using-web-bluetooth-with-supported-devices.md](using-web-bluetooth-with-supported-devices.md)
- [using-rppg-in-a-browser-app.md](using-rppg-in-a-browser-app.md)
- [compatibility.md](compatibility.md)

## Workspace Caveat

If you scaffold an app inside another `pnpm` workspace and the new app is not
added to that workspace, run from the parent directory:

```bash
pnpm --dir my-app --ignore-workspace install
pnpm --dir my-app --ignore-workspace run dev
```
