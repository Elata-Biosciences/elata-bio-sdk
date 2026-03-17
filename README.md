# Elata SDK

A cross-platform biosignal SDK spanning EEG device pipelines, browser
transports, and rPPG processing for web and native clients.

## What Is In This Repo

- EEG core crates, signal processing, and models
- WebAssembly bindings for EEG and rPPG
- Web Bluetooth transport for Muse-compatible EEG devices
- Native FFI layers for iOS and Android integration
- Demo scaffolding and in-repo reference demos

## Quick Start

### Scaffold a demo app

The recommended way to try the SDK is to scaffold a demo app with
`create-elata-demo`.

```bash
# RPPG web demo (default template)
npm create @elata-biosciences/elata-demo my-app

# EEG web demo
npm create @elata-biosciences/elata-demo my-app -- --template eeg-web-demo

# EEG Web Bluetooth demo
npm create @elata-biosciences/elata-demo my-app -- --template eeg-web-ble-demo
```

You can also call the scaffolder directly:

```bash
pnpm dlx @elata-biosciences/create-elata-demo my-app --template rppg-web-demo
npx @elata-biosciences/create-elata-demo my-app --template rppg-web-demo
```

After scaffolding:

```bash
cd my-app
pnpm install
pnpm run dev
```

If the new app lives inside another `pnpm` workspace, run this from the parent
directory instead:

```bash
pnpm --dir my-app --ignore-workspace install
pnpm --dir my-app --ignore-workspace run dev
```

Full details: [docs/create-elata-demo.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/create-elata-demo.md)

### Add packages to an existing app

Published JavaScript and TypeScript packages live under the
[`@elata-biosciences` npm organization](https://www.npmjs.com/org/elata-biosciences).

```bash
pnpm add @elata-biosciences/eeg-web
pnpm add @elata-biosciences/eeg-web-ble
pnpm add @elata-biosciences/rppg-web
```

## Choose The Right Package

Use this quick guide if you are starting from an existing app:

| Goal | Start here | Notes |
|------|------------|-------|
| Scaffold a new demo app | `@elata-biosciences/create-elata-demo` | Fastest path for evaluation and onboarding |
| Run EEG WASM APIs in the browser | `@elata-biosciences/eeg-web` | Signal processing, models, and WASM helpers |
| Connect to a Muse-compatible EEG device in the browser | `@elata-biosciences/eeg-web-ble` | Requires `@elata-biosciences/eeg-web` and Web Bluetooth |
| Run camera-based rPPG in a browser app | `@elata-biosciences/rppg-web` | Includes processor, backend loader, and demo helpers |

If you are trying the SDK for the first time, prefer `create-elata-demo` over
manual package setup.

## Packages

- `@elata-biosciences/eeg-web`: EEG WASM wrapper and re-export surface
- `@elata-biosciences/eeg-web-ble`: Web Bluetooth transport for EEG headbands
- `@elata-biosciences/rppg-web`: rPPG processing wrapper and demo helpers
- `@elata-biosciences/create-elata-demo`: demo scaffolder with multiple templates

## Compatibility Summary

| Surface | Chrome / Edge | Safari macOS | Safari iOS | Node.js |
|---------|----------------|--------------|------------|---------|
| `create-elata-demo` | n/a | n/a | n/a | `>= 18` |
| `eeg-web` | Supported | Supported | Supported | `>= 20` for local repo tooling |
| `eeg-web-ble` | Supported in secure context | Not supported for this workflow | Not supported for this workflow | `>= 20` for local repo tooling |
| `rppg-web` | Supported | Supported | Supported with camera permissions | `>= 20` for local repo tooling |

Browser caveats:

- `eeg-web-ble` requires Web Bluetooth and an `https://` origin or `localhost`
- Safari and iOS do not provide usable Web Bluetooth support for Muse browser workflows
- `rppg-web` needs camera access and packaged WASM assets when using `loadWasmBackend()`

Package docs:

- [packages/eeg-web/README.md](/Users/khan/Documents/Projects/elata-bio-sdk/packages/eeg-web/README.md)
- [packages/eeg-web-ble/README.md](/Users/khan/Documents/Projects/elata-bio-sdk/packages/eeg-web-ble/README.md)
- [packages/rppg-web/README.md](/Users/khan/Documents/Projects/elata-bio-sdk/packages/rppg-web/README.md)
- [packages/create-elata-demo/README.md](/Users/khan/Documents/Projects/elata-bio-sdk/packages/create-elata-demo/README.md)

## Common Repo Workflows

Use `run.sh` as the canonical task runner:

```bash
./run.sh doctor
./run.sh dev all
./run.sh build all
./run.sh demo eeg
./run.sh demo rppg
./run.sh test
./run.sh verify-all
```

### Local EEG package linking

`sync-to` still exists, but it is only for local `packages/eeg-web`
development. It builds the EEG WASM wrapper and installs that package into an
existing local app.

```bash
./run.sh sync-to ../my-app
SAVE=1 ./run.sh sync-to ../my-app
./run.sh sync-to ../my-app debug
```

Use `create-elata-demo` for new apps. Use `sync-to` only when iterating on the
local EEG package against an app you already have.

## Docs Map

- [docs/README.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/README.md): docs index
- [docs/repo-map.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/repo-map.md): package ownership and repo layout
- [docs/create-elata-demo.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/create-elata-demo.md): scaffolding workflow
- [docs/dev_setup.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/dev_setup.md): local setup and iteration tips
- [docs/guides/README.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/README.md): consumer guide index
- [docs/guides/getting-started.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/getting-started.md): fastest path to a running app
- [docs/guides/choose-the-right-package.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/choose-the-right-package.md): package selection help
- [docs/guides/using-eeg-in-a-browser-app.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/using-eeg-in-a-browser-app.md): browser EEG integration guide
- [docs/guides/using-web-bluetooth-with-supported-devices.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/using-web-bluetooth-with-supported-devices.md): supported browser BLE flow
- [docs/guides/using-rppg-in-a-browser-app.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/using-rppg-in-a-browser-app.md): browser rPPG integration guide
- [docs/guides/compatibility.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/compatibility.md): browser, device, and tooling expectations
- [docs/guides/troubleshooting.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/troubleshooting.md): common setup and runtime failures
- [docs/sdk-adoption-baseline.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/sdk-adoption-baseline.md): current onboarding baseline and friction summary
- [docs/sdk-adoption-issues.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/sdk-adoption-issues.md): grouped issue list for remaining SDK DX work
- [docs/maintainers.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/maintainers.md): maintainer-focused workflow guide
- [docs/releasing.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/releasing.md): release and publish flow

Architecture and planning notes:

- [docs/architecture-rppg.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/architecture-rppg.md)
- [docs/architecture-sentiment.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/architecture-sentiment.md)
- [docs/implementation-plan-rppg.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/implementation-plan-rppg.md)
- [docs/implementation-plan-sentiment.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/implementation-plan-sentiment.md)
- [docs/implementation-plan-demo-scaffolding.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/implementation-plan-demo-scaffolding.md)
- [docs/implementation-plan-sdk-adoption.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/implementation-plan-sdk-adoption.md)
- [docs/implementation-plan-ios-safari-ble-bridge.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/implementation-plan-ios-safari-ble-bridge.md)
- [docs/implementation-plan-harmonic-selection.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/implementation-plan-harmonic-selection.md)

Some implementation-plan docs are historical or exploratory snapshots. Treat
`run.sh`, package READMEs, and the maintainer/scaffolding docs above as the
current operational source of truth.

## Contributor And Agent Guides

- [CONTRIBUTING.md](/Users/khan/Documents/Projects/elata-bio-sdk/CONTRIBUTING.md): contributor workflow
- [AGENTS.md](/Users/khan/Documents/Projects/elata-bio-sdk/AGENTS.md): repo-specific instructions for AI coding agents
- [CODE_OF_CONDUCT.md](/Users/khan/Documents/Projects/elata-bio-sdk/CODE_OF_CONDUCT.md)
- [SECURITY.md](/Users/khan/Documents/Projects/elata-bio-sdk/SECURITY.md)

## License

MIT
