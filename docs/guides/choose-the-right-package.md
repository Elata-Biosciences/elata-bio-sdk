# Choose The Right Package

## Recommended Decision Order

1. If you are evaluating the SDK or starting a new app, use `@elata-biosciences/create-elata-demo` first.
2. If you already have an app and know which capability you need, add the published package for that capability.
3. Only drop to repo-internal workflows if you are actively modifying the SDK inside this monorepo.

## New Project Or Evaluation

Use `@elata-biosciences/create-elata-demo`.

This is the best starting point when you want a working app quickly.

## EEG In A Browser App

Use `@elata-biosciences/eeg-web` when you need:

- browser-side EEG WASM APIs
- signal processing and model functions
- shared types used by browser integrations

## Browser Web Bluetooth For EEG Headsets

Use `@elata-biosciences/eeg-web-ble` when you need:

- browser BLE discovery and streaming
- normalized headband frames (`HeadbandFrameV1`)
- a `HeadbandTransport` that plugs into the Elata EEG web stack

The package ships **Muse 2 / Muse S (classic and Athena)** support out of the box.
Additional headsets can be added in-repo or in your app; see
[contributing-eeg-transports.md](../contributing-eeg-transports.md).

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

## Paths To Avoid Unless You Have A Specific Reason

- Avoid starting from `./run.sh sync-to` for new apps. It is a local `eeg-web` development helper, not a general setup flow.
- Avoid treating in-repo dev demos as the normal install path. They are useful references, but `create-elata-demo` is the cleaner consumer starting point.
- Avoid assuming a scaffolded app is broken if `pnpm install` behaves strangely inside another workspace. Check the `pnpm --ignore-workspace` workflow first.
