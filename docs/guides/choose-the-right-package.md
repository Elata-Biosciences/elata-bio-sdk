# Choose The Right Package

## New Project Or Evaluation

Use `@elata-biosciences/create-elata-demo`.

This is the best starting point when you want a working app quickly.

## EEG In A Browser App

Use `@elata-biosciences/eeg-web` when you need:

- browser-side EEG WASM APIs
- signal processing and model functions
- shared types used by browser integrations

## Browser BLE For Muse-Compatible Devices

Use `@elata-biosciences/eeg-web-ble` when you need:

- browser BLE discovery and streaming
- normalized headband frames
- a transport layer for Muse-compatible EEG devices

You should generally install `@elata-biosciences/eeg-web` alongside it.

## Camera-Based rPPG

Use `@elata-biosciences/rppg-web` when you need:

- browser-side rPPG processing
- packaged WASM backend loading
- demo helpers for camera-driven prototypes

## Local Repo Development

Use `./run.sh sync-to` only if you are modifying `packages/eeg-web` inside the
monorepo and want to link the local package into another app.

Do not use `sync-to` as the normal onboarding path for new SDK consumers.
