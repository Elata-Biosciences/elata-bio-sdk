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
- `packages/rppg-models-web`: optional ONNX waveform-reconstruction adapter for `rppg-web`
- `packages/ppg-web`: Muse PPG heart-rate/HRV estimation over `HeadbandFrameV1`
- `packages/app-metrics`: per-user metrics storage for sandboxed appstore apps
- `packages/app-payments`: in-app purchases for sandboxed appstore apps
- `packages/app-state`: per-user, per-app key-value storage for sandboxed appstore apps
- `packages/biosignal-session`: local-first biosignal session recording — contracts, MessagePort wire protocol, Arrow IPC chunk encoding
- `packages/biosignal-analytics`: local analytics over recorded biosignals — metric registry, WASM EEG window features, HRV/statistics, headline scores
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

## Cost Discipline

This repo is PUBLIC, so GitHub Actions minutes here are free. That is a real
difference from the consumer apps (`peak-app`, `vitality-app` and
`neural-chat-app` are private and their minutes bill), and it means CI cost
here is paid in wall-clock and reviewer patience rather than dollars. Still
worth not wasting.

- **Match the command to the change.** `./run.sh test` runs the Rust suites AND
  the web suites. `pnpm verify:all` runs `verify:publish` across nine packages.
  Neither is the right response to editing one TypeScript file. Run the
  narrowest thing that can fail: `pnpm test` inside the one package, or
  `cargo test -p <crate>` for one crate.
- **Pin the tool version when node_modules is not installed.** The root
  `node_modules` is often absent in a fresh clone, and then `npx biome`
  resolves an unrelated package that is also called `biome`, while
  `npx @biomejs/biome` resolves latest and rejects this repo's 1.x config. Use
  `npx --yes @biomejs/biome@1.9.4` to match the pinned devDependency, or run
  `pnpm install` first.
- **`cargo install wasm-bindgen-cli --locked` is not cached and runs in three
  separate jobs** (`build-wasm`, `package-pack-check`, `consumer-smoke`),
  measured at roughly 100 seconds each. That is about five minutes per CI run
  spent rebuilding the same tool. Caching it, or building it once and passing
  it as an artifact the way the WASM output already is, is the obvious win for
  anyone touching this workflow.
- **The Rust test matrix is 8 crates times 2 operating systems, so 16 jobs,**
  half on `macos-latest`. Free here. It is also the shape NOT to copy into a
  private repo, where macOS runners bill at a large multiple of Linux.
- **Confirm a red check is yours before chasing it.** `Format check` (rustfmt)
  and `Clippy` have been failing on `main` for unrelated pre-existing reasons.
  Check whether a failure reproduces on `main` first.
- **Publishing is the expensive, irreversible step.** A release bundles every
  pending changeset in `.changeset/`, not only yours. Never run the version or
  publish flow just to get your own change out; that decision belongs to
  whoever owns the release.

Full reasoning behind this posture is in `peak-app`'s CLAUDE.md under "Effort
and cost policy". There is NO account-level `~/.claude/CLAUDE.md` in a remote
container, so nothing is inherited automatically. Per-repo files like this one
are the only guidance that travels.

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
- `@elata-biosciences/rppg-models-web`
- `@elata-biosciences/ppg-web`
- `@elata-biosciences/app-metrics`
- `@elata-biosciences/app-payments`
- `@elata-biosciences/app-state`
- `@elata-biosciences/biosignal-session`
- `@elata-biosciences/biosignal-analytics`
- `@elata-biosciences/create-elata-demo`

Not every publishable package is in the `all` release set. `release_targets_for`
in `scripts/run-lib.sh` is the source of truth: `app-payments` and
`biosignal-analytics` are individually releasable but deliberately excluded from
`./run.sh release all` while their APIs settle, and `app-state` is not wired
into the release targets at all yet.

Before making release-related claims, inspect current `package.json` files and
[docs/releasing.md](docs/releasing.md).

## Editing Guidance

- Preserve existing patterns in shell scripts and package scripts.
- Avoid inventing new top-level workflows if `run.sh` already owns that job.
- Do not remove backward-compatible wrappers like `scripts/dev-link.sh` unless explicitly requested.
- Be careful with generated-artifact flows: some packages publish generated files intentionally.
- If docs mention commands, confirm the commands still exist before editing.
- Never bundle a repo-wide formatter run with a scoped bug fix. A PR fixing
  two Clippy lints once shipped as a 17,896-line diff across 139 files
  because `biome format --write .` / `cargo fmt --all` got run alongside it
  to also clear the separately-failing Format check. The formatter run is a
  single, zero-risk command anyone can run on their own with nothing to
  review line-by-line; a real fix is not. Ship them as separate PRs (or
  don't ship the formatter run as a PR at all, just note that the command
  exists) so a reviewer can actually see what changed.

## Good Default Workflow For Agents

For most coding tasks:

1. Read the relevant package README and `package.json`.
2. Inspect `run.sh` if the task involves build/test/release/demo behavior.
3. Search for the feature or command with `rg`.
4. Make the smallest coherent change.
5. Run the narrowest useful verification.
6. If user-visible behavior changed, update nearby docs.

Following that sequence will prevent most false assumptions in this repo.
