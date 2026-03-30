# __APP_NAME__

This app was generated from the `__TEMPLATE_NAME__` template in
`@elata-biosciences/create-elata-demo`.

## What This Demo Shows

- a BLE-first browser EEG starter that opens in **headband** mode by default
- an optional **synthetic** mode when you want to validate the WASM path without hardware
- `@elata-biosciences/eeg-web` WASM models: `band_powers`, `WasmCalmnessModel`, `WasmAlphaBumpDetector`, `WasmAlphaPeakModel`
- `@elata-biosciences/eeg-web-ble` for browser-side Muse BLE connection
- on-screen native reference cards for:
  - `ios-demo/README.md`
  - `ios-demo/EegDemoApp/Bluetooth/MuseBluetoothManager.swift`
  - `android-demo/README.md`
  - `android-demo/app/src/main/AndroidManifest.xml`
- a live canvas waveform, five color-coded band-power meters (delta/theta/alpha/beta/gamma), a calmness score hero number, alpha bump state chips, and a collapsible alpha peak analysis panel

## Requirements

- Chrome, or Bluefy on iOS (Web Bluetooth is required for headband mode; synthetic mode works in any modern browser)
- `https://` or `localhost` (required for Web Bluetooth)
- a supported Muse-compatible EEG device (headband mode only)
- `pnpm` or `npm` to install dependencies

## Run It

```text
pnpm:
pnpm install
pnpm run dev
```

If this app was created inside another `pnpm` workspace and is not part of that
workspace, run from the parent directory:

```text
pnpm:
pnpm --dir __APP_NAME__ --ignore-workspace install
pnpm --dir __APP_NAME__ --ignore-workspace run dev

npm:
cd __APP_NAME__
npm install
npm run dev
```

## Notes

- For BLE in this starter, use Chrome or Bluefy on iOS. Do not expect Safari itself to handle the headband flow.
- Synthetic mode generates a synthetic EEG signal locally — no device or Bluetooth is needed and it works in any Chromium or Firefox build.
- This template is a polished integration starting point and works well for demos and screen recordings.
- It uses Vite `?url` imports for the packaged WASM files, so it does not rely on importing `/public/pkg/*` from source code.

## Native BLE References

- iOS native BLE reference: `ios-demo/README.md`
- iOS CoreBluetooth manager: `ios-demo/EegDemoApp/Bluetooth/MuseBluetoothManager.swift`
- Android native demo shell: `android-demo/README.md`
- Android Bluetooth permission wiring: `android-demo/app/src/main/AndroidManifest.xml`
