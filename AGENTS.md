# AI Agent Guide

This file is for AI coding agents working in this repository. Use it as a
practical playbook for understanding the repo, choosing the right workflow, and
avoiding common mistakes.

## What This Repo Is

Elata SDK is a mixed Rust + TypeScript monorepo for biosignal tooling:

- EEG core crates and WASM bindings
- Web Bluetooth EEG headset transport (`eeg-web-ble`; Muse built-in, extensible)
- rPPG processing for web
- Native FFI layers for mobile/native clients
- Demo scaffolding via `create-elata-demo`

The repo is not a generic JS monorepo. Many changes cross Rust, generated WASM,
TypeScript wrappers, demo apps, and release tooling.

## First Things To Read

When starting work, orient with these files first:

- [README.md](README.md): repo overview, package list, build/demo commands
- [run.sh](run.sh): canonical task runner for build, test, release, and local package workflows
- [CONTRIBUTING.md](CONTRIBUTING.md): contribution and verification expectations
- [docs/guides/ai-assisted-development.md](docs/guides/ai-assisted-development.md): map for AI agents—`docs/` vs `elata-docs/` tutorials vs package `README`/`llms.txt` (includes vendor headset paths)
- [docs/releasing.md](docs/releasing.md): release flow and publish rules
- [docs/create-elata-demo.md](docs/create-elata-demo.md): canonical scaffolding workflow

For package-specific work, read the nearest package README and `package.json`
before changing code.

Treat `docs/implementation-plan-*.md` as planning or historical context unless
they clearly match the current code. For operational truth, prefer `run.sh`,
package `package.json` scripts, package READMEs, and maintainer/scaffolding
docs.

## Repo Map

- `crates/`: Rust crates for EEG, rPPG, protocol support, FFI, and bridges
- `packages/eeg-web`: TS wrapper around generated EEG WASM bindings
- `packages/eeg-web-ble`: Web Bluetooth transport for EEG headbands — `src/transport/` (`BleTransport`) vs `src/devices/muse/` (Muse protocol); open to additional `src/devices/` modules
- `packages/rppg-web`: TS wrapper and demo tooling for the rPPG pipeline
- `packages/create-elata-demo`: published scaffolder for demo apps
- `eeg-demo/`: in-repo EEG browser demo
- `ios-demo/`, `android-demo/`: native demos
- `scripts/`: helper scripts used by package and release flows
- `docs/`: architecture, scaffolding, and release docs

## Canonical Commands

Prefer these repo-level commands over ad hoc package commands when possible:

- `./run.sh doctor`: fast health check for toolchain, repo state, and artifacts
- `./run.sh dev [eeg|rppg|all]`: build debug artifacts
- `./run.sh build [eeg|rppg|all]`: build release artifacts
- `./run.sh demo [eeg|rppg|hal]`: run demo flows
- `./run.sh test`: run Rust and web test suites
- `./run.sh test create-elata-demo`: run scaffolder tests plus template smoke builds
- `./run.sh verify-all`: run publish-grade verification
- `./run.sh changeset`: create a changeset for releasable work

If a package README and `run.sh` disagree, inspect `run.sh` and current
`package.json` scripts before deciding the package README is authoritative.

## Current Source Of Truths

These are easy places to get confused:

- `create-elata-demo` is the preferred scaffolding path for new demo apps.
- for browser rPPG integration, `createRppgSession()` is the preferred app entrypoint
- `sync-to` still exists, but it is an internal EEG local-dev helper.
- `sync-to` only builds and links `packages/eeg-web`; it is not a general repo sync command.
- `scripts/dev-link.sh` is only a backward-compatible wrapper around `run.sh sync-to`.
- `pnpm` is the preferred repo package manager, but workspace behavior matters.

## Wrong-Path Prevention

When writing docs, answering questions, or generating examples, reduce the
chance that consumers follow an internal or legacy-looking path:

- Lead with the canonical consumer path first:
  - new app or evaluation: `@elata-biosciences/create-elata-demo`
  - existing browser app: published packages such as `@elata-biosciences/eeg-web`, `@elata-biosciences/eeg-web-ble`, or `@elata-biosciences/rppg-web`
- Explicitly label internal workflows as internal when they appear:
  - `./run.sh sync-to`
  - `scripts/dev-link.sh`
  - in-repo demos used for SDK development
  - historical `docs/implementation-plan-*.md` files
- Do not present internal helpers and consumer onboarding flows as equivalent options.
- If mentioning a non-default path, explain who it is for, why it exists, and why the default path is still preferred.
- If a user asks "which path should I take?", answer in this shape:
  - recommended default
  - only use the alternative when a specific repo-maintainer or advanced-integration condition applies
- For browser rPPG work, start with `createRppgSession()` and only drop to generated WASM bindings if you are intentionally debugging the SDK itself.
- If a reported consumer issue might actually be workspace coupling, check the `pnpm --ignore-workspace` caveat before concluding that the scaffold or template is broken.

## Important Gotcha: Scaffolding Inside This Repo

If a scaffolded app is created inside this repository, `pnpm install` from that
app directory may still bind to the parent workspace defined in
[pnpm-workspace.yaml](pnpm-workspace.yaml).

That means the app may not get its own `node_modules` if it is not included in
the workspace globs.

Use one of these instead:

```bash
pnpm --dir my-app --ignore-workspace install
pnpm --dir my-app --ignore-workspace run dev
```

Or use `npm install` / `npm run dev` from inside the scaffolded app.

Do not assume a scaffold failure means the template is broken until you check
whether `pnpm` attached to the parent workspace.

## How To Interrogate The Repo

When asked whether something is still relevant, supported, or canonical:

1. Check [README.md](README.md).
2. Check [run.sh](run.sh) for the real command behavior.
3. Check the relevant package `package.json` scripts.
4. Check the nearest package README or docs page.
5. Search the repo for usage with `rg`.

Prefer confirming behavior from code over inferring from docs alone.

Useful searches:

- `rg -n "sync-to|create-elata-demo|prepare:publish|verify:publish" .`
- `rg -n "run_pkg_script|build_eeg_web_package|build_rppg_web_package" run.sh`
- `find packages -maxdepth 2 -name README.md`

## Build And Test Rules Of Thumb

Pick the smallest verification that matches the change:

- Scaffolder changes: `pnpm --dir packages/create-elata-demo test`
- `packages/eeg-web` changes: run that package tests and confirm the WASM sync/build path
- `packages/eeg-web-ble` changes: run its tests and check TypeScript build behavior
- `packages/rppg-web` changes: run its tests; if demo/build behavior changed, run package demo build too
- Release tooling changes: run `./run.sh verify-all` if feasible
- Docs-only changes: tests usually not needed, but validate referenced commands against current scripts

If a change touches generated WASM, publish packaging, or repo task orchestration,
verify more broadly than the edited file suggests.

## When To Edit Which Doc

- Edit [README.md](README.md) for repo entry points, package inventory, and high-level workflows.
- Edit [docs/guides/ai-assisted-development.md](docs/guides/ai-assisted-development.md) when you add or rename **tutorial routes** in `elata-docs/`, change **vendor integration** entry points, or add new **published packages** that agents should discover via `llms.txt`/README.
- Edit package READMEs for package-specific install/usage/build details.
- Edit [docs/create-elata-demo.md](docs/create-elata-demo.md) for scaffolder workflows and caveats.
- Edit [docs/releasing.md](docs/releasing.md) for release policy and maintainer flow.
- Edit [docs/contributing-eeg-transports.md](docs/contributing-eeg-transports.md) when headset transport contribution expectations change.

If a workflow changed in code, update the nearest doc in the same task when practical.

## Release And Versioning Expectations

This repo uses Changesets. If a user-facing package change should ship, expect a
changeset unless the user explicitly says otherwise.

Published packages currently include:

- `@elata-biosciences/eeg-web`
- `@elata-biosciences/eeg-web-ble`
- `@elata-biosciences/rppg-web`
- `@elata-biosciences/create-elata-demo`

Before making release-related claims, inspect current `package.json` files and
[docs/releasing.md](docs/releasing.md).

## Editing Guidance

- Preserve existing patterns in shell scripts and package scripts.
- Avoid inventing new top-level workflows if `run.sh` already owns that job.
- Do not remove backward-compatible wrappers like `scripts/dev-link.sh` unless explicitly requested.
- Be careful with generated-artifact flows: some packages publish generated files intentionally.
- If docs mention commands, confirm the commands still exist before editing.

## Good Default Workflow For Agents

For most coding tasks:

1. Read the relevant package README and `package.json`.
2. Inspect `run.sh` if the task involves build/test/release/demo behavior.
3. Search for the feature or command with `rg`.
4. Make the smallest coherent change.
5. Run the narrowest useful verification.
6. If user-visible behavior changed, update nearby docs.

Following that sequence will prevent most false assumptions in this repo.
