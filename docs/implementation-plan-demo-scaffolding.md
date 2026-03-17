# Demo Scaffolding Implementation Plan

## Goal

Provide a standard, publishable way for developers to generate working Elata demo apps they can drop into a new or existing project, without bundling demo-only files into the runtime SDK packages.

## Naming Convention

Use the standard npm scaffolder convention for all app generators:

- package name: `create-<name>`
- executable name: `create-<name>`
- usage: `npm create <name>` or `npx create-<name>`

Current repo convention after this cleanup:

- use `@elata-biosciences/create-elata-demo` as the canonical scaffolder
- expose `rppg-web-demo`, `eeg-web-demo`, and `eeg-web-ble-demo` as templates
- remove legacy standalone or nonstandard names in repo tooling

If we later want a broader multi-template entry point, prefer:

- `@elata-biosciences/create-elata-demo`

That package can expose templates such as `rppg-web-demo`, `eeg-web-demo`, and `eeg-web-ble-demo`.

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

Suggested CLI:

```bash
npm create @elata-biosciences/elata-demo my-app -- --template rppg-web-demo
pnpm dlx @elata-biosciences/create-elata-demo my-app --template eeg-web-ble-demo
```

Deliverable:

- one entry-point package that can generate multiple demo types

### Phase 2: Add First-Class Templates

Start with a small, opinionated template set:

- `rppg-web-demo`
- `eeg-web-demo`
- `eeg-web-ble-demo`

Each template should include:

- a minimal app shell
- installation-ready dependencies
- an obvious integration point for Elata APIs
- a README with browser/device requirements
- a smoke-testable `build` script

Deliverable:

- templates that are usable as examples and production starting points

### Phase 3: Optional Inject Mode for Existing Apps

Support adding a demo module into an existing codebase without creating a new app.

Suggested CLI:

```bash
npx @elata-biosciences/create-elata-demo inject --template rppg-web-demo --dir .
```

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

Potential shared internals:

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

1. Keep `create-elata-demo` as the single scaffold entry point.
2. Keep `rppg-web-demo` as the default template for the first-run path.
3. Add EEG web templates after the shared flow is proven.
4. Update docs and release flow once the package is publishable.

## Open Decisions

Resolve these before implementation expands further:

- whether template versions should float to the latest compatible SDK versions or pin exact versions at publish time
- whether `inject` mode should edit `package.json` automatically or operate as a copy-only helper first
- whether demo templates should live only in scaffolder packages or also mirror repo demo apps for local development

## Recommendation

Short term:

- keep `create-elata-demo` as the only published scaffold package
- keep `rppg-web-demo` as the default template
- remove old standalone naming and package duplication

This gives us one clear user entry point and a coherent family of templates without duplicate packages.
