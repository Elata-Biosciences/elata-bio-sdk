# Web Demo

The browser demo supports two sources:

- Synthetic Board (JS): runs fully in the browser.
- Muse / Synthetic Bridge (BLE): connects to a BLE peripheral that emulates the Muse protocol.

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
