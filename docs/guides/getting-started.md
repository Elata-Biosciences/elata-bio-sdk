# Getting Started

## Fastest Path

If you are evaluating the SDK for the first time, scaffold a starter app:

```bash
npm create @elata-biosciences/elata-demo my-app
cd my-app
npm install
npm run dev
```

Templates:

- `rppg-demo`: camera-based rPPG starter app
- `eeg-demo`: browser EEG starter app with synthetic data and optional Web Bluetooth (Muse built-in via `eeg-web-ble`)
- `eeg-ble`: BLE-first EEG starter (pairing flow, Web Bluetooth, links to native demo references)
- `ppg-demo`: Muse PPG heart rate and HRV starter
- `pulse-game`: rPPG recovery game that runs in a sandboxed iframe and stores scores with `app-metrics` (the Elata App Store pattern)

Aliases include `rppg`, `eeg`, `ble`, `ppg`, `pulse`, and legacy names such as `rppg-web-demo` → `rppg-demo`. Every template has `npm run build:zip` for uploading to the Elata App Store. See [create-elata-demo.md](../create-elata-demo.md).

## Existing App Path

If you already have an app, install only what you need:

- `@elata-biosciences/eeg-web`: EEG WASM APIs
- `@elata-biosciences/eeg-web-ble`: Web Bluetooth headset transport (see [contributing-eeg-transports.md](../contributing-eeg-transports.md) to extend beyond built-in devices)
- `@elata-biosciences/rppg-web`: browser rPPG processing and demo helpers
- `@elata-biosciences/ppg-web`: headband PPG heart rate and HRV
- `@elata-biosciences/biosignal-session`: local multi-sensor session recording
- `@elata-biosciences/biosignal-analytics`: EEG features, HRV, and headline scores
- `@elata-biosciences/app-payments`, `app-state`, `app-metrics`: purchases, storage, and scores for apps running in the Elata App Store

See [choose-the-right-package.md](choose-the-right-package.md) for the decision guide.

Follow-up guides:

- [example-apps.md](example-apps.md): full example applications (live demos and source)
- [using-eeg-in-a-browser-app.md](using-eeg-in-a-browser-app.md)
- [using-web-bluetooth-with-supported-devices.md](using-web-bluetooth-with-supported-devices.md)
- [using-rppg-in-a-browser-app.md](using-rppg-in-a-browser-app.md)
- [using-biosignal-sessions.md](using-biosignal-sessions.md)
- [using-iap-in-a-browser-app.md](using-iap-in-a-browser-app.md)
- [compatibility.md](compatibility.md)

Publishing to the Elata App Store: see [docs.elata.bio/apps/build/overview](https://docs.elata.bio/apps/build/overview).

## Workspace Caveat

If you scaffold an app inside another `pnpm` workspace and the new app is not
added to that workspace, run from the parent directory:

```bash
pnpm --dir my-app --ignore-workspace install
pnpm --dir my-app --ignore-workspace run dev
```
