# __APP_NAME__

This app was generated from the `__TEMPLATE_NAME__` template in
`@elata-biosciences/create-elata-demo`.

## What This Demo Shows

- two modes: **synthetic** (no hardware required) and **headband** (Muse-compatible BLE)
- `@elata-biosciences/eeg-web` WASM models: `band_powers`, `WasmCalmnessModel`, `WasmAlphaBumpDetector`, `WasmAlphaPeakModel`
- `@elata-biosciences/eeg-web-ble` for browser-side Muse BLE connection
- a live canvas waveform, five color-coded band-power meters (delta/theta/alpha/beta/gamma), a calmness score hero number, alpha bump state chips, and a collapsible alpha peak analysis panel

## Requirements

- Chrome or Edge (Web Bluetooth is required for headband mode; synthetic mode works in any modern browser)
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

- Safari and iOS do not support Web Bluetooth; headband mode will not work on those platforms.
- Synthetic mode generates a synthetic EEG signal locally — no device or Bluetooth is needed and it works in any Chromium or Firefox build.
- This template is a polished integration starting point and works well for demos and screen recordings.
- It uses Vite `?url` imports for the packaged WASM files, so it does not rely on importing `/public/pkg/*` from source code.
