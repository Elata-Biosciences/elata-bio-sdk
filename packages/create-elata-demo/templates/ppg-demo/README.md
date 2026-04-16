# __APP_NAME__

This app was generated from the `__TEMPLATE_NAME__` template in
`@elata-biosciences/create-elata-demo`.

## What This Demo Shows

- Muse PPG acquisition over Web Bluetooth
- `createMusePpgSession()` as the recommended `@elata-biosciences/ppg-web` entrypoint
- a live BPM, RMSSD, SDNN, and signal-quality dashboard
- waveform rendering and transport diagnostics from the selected PPG channel

## Requirements

- a Chromium-based browser with Web Bluetooth support
- a Muse device with PPG data available
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

- This starter uses the high-level `createMusePpgSession()` API instead of wiring `BleTransport` manually.
- The underlying transport path is the same normalized `HeadbandFrameV1` stream used elsewhere in the SDK.
- Classic Muse `ppgRaw` timing still relies on local frame timing, so HRV should be treated as a developer preview until device timestamps are propagated end to end.
