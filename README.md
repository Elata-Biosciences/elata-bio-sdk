# Elata SDK

> Public documentation lives at **[docs.elata.bio](https://docs.elata.bio)**. Working with an AI coding assistant? Start with the **[AI-assisted development map](docs/guides/ai-assisted-development.md)** (routes to tutorials, vendor checklists, and package `llms.txt`).

A cross-platform biosignal SDK spanning EEG device pipelines, browser
transports, and rPPG processing for web and native clients.

## What Is In This Repo

- EEG core crates, signal processing, and models
- WebAssembly bindings for EEG, rPPG, and biosignal analytics
- Web Bluetooth EEG headset transport (`eeg-web-ble`; built-in Muse, open to more devices)
- Headband PPG heart rate and HRV (`ppg-web`)
- Local session recording and analytics (`biosignal-session`, `biosignal-analytics`)
- SDKs for apps running in the Elata App Store (`app-payments`, `app-state`, `app-metrics`)
- Native FFI layers for iOS and Android integration
- App scaffolding and in-repo development demos

## Quick Start

### Scaffold an app

The recommended way to try the SDK is to scaffold a starter app with
`create-elata-demo`.

```bash
# Interactive template chooser
npm create @elata-biosciences/elata-demo my-app

# Pick a template directly
npm create @elata-biosciences/elata-demo my-app -- --template rppg

# List templates
npx @elata-biosciences/create-elata-demo --list-templates
```

| Template | Aliases | What it is |
|----------|---------|------------|
| `rppg-demo` | `rppg` | Camera pulse / rPPG starter (default, no hardware) |
| `eeg-demo` | `eeg` | Browser EEG starter with Muse Web Bluetooth support |
| `eeg-ble` | `ble` | BLE-first EEG starter |
| `ppg-demo` | `ppg`, `muse-ppg` | Muse PPG heart rate and HRV |
| `pulse-game` | `pulse`, `recovery` | rPPG game in a sandboxed iframe using `app-metrics` |

You can also call the scaffolder directly:

```bash
pnpm dlx @elata-biosciences/create-elata-demo my-app
npx @elata-biosciences/create-elata-demo my-app
```

The scaffolder supports interactive app-type selection when you omit
`--template`, then prompts for the project name when needed. It also supports
template aliases and uses `rppg-demo` as the non-interactive default.

After scaffolding:

```bash
cd my-app
npm install
npm run dev
```

If the new app lives inside another `pnpm` workspace, run this from the parent
directory instead:

```bash
pnpm --dir my-app --ignore-workspace install
pnpm --dir my-app --ignore-workspace run dev
```

Full details: [docs/create-elata-demo.md](docs/create-elata-demo.md)

### Add packages to an existing app

Published JavaScript and TypeScript packages live under the
[`@elata-biosciences` scope on npm](https://www.npmjs.com/org/elata-biosciences)
(org landing page: all packages in one place).

```bash
pnpm add @elata-biosciences/rppg-web
pnpm add @elata-biosciences/eeg-web @elata-biosciences/eeg-web-ble
pnpm add @elata-biosciences/ppg-web
```

## Choose The Right Package

Use this quick guide if you are starting from an existing app:

| Goal | Start here | Notes |
|------|------------|-------|
| Scaffold a new app | [`@elata-biosciences/create-elata-demo`](https://www.npmjs.com/package/@elata-biosciences/create-elata-demo) | Fastest path for evaluation and onboarding |
| Run EEG WASM APIs in the browser | [`@elata-biosciences/eeg-web`](https://www.npmjs.com/package/@elata-biosciences/eeg-web) | Signal processing, models, and WASM helpers |
| Connect to an EEG headset over Web Bluetooth in the browser | [`@elata-biosciences/eeg-web-ble`](https://www.npmjs.com/package/@elata-biosciences/eeg-web-ble) | Requires `@elata-biosciences/eeg-web` and Web Bluetooth; Muse built-in; [extend for other headsets](docs/contributing-eeg-transports.md) |
| Run camera-based rPPG in a browser app | [`@elata-biosciences/rppg-web`](https://www.npmjs.com/package/@elata-biosciences/rppg-web) | Includes processor, backend loader, and demo helpers |
| Add optional diagnostic waveform reconstruction | [`@elata-biosciences/rppg-models-web`](packages/rppg-models-web/README.md) | Requires `rppg-web`; model weights are caller-supplied pending license provenance |
| Read heart rate and HRV from a headband's PPG sensor | [`@elata-biosciences/ppg-web`](https://www.npmjs.com/package/@elata-biosciences/ppg-web) | Runs on the `eeg-web-ble` transport; Muse classic `ppgRaw` and Athena `optics` |
| Record multi-sensor sessions locally | [`@elata-biosciences/biosignal-session`](packages/biosignal-session/README.md) (not yet on npm) | Arrow IPC chunks, CRC32C, local-only; see [guide](docs/guides/using-biosignal-sessions.md) |
| Compute EEG features, HRV, and headline scores | [`@elata-biosciences/biosignal-analytics`](packages/biosignal-analytics/README.md) (not yet on npm) | WASM features plus transparent score formulas |
| Add in-app purchases to an appstore app | [`@elata-biosciences/app-payments`](https://www.npmjs.com/package/@elata-biosciences/app-payments) | Purchases + entitlements over `postMessage`; see [guide](docs/guides/using-iap-in-a-browser-app.md) and [demo](examples/iap-demo) |
| Save per-user state in an appstore app | [`@elata-biosciences/app-state`](packages/app-state/README.md) (not yet on npm) | Key-value storage over `postMessage` |
| Record events and scores in an appstore app | [`@elata-biosciences/app-metrics`](https://www.npmjs.com/package/@elata-biosciences/app-metrics) | Records, scores, and `reportAffect` over a `MessagePort` |

If you are trying the SDK for the first time, prefer `create-elata-demo` over
manual package setup.

Wrong turns to avoid:

- Do not start with `./run.sh sync-to` unless you are modifying `packages/eeg-web` inside this monorepo.
- Do not treat in-repo dev demos as the normal consumer install path; they are reference and SDK-development surfaces.
- If you scaffold inside another `pnpm` workspace, check the `--ignore-workspace` flow before assuming the template is broken.

## Example applications

Open source browser apps that use `@elata-biosciences/eeg-web`, `eeg-web-ble`, and `rppg-web` together
(with live GitHub Pages demos) are listed in [docs/guides/example-apps.md](docs/guides/example-apps.md).
The public docs site has the same list at [docs.elata.bio/sdk/guides/example-apps](https://docs.elata.bio/sdk/guides/example-apps).

## Packages

Scope overview: [@elata-biosciences on npm](https://www.npmjs.com/org/elata-biosciences) lists every published package in this workspace.

- [@elata-biosciences/eeg-web](https://www.npmjs.com/package/@elata-biosciences/eeg-web): EEG WASM wrapper and re-export surface
- [@elata-biosciences/eeg-web-ble](https://www.npmjs.com/package/@elata-biosciences/eeg-web-ble): Web Bluetooth transport for EEG headbands (Muse built-in; [contributor extensions](docs/contributing-eeg-transports.md))
- [@elata-biosciences/rppg-web](https://www.npmjs.com/package/@elata-biosciences/rppg-web): rPPG processing wrapper and demo helpers
- [@elata-biosciences/rppg-models-web](packages/rppg-models-web/README.md) (not yet on npm): optional diagnostic waveform adapter; learned asset not bundled
- [@elata-biosciences/ppg-web](https://www.npmjs.com/package/@elata-biosciences/ppg-web): headband PPG heart rate and HRV
- [@elata-biosciences/biosignal-session](packages/biosignal-session/README.md) (not yet on npm): local-first multi-sensor session recording
- [@elata-biosciences/biosignal-analytics](packages/biosignal-analytics/README.md) (not yet on npm): metric registry, WASM EEG features, HRV, headline scores
- [@elata-biosciences/app-payments](https://www.npmjs.com/package/@elata-biosciences/app-payments): in-app purchases and entitlements for sandboxed appstore apps
- [@elata-biosciences/app-state](packages/app-state/README.md) (not yet on npm): per-user key-value storage for sandboxed appstore apps
- [@elata-biosciences/app-metrics](https://www.npmjs.com/package/@elata-biosciences/app-metrics): per-user records, scores, and biometric Score contribution for sandboxed appstore apps
- [@elata-biosciences/create-elata-demo](https://www.npmjs.com/package/@elata-biosciences/create-elata-demo): app scaffolder with five templates

## Compatibility Summary

| Surface | Chrome / Edge | Safari macOS | Safari iOS | Node.js |
|---------|----------------|--------------|------------|---------|
| `create-elata-demo` | n/a | n/a | n/a | `>= 18` |
| `eeg-web` | Supported | Supported | Supported | `>= 20` for local repo tooling |
| `eeg-web-ble` | Supported in secure context | Not supported for this workflow | Not supported for this workflow | `>= 20` for local repo tooling |
| `rppg-web` | Supported | Supported | Supported with camera permissions | `>= 20` for local repo tooling |
| `rppg-models-web` | Supported | Supported | Supported | `>= 20` for local repo tooling |
| `ppg-web` | Supported in secure context | Not supported for this workflow | Not supported for this workflow | `>= 20` for local repo tooling |

Full matrix, including the session, analytics, and appstore packages: [docs/guides/compatibility.md](docs/guides/compatibility.md).

Browser caveats:

- `eeg-web-ble` requires Web Bluetooth and an `https://` origin or `localhost`
- Safari and the system iOS browser do not provide usable Web Bluetooth for this workflow; use Chrome or Edge on desktop, Chrome on Android, or **Bluefy** on iOS if you need in-browser BLE
- `rppg-web` needs camera access and packaged WASM assets when using `loadWasmBackend()`
- `rppg-models-web` needs an explicit model URL; no learned asset is bundled

Package docs:

- [packages/eeg-web/README.md](packages/eeg-web/README.md) · [npm](https://www.npmjs.com/package/@elata-biosciences/eeg-web)
- [packages/eeg-web-ble/README.md](packages/eeg-web-ble/README.md) · [npm](https://www.npmjs.com/package/@elata-biosciences/eeg-web-ble)
- [packages/rppg-web/README.md](packages/rppg-web/README.md) · [npm](https://www.npmjs.com/package/@elata-biosciences/rppg-web)
- [packages/ppg-web/README.md](packages/ppg-web/README.md) · [npm](https://www.npmjs.com/package/@elata-biosciences/ppg-web)
- [packages/rppg-models-web/README.md](packages/rppg-models-web/README.md)
- [packages/biosignal-session/README.md](packages/biosignal-session/README.md) (not yet on npm)
- [packages/biosignal-analytics/README.md](packages/biosignal-analytics/README.md) (not yet on npm)
- [packages/app-payments/README.md](packages/app-payments/README.md) · [npm](https://www.npmjs.com/package/@elata-biosciences/app-payments)
- [packages/app-state/README.md](packages/app-state/README.md) (not yet on npm)
- [packages/app-metrics/README.md](packages/app-metrics/README.md) · [npm](https://www.npmjs.com/package/@elata-biosciences/app-metrics)
- [packages/create-elata-demo/README.md](packages/create-elata-demo/README.md) · [npm](https://www.npmjs.com/package/@elata-biosciences/create-elata-demo)

## Common Repo Workflows

Use `run.sh` as the canonical task runner (`just <command>` runs the same
recipes if you have [just](https://github.com/casey/just) installed; `./run.sh help`
lists everything):

```bash
./run.sh doctor
./run.sh dev all
./run.sh build all
./run.sh demo eeg
./run.sh demo rppg
./run.sh demo ppg
./run.sh test create-elata-demo
./run.sh test
./run.sh verify-all
./run.sh rust-release-check all
```

Public Rust crates currently intended for `crates.io`: `elata-eeg-hal`, `elata-eeg-signal`,
`elata-eeg-models`, `elata-muse-proto`, and `elata-rppg`. Synthetic, binding-focused, and
experimental crates in the workspace are internal unless the release docs
explicitly say otherwise.

### In-Repo Dev Demos And Examples

The repo also includes in-repo dev demos and example surfaces for SDK development:

- `./run.sh demo rppg` builds the in-repo `packages/rppg-web` demo assets,
  copies them to a temporary directory, and serves them on `http://127.0.0.1:8080`
  by default.
- `./run.sh demo eeg` builds the EEG WASM package and serves `eeg-demo/` on
  `http://127.0.0.1:4173` by default.
- `./run.sh demo ppg` serves the `packages/ppg-web` Muse PPG demo on
  `http://127.0.0.1:8081` by default.
- `./run.sh demo hal` runs the native Rust HAL example.
- `ios-demo/` and `android-demo/` are native integration references, not the
  normal browser onboarding path.

Useful flags while working on demos:

- `PORT=9000 ./run.sh demo rppg`
- `KEEP_TMP=1 ./run.sh demo rppg`
- `EEG_DEMO_BLE=1 ./run.sh demo eeg`
- `EEG_DEMO_BLE=1 EEG_DEMO_BLE_TEST=1 ./run.sh demo eeg`

Use these in-repo dev demos when developing or debugging the SDK itself. For a
clean end-user starting point, prefer `create-elata-demo`.

## Contributing

If you want to contribute, start with
[CONTRIBUTING.md](CONTRIBUTING.md).
It covers setup, PR flow, testing expectations, and changesets.

If you want a quick repo walkthrough first, see the contributor video:
[Elata SDK contributor walkthrough](https://www.youtube.com/watch?v=I6Bgu2QV1D4)

If you are working with AI coding agents in this repo, also read
[AGENTS.md](AGENTS.md).

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

- [docs.elata.bio](https://docs.elata.bio): public documentation site (source: the [`elata-docs`](elata-docs/README.md) submodule)
- [docs/README.md](docs/README.md): index of repo docs (guides, maintainer workflows, architecture, plans)
- [docs/guides/README.md](docs/guides/README.md): consumer guide index
- [docs/repo-map.md](docs/repo-map.md): package ownership and repo layout
- [docs/create-elata-demo.md](docs/create-elata-demo.md): scaffolding workflow
- [docs/dev_setup.md](docs/dev_setup.md): local setup and iteration tips
- [docs/maintainers.md](docs/maintainers.md) and [docs/releasing.md](docs/releasing.md): maintainer and release workflows
- [docs/contributing-eeg-transports.md](docs/contributing-eeg-transports.md) and [docs/vendor-headset-onboarding-checklist.md](docs/vendor-headset-onboarding-checklist.md): adding headset support

Implementation-plan and architecture docs are listed in [docs/README.md](docs/README.md)
with their current status. Treat `run.sh`, package READMEs, and the guides as the
operational source of truth.

## Contributor And Agent Guides

- [CONTRIBUTING.md](CONTRIBUTING.md): contributor workflow
- [AGENTS.md](AGENTS.md): repo-specific instructions for AI coding agents
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)

## License

MIT
