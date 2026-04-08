# Demo Scaffolding Implementation Plan

Status: **mostly implemented** — this file is **historical design context**. Do not treat template IDs or CLI examples below as current unless they match the live CLI.

Current source of truth:

- `packages/create-elata-demo/index.mjs` for the live CLI
- `docs/create-elata-demo.md` for current usage and caveats

**Naming drift (important):** The live scaffolder uses canonical template IDs **`rppg-demo`**, **`eeg-demo`**, and **`eeg-ble`** (with aliases such as `rppg`, `eeg`, `ble`). Legacy names like **`rppg-web-demo`** and **`eeg-web-demo`** still resolve but are not the primary names. Examples below that say `rppg-web-demo` / `eeg-web-demo` / `eeg-web-ble-demo` reflect an older naming scheme.

Notes:

- `inject` mode described below is not implemented today
- `packages/create-elata-demo/src/cli.mjs` and `src/template.js` were proposed internals, not the current package layout

## Goal

Provide a standard, publishable way for developers to generate working Elata demo apps they can drop into a new or existing project, without bundling demo-only files into the runtime SDK packages.

## Naming Convention

Use the standard npm scaffolder convention for all app generators:

- package name: `create-<name>`
- executable name: `create-<name>`
- usage: `npm create <name>` or `npx create-<name>`

Implemented convention (see live CLI):

- **`@elata-biosciences/create-elata-demo`** is the canonical scaffolder.
- Templates: **`rppg-demo`**, **`eeg-demo`**, **`eeg-ble`** (plus aliases / legacy names for compatibility).

The bullets that follow in older sections used placeholder names (`rppg-web-demo`, etc.); map them mentally to the IDs above.

## Product Direction

Split responsibilities clearly:

- SDK packages (`eeg-web`, `eeg-web-ble`, `rppg-web`) ship runtime APIs only
- scaffolder packages (`create-*`) ship templates and generation logic
- example apps inside the repo continue to serve as development and verification fixtures

This keeps package responsibilities clean, reduces published package size, and makes versioned onboarding flows easier to test.

## Recommended Architecture

### Phase 1: Stabilize the Shared Demo Generator

Use `packages/create-elata-demo` as the canonical implementation.

Responsibilities:

- parse CLI args such as project name and `--template`
- copy a selected template into the target directory
- rename `_gitignore` to `.gitignore`
- apply placeholder transforms such as app name and package versions
- print next steps for install and run

Suggested CLI (current IDs):

```bash
npm create @elata-biosciences/elata-demo my-app -- --template rppg-demo
pnpm dlx @elata-biosciences/create-elata-demo my-app -- --template eeg-ble
```

Deliverable:

- one entry-point package that can generate multiple demo types

### Phase 2: Add First-Class Templates

Start with a small, opinionated template set (as implemented):

- `rppg-demo`
- `eeg-demo`
- `eeg-ble`

Each template should include:

- a minimal app shell
- installation-ready dependencies
- an obvious integration point for Elata APIs
- a README with browser/device requirements
- a smoke-testable `build` script

Deliverable:

- templates that are usable as examples and production starting points

### Phase 3: Optional Future Inject Mode For Existing Apps

Support adding a demo module into an existing codebase without creating a new app.

Suggested CLI:

```bash
npx @elata-biosciences/create-elata-demo inject --template rppg-demo --dir .
```
*(Not implemented; `inject` remains hypothetical.)*

Responsibilities:

- copy files into a scoped folder such as `src/elata-demo/`
- detect package manager
- update `package.json` dependencies when safe
- print manual follow-up steps when merge decisions are ambiguous

Deliverable:

- a lower-friction adoption path for teams that already have an app shell

## Repo Changes Needed

### Package Structure

Add or evolve these packages:

- `packages/create-elata-demo`

Historical proposed internals:

- `packages/create-elata-demo/src/cli.mjs`
- `packages/create-elata-demo/src/template.js`
- `packages/create-elata-demo/templates/<template-name>/...`

### Tooling

Update:

- `run.sh` package target handling
- release target ordering if new `create-*` packages are published
- repo tests so every scaffolder gets basic generation coverage
- docs and package READMEs for the new install commands

### Testing

Each scaffolder should have automated checks for:

- target directory creation
- placeholder replacement
- `_gitignore` rename behavior
- non-zero exit on invalid target directory
- generated app `package.json` correctness

For higher confidence, add smoke tests that:

- scaffold into a temp directory
- install dependencies
- run the generated app build

## Rollout Plan

1. Keep `create-elata-demo` as the single scaffold entry point. **Done.**
2. Default **`rppg-demo`** for non-interactive runs; interactive chooser lists all three. **Done.**
3. EEG templates (`eeg-demo`, `eeg-ble`) ship alongside rPPG. **Done.**
4. Package is publishable; docs live in `docs/create-elata-demo.md` and package README. **Done.**

## Open Decisions

Resolve these before implementation expands further:

- whether template versions should float to the latest compatible SDK versions or pin exact versions at publish time
- whether `inject` mode should edit `package.json` automatically or operate as a copy-only helper first
- whether demo templates should live only in scaffolder packages or also mirror repo demo apps for local development

## Recommendation

Short term (implemented):

- **`create-elata-demo`** is the only published scaffold package.
- Default template **`rppg-demo`**; legacy template names still accepted by the CLI where listed in `index.mjs`.

Open items from this plan: **`inject` mode** and optional **template/version pinning** policy remain product decisions.
