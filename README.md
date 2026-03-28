# Elata SDK

> AI-assisted integration? Start with the [Quickstart](internal/docs-site/quickstart.mdx) and [guides](internal/docs-site/guides/).

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
# Interactive template chooser
npm create @elata-biosciences/elata-demo my-app

# RPPG web demo
npm create @elata-biosciences/elata-demo my-app -- --template rppg

# EEG web demo
npm create @elata-biosciences/elata-demo my-app -- --template eeg-web-demo

# EEG web demo (alias)
npm create @elata-biosciences/elata-demo my-app -- --template eeg

# EEG Web Bluetooth demo
npm create @elata-biosciences/elata-demo my-app -- --template eeg-web-ble-demo

# EEG Web Bluetooth demo (alias)
npm create @elata-biosciences/elata-demo my-app -- --template eeg-ble
```

You can also call the scaffolder directly:

```bash
pnpm dlx @elata-biosciences/create-elata-demo my-app
npx @elata-biosciences/create-elata-demo my-app
```

When you run the scaffolder interactively without `--template`, it prompts you
to choose a template. In non-interactive runs, it still falls back to
`rppg-web-demo`.

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

Full details: [docs/create-elata-demo.md](docs/create-elata-demo.md)

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

Wrong turns to avoid:

- Do not start with `./run.sh sync-to` unless you are modifying `packages/eeg-web` inside this monorepo.
- Do not treat in-repo demos as the normal consumer install path; they are reference and SDK-development surfaces.
- If you scaffold inside another `pnpm` workspace, check the `--ignore-workspace` flow before assuming the template is broken.

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

- [packages/eeg-web/README.md](packages/eeg-web/README.md)
- [packages/eeg-web-ble/README.md](packages/eeg-web-ble/README.md)
- [packages/rppg-web/README.md](packages/rppg-web/README.md)
- [packages/create-elata-demo/README.md](packages/create-elata-demo/README.md)

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

- [docs/README.md](docs/README.md): docs index
- [external/docs-site/README.md](external/docs-site/README.md): Mintlify docs site source for the next `docs.elata.bio`
- [docs/repo-map.md](docs/repo-map.md): package ownership and repo layout
- [docs/create-elata-demo.md](docs/create-elata-demo.md): scaffolding workflow
- [docs/dev_setup.md](docs/dev_setup.md): local setup and iteration tips
- [docs/guides/README.md](docs/guides/README.md): consumer guide index
- [docs/guides/getting-started.md](docs/guides/getting-started.md): fastest path to a running app
- [docs/guides/choose-the-right-package.md](docs/guides/choose-the-right-package.md): package selection help
- [docs/guides/using-eeg-in-a-browser-app.md](docs/guides/using-eeg-in-a-browser-app.md): browser EEG integration guide
- [docs/guides/using-web-bluetooth-with-supported-devices.md](docs/guides/using-web-bluetooth-with-supported-devices.md): supported browser BLE flow
- [docs/guides/using-rppg-in-a-browser-app.md](docs/guides/using-rppg-in-a-browser-app.md): browser rPPG integration guide
- [docs/guides/compatibility.md](docs/guides/compatibility.md): browser, device, and tooling expectations
- [docs/guides/troubleshooting.md](docs/guides/troubleshooting.md): common setup and runtime failures
- [docs/sdk-adoption-baseline.md](docs/sdk-adoption-baseline.md): current onboarding baseline and friction summary
- [docs/sdk-adoption-issues.md](docs/sdk-adoption-issues.md): grouped issue list for remaining SDK DX work
- [docs/maintainers.md](docs/maintainers.md): maintainer-focused workflow guide
- [docs/releasing.md](docs/releasing.md): release and publish flow

Architecture and planning notes:

- [docs/architecture-rppg.md](docs/architecture-rppg.md)
- [docs/architecture-sentiment.md](docs/architecture-sentiment.md)
- [docs/implementation-plan-rppg.md](docs/implementation-plan-rppg.md)
- [docs/implementation-plan-sentiment.md](docs/implementation-plan-sentiment.md)
- [docs/implementation-plan-demo-scaffolding.md](docs/implementation-plan-demo-scaffolding.md)
- [docs/implementation-plan-sdk-adoption.md](docs/implementation-plan-sdk-adoption.md)
- [docs/implementation-plan-ios-safari-ble-bridge.md](docs/implementation-plan-ios-safari-ble-bridge.md)
- [docs/implementation-plan-harmonic-selection.md](docs/implementation-plan-harmonic-selection.md)

Some implementation-plan docs are historical or exploratory snapshots. Treat
`run.sh`, package READMEs, and the maintainer/scaffolding docs above as the
current operational source of truth.

## Contributor And Agent Guides

- [CONTRIBUTING.md](CONTRIBUTING.md): contributor workflow
- [AGENTS.md](AGENTS.md): repo-specific instructions for AI coding agents
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)

## License

MIT
