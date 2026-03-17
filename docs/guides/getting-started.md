# Getting Started

## Fastest Path

If you are evaluating the SDK for the first time, scaffold a demo app:

```bash
npm create @elata-biosciences/elata-demo my-app
cd my-app
pnpm install
pnpm run dev
```

Templates:

- `rppg-web-demo`: camera-based rPPG demo
- `eeg-web-demo`: browser EEG WASM demo with synthetic data
- `eeg-web-ble-demo`: Muse-compatible browser BLE demo

## Existing App Path

If you already have an app, install only what you need:

- `@elata-biosciences/eeg-web`: EEG WASM APIs
- `@elata-biosciences/eeg-web-ble`: browser BLE transport
- `@elata-biosciences/rppg-web`: browser rPPG processing and demo helpers

See [choose-the-right-package.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/choose-the-right-package.md) for the decision guide.

Follow-up guides:

- [using-eeg-in-a-browser-app.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/using-eeg-in-a-browser-app.md)
- [using-web-bluetooth-with-supported-devices.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/using-web-bluetooth-with-supported-devices.md)
- [using-rppg-in-a-browser-app.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/using-rppg-in-a-browser-app.md)
- [compatibility.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/compatibility.md)

## Workspace Caveat

If you scaffold a demo inside another `pnpm` workspace and the new app is not
added to that workspace, run from the parent directory:

```bash
pnpm --dir my-app --ignore-workspace install
pnpm --dir my-app --ignore-workspace run dev
```
