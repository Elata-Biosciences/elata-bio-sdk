# Repo Map

This document explains what lives where, which package owns what, and which
workflow is canonical for a given job.

## Top-Level Layout

- `crates/`: Rust crates for EEG, rPPG, protocol support, FFI, and synthetic bridges
- `packages/`: published TypeScript packages and the app scaffolder
- `eeg-demo/`: in-repo EEG browser dev demo
- `ios-demo/`: Swift dev demo and package integration reference
- `android-demo/`: Android dev demo and Gradle integration reference
- `scripts/`: shared scripts used by package build, verification, and release flows
- `docs/`: workflow, architecture, and planning docs
- `run.sh`: canonical task runner for local development, demos, tests, and releases

## Package Ownership

### `packages/eeg-web`

Owns:

- EEG WASM wrapper packaging
- generated wasm-bindgen output synced into `wasm/`
- TypeScript re-export surface for the EEG WASM APIs

Use this package when you need:

- `initEegWasm`
- EEG signal/model APIs from the WASM build
- shared transport and frame contracts used by web integrations

### `packages/eeg-web-ble`

Owns:

- **`src/transport/`** — `BleTransport`: Web Bluetooth session + `HeadbandFrameV1` assembly
- **`src/devices/muse/`** — `MuseBleDevice`: Muse 2 / Muse S classic + Athena GATT protocol
- additional devices via `BleTransport({ device })` or new modules under `src/devices/`

Use this package when you need:

- headband connection and session lifecycle
- browser BLE streaming of EEG frames

See [contributing-eeg-transports.md](contributing-eeg-transports.md) for adding
headsets beyond the built-in Muse path.

### `packages/rppg-web`

Owns:

- TypeScript wrapper around the rPPG pipeline
- browser backend loading for packaged rPPG WASM
- advanced helpers like `DemoRunner` and frame sources

Use this package when you need:

- rPPG processing in a web app
- camera-driven app helpers and diagnostics
- packaged WASM backend loading

### `packages/create-elata-demo`

Owns:

- published app scaffolding flow
- template generation for `rppg-demo`, `eeg-demo`, and `eeg-ble`
- template smoke-test coverage

Use this package when you need:

- a new scaffolded app
- a clean consumer-facing starting point
- a reference app with pinned dependencies

## Canonical User Paths

- New app: use `create-elata-demo`
- Existing app consuming published packages: install from npm
- SDK repo development: use `run.sh`
- Local EEG wrapper iteration against another app: use `./run.sh sync-to`

## `create-elata-demo` Vs `sync-to`

These serve different jobs:

- `create-elata-demo` is the recommended way to start a new app
- `sync-to` is only for local `packages/eeg-web` development against an existing app

Do not present `sync-to` as the main onboarding path for users.

## Repo-Level Commands

Prefer these commands before creating new workflow docs or scripts:

- `./run.sh doctor`
- `./run.sh dev eeg|rppg|all`
- `./run.sh build eeg|rppg|all`
- `./run.sh demo eeg|rppg|hal`
- `./run.sh test`
- `./run.sh test create-elata-demo`
- `./run.sh verify-all`

If a package-local command and `run.sh` overlap, `run.sh` is usually the better
repo-level entry point.

## In-Repo Dev Demos And Scaffolds

- `eeg-demo/`: canonical in-repo EEG browser dev demo
- `packages/rppg-web/demo/`: in-package rPPG dev demo assets and build tooling
- `ios-demo/`: native iOS integration reference
- `android-demo/`: native Android integration reference
- `packages/create-elata-demo/templates/*`: consumer-facing scaffold templates

Use in-repo dev demos when developing the SDK itself. Use the scaffolder when
validating the consumer experience.

At the repo-command level:

- `./run.sh demo rppg` builds and temp-serves the `packages/rppg-web` dev demo
- `./run.sh demo eeg` builds EEG artifacts and serves `eeg-demo/`
- `./run.sh demo hal` runs the Rust HAL example

Useful demo-specific environment variables:

- `PORT` overrides the default server port for `demo rppg` and `demo eeg`
- `KEEP_TMP=1` keeps the temporary served directory for `demo rppg`
- `EEG_DEMO_BLE=1` also builds `packages/eeg-web-ble` during `demo eeg`
- `EEG_DEMO_BLE_TEST=1` runs BLE tests during that EEG dev-demo flow

## Generated Artifact Paths

- EEG WASM build output is generated from `crates/eeg-wasm` and synced into `packages/eeg-web/wasm`
- rPPG dev-demo and publishable WASM assets are built through `packages/rppg-web/scripts/build-demo.mjs`
- publish verification relies on package `prepare:publish` and `verify:publish` scripts

If a task affects packaging, demo assets, or WASM output, inspect both the
package scripts and `run.sh` before editing documentation.
