# __APP_NAME__

This app was generated from the `__TEMPLATE_NAME__` template in
`@elata-biosciences/create-elata-demo`.

## What This Demo Shows

- browser-side Muse-compatible BLE connection
- `@elata-biosciences/eeg-web-ble` integration
- a minimal sample counter for streamed EEG rows

## Requirements

- Chrome or Edge with Web Bluetooth support
- `https://` or `localhost`
- a supported Muse-compatible EEG device
- Bluetooth enabled on the machine
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

- Safari and iOS do not support this browser BLE workflow.
- This template is a starting point for browser transport integration, not a full production app.
