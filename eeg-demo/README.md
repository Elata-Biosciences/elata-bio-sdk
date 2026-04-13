# Web Demo

The browser demo supports two sources:

- Synthetic Board (JS): runs fully in the browser.
- Muse / Synthetic Bridge (BLE): connects to a BLE peripheral that emulates the Muse protocol.
- Athena Recorder: a dedicated SDK-backed capture page for exporting Athena EEG + optics + IMU sessions into the repo intake shape.

## Athena Recorder

From the repo root:

```bash
npm run cross-modal:athena:recorder:serve
```

Then open:

```text
http://127.0.0.1:4173/athena-recorder.html
```

The recorder page uses the published SDK surface in this repo:

- `@elata-biosciences/eeg-web` for the Athena WASM decoder
- `@elata-biosciences/eeg-web-ble` for the BLE transport

It exports an intake-ready session directory with:

- `athena_session.json`
- `eeg.csv`
- `fnirs_optics.csv`
- optional `imu.csv`
- optional `battery.csv`
- optional `ppg.csv` if the SDK surface ever exposes it for Athena

Current constraint:

- Athena PPG is not currently exposed by the confirmed SDK path, so live recorder exports mark `ppg.present = false` unless that stream actually appears.

To run the synthetic BLE bridge:

```bash
cargo run -p synthetic-ble-bridge -- --ble
```

You should see a device named `Muse-Synthetic` in the Web Bluetooth chooser.

Note: This requires a Bluetooth LE adapter that supports the Peripheral (GATT server) role. Many built-in Bluetooth radios do not.

## Automated Athena BLE Browser Test

`index.html` now has a dedicated Playwright test for the Athena BLE path (connect + stream start + decoder notification flow) using mocked Web Bluetooth and a stubbed WASM module.

Run it from `eeg-demo/`:

```bash
npm install
npm run test:e2e
```
