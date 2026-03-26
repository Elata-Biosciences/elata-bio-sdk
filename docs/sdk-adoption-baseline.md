# SDK Adoption Baseline

Date: 2026-03-17

## Purpose

This baseline captures the current external-developer experience for the Elata
SDK after the first documentation and smoke-test improvements. It is meant to
anchor the remaining work in
[implementation-plan-sdk-adoption.md](implementation-plan-sdk-adoption.md)
to concrete flows, current strengths, and the biggest remaining gaps.

## Current Public Surfaces

Primary consumer entry points:

- [README.md](../README.md)
- [docs/guides/getting-started.md](guides/getting-started.md)
- [docs/guides/choose-the-right-package.md](guides/choose-the-right-package.md)
- [packages/create-elata-demo/README.md](../packages/create-elata-demo/README.md)
- [packages/eeg-web/README.md](../packages/eeg-web/README.md)
- [packages/eeg-web-ble/README.md](../packages/eeg-web-ble/README.md)
- [packages/rppg-web/README.md](../packages/rppg-web/README.md)

Primary public packages:

- `@elata-biosciences/create-elata-demo`
- `@elata-biosciences/eeg-web`
- `@elata-biosciences/eeg-web-ble`
- `@elata-biosciences/rppg-web`

Public export surfaces:

- `@elata-biosciences/eeg-web`: package root plus `./wasm/*`
- `@elata-biosciences/eeg-web-ble`: package root
- `@elata-biosciences/rppg-web`: package root plus `./pkg/*`
- `@elata-biosciences/create-elata-demo`: CLI binary `create-elata-demo`

Consumer templates:

- `rppg-web-demo`
- `eeg-web-demo`
- `eeg-web-ble-demo`

Maintainer-oriented surfaces that are still easy to encounter:

- [docs/maintainers.md](maintainers.md)
- [docs/releasing.md](releasing.md)
- [run.sh](../run.sh)

## Current New-Developer Flows

### 1. Scaffold A Demo App

Recommended path:

```bash
npm create @elata-biosciences/elata-demo my-app
cd my-app
pnpm install
pnpm run dev
```

Current state:

- This is now the clearest public entry point in the repo.
- Each template includes its own generated `README.md`.
- The CLI warns about the `pnpm` workspace pitfall and prints the workaround.
- CI now validates the packaged CLI path with a real scaffold-and-build smoke test.

Measured local baseline:

- scaffold command itself: effectively instant
- cached `pnpm install`: about 3 seconds
- cached `pnpm run build`: about 0.4 to 0.5 seconds

Current friction:

- first-run success still depends on browser and hardware expectations that are only described in text
- there are no screenshots or GIFs to help developers confirm they chose the right template
- a fresh-machine timing baseline is still unmeasured; current timing is from a local cached environment

### 2. Add SDK Packages To An Existing App

Current path:

```bash
pnpm add @elata-biosciences/eeg-web
pnpm add @elata-biosciences/eeg-web-ble
pnpm add @elata-biosciences/rppg-web
```

Current state:

- the root README explains which package to start with
- each package README has a recommended-path example
- CI now validates direct-consumer builds for `eeg-web`, `eeg-web-ble`, and `rppg-web`

Measured local baseline:

- cached install of a minimal consumer app: about 2.5 to 3 seconds
- cached build of a minimal consumer app: about 0.4 to 0.5 seconds

Current friction:

- the repo still lacks dedicated consumer guides for EEG browser apps, Web Bluetooth setup, and rPPG browser integration
- advanced or custom-integration examples are still thin
- the difference between package runtime requirements and repo-tooling requirements is documented, but not yet centralized in one compatibility matrix

### 3. Run The EEG Web Demo

Fastest consumer path:

```bash
npm create @elata-biosciences/elata-demo my-app -- --template eeg-web-demo
cd my-app
pnpm install
pnpm run dev
```

Maintainer path:

```bash
./run.sh demo eeg
```

Current friction:

- there are still two visible paths, and only one is right for consumers
- the consumer docs do not yet have a dedicated EEG browser guide
- template output explains what the app is, but not visually

### 4. Run The rPPG Web Demo

Fastest consumer path:

```bash
npm create @elata-biosciences/elata-demo my-app
cd my-app
pnpm install
pnpm run dev
```

Maintainer path:

```bash
pnpm --dir packages/rppg-web run start-demo
```

Current friction:

- there is still no dedicated rPPG browser guide for consumers
- runtime failures around camera permissions and packaged WASM are documented, but error messages are not yet fully audited

## What Already Feels Stronger

- New users now have one obvious first step: `create-elata-demo`.
- The README answers package-selection questions much faster than before.
- Package READMEs are substantially more usable without source-diving.
- The repo now has real consumer smoke coverage in CI instead of only maintainer-style checks.

## Biggest Remaining Gaps

- consumer guides are still incomplete for the main EEG, BLE, and rPPG integration paths
- runtime error messages still need a focused product pass
- the repo does not yet publish API reference docs for the TypeScript surface
- stability, semver expectations, and migration guidance are still implicit
- compatibility guidance exists, but not yet as one full matrix

## Baseline Assessment Against Success Metrics

- `5 minute first success`: plausible for cached local environments, but not yet proven on a fresh machine
- `choose the right package from the README`: mostly achieved
- `consumer-facing examples build in CI`: achieved for current public entry points
- `docs and runtime behavior stay aligned`: improved, but still depends on manual discipline
- `platform caveats documented before runtime`: partially achieved

## Recommended Next Focus

The next best return is to complete the missing consumer guides and the
compatibility matrix before moving on to API reference work. That keeps the
highest-traffic onboarding surfaces improving in the same direction as the
consumer smoke coverage that now protects them.
