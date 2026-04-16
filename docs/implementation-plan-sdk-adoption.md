# SDK Adoption And Developer Experience Plan

Status: **largely complete** for Phases 0–2 below (see checkboxes). Treat **[guides/README.md](guides/README.md)**, **[create-elata-demo.md](create-elata-demo.md)**, and **package READMEs** as the live onboarding surface. Remaining work is iterative polish (guides depth, API reference, error messaging), not greenfield scaffolding.

## Progress Snapshot

- [x] Phase 0 baseline report now exists in `docs/`
- [x] Phase 0 grouped issue list now exists in `docs/`
- [x] Root README now has package-selection guidance
- [x] Root README now has a compatibility summary
- [x] Package READMEs include “when to use it” and troubleshooting guidance
- [x] Scaffolded apps now include generated template READMEs
- [x] Scaffolded templates now pin to current live package versions
- [x] Consumer-oriented guides now exist under `docs/guides/`
- [x] The first consumer guide set is now complete
- [x] A centralized compatibility matrix now exists for published SDK surfaces
- [x] Local tarball-based consumer smoke testing exists via `pnpm smoke:consumers`
- [x] CI now runs consumer smoke tests against local packaged artifacts

## Goal

Make Elata feel like a product-grade SDK that external developers can discover,
adopt, integrate, and trust without needing to understand repo internals first.

## Product Principles

- Time to first success should be measured in minutes, not hours.
- Public entry points should be obvious and stable.
- Consumer docs should not require maintainer knowledge.
- Package usage should feel simpler than the monorepo that produces it.
- Errors and caveats should be actionable, not surprising.

## Success Metrics

- A new developer can scaffold and run a demo in 5 minutes or less.
- A developer can choose the right package from the README without guessing.
- Consumer-facing examples build successfully outside the monorepo in CI.
- Package docs and runtime behavior stay aligned release-to-release.
- Platform caveats are documented before users hit them at runtime.

## Phase 0: Baseline And Audit

Objective:

- establish a measured baseline before changing onboarding and docs

Tasks:

- [x] document the current “new developer” flows for:
  - scaffold a demo app
  - add SDK packages to an existing app
  - run EEG web demo
  - run rPPG web demo
- [x] measure time-to-first-success and friction points for each flow
- [x] list current public surfaces:
  - README
  - package READMEs
  - `create-elata-demo`
  - package exports
  - demo templates
- [x] identify all consumer-facing docs that still read like maintainer docs

Deliverables:

- [x] a short baseline report in `docs/`
- [x] an issue list grouped by onboarding, package docs, runtime UX, and release UX

Exit criteria:

- the team agrees on the top friction points and success metrics

## Phase 1: Lock The Canonical Entry Points

Objective:

- make it impossible for new users to misunderstand how to start

Tasks:

- [x] keep `create-elata-demo` as the primary “new project” path
- [x] make the root README answer three questions quickly:
  - what packages exist
  - which one should I use
  - how do I start fast
- [x] add a “Choose the right package” section to the root README
- [x] add a “When to use this package” section to every package README
- [x] keep `sync-to` explicitly framed as local `eeg-web` development only
- [x] add a short compatibility summary to the root README:
  - browser support
  - BLE caveats
  - Safari/iOS limitation
  - Node requirement

Deliverables:

- clearer README
- aligned package README intros
- explicit package-selection guidance

Exit criteria:

- a new user can identify the right starting path from the root README alone

## Phase 2: Make Demo Scaffolding Feel Product-Grade

Objective:

- turn the scaffolder into a polished onboarding surface

Tasks:

- [x] add a generated README to each scaffolded template
- [x] include template-specific notes in generated apps:
  - what the app demonstrates
  - required browser capabilities
  - required hardware, if any
  - how to run it
- [x] ensure scaffolder output prints the correct next steps for:
  - standalone app
  - app created inside a parent `pnpm` workspace
- [x] review all template copy for clarity and consistency
- [ ] add template screenshots or GIF references where helpful
- [ ] consider a “doctor” or “preflight” script for scaffolded apps if setup friction remains high

Deliverables:

- stronger generated app docs
- less ambiguity after scaffolding
- fewer support questions caused by environment assumptions

Exit criteria:

- scaffolded apps are understandable without reading the monorepo docs

## Phase 3: Strengthen Consumer Package Docs And Examples

Objective:

- make each published package usable without source-diving

Tasks:

- [x] standardize all package READMEs around:
  - what this package is
  - when to use it
  - install
  - requirements
  - minimal usage
  - build/dev notes
  - release notes link
- [x] add one “recommended path” example per package
- [ ] add one “advanced/custom integration” example where relevant
- [x] ensure examples reflect current runtime behavior:
  - `rppg-web` should show `loadWasmBackend()` first
  - `eeg-web-ble` should show realistic transport startup and caveats
- [x] add links between related packages:
  - `eeg-web-ble` -> `eeg-web`
  - `rppg-web` -> scaffolder and demo paths

Deliverables:

- package READMEs that can serve as public docs
- examples that match the actual recommended integration path

Exit criteria:

- a developer can use each package from its README without needing repo archaeology

## Phase 4: Publish Consumer-Facing Reference Docs

Objective:

- separate product docs from internal planning and maintainer notes

Tasks:

- [x] create a consumer-oriented docs area, either:
  - a lightweight `docs/guides/` structure in-repo, or
  - a generated docs site later
- [x] add the first guide set:
  - [x] getting started
  - [x] choosing packages
  - [x] using EEG in a browser app
  - [x] using Web Bluetooth with supported devices
  - [x] using rPPG in a browser app
  - [x] troubleshooting common failures
- [x] add a compatibility matrix covering:
  - browser support
  - Web Bluetooth support
  - Safari/iOS behavior
  - supported device classes
  - Node and package manager expectations
- [x] separate planning docs from public docs in navigation

Deliverables:

- a consumer-focused docs path
- a compatibility matrix
- clearer boundaries between product docs and engineering plans

Exit criteria:

- a new user can stay inside consumer docs for normal setup and integration

## Phase 5: Add API Reference And Type-Level Discoverability

Objective:

- reduce ambiguity in the public API surface

Tasks:

- generate TypeScript API reference from public exports for published packages
- identify which Rust crates need public API docs for external integrators
- add “public API” validation to release review:
  - exports list
  - docs coverage for public entry points
  - migration notes for changed behavior
- consider a small reference page per package listing:
  - primary classes/functions
  - expected inputs
  - typical lifecycle

Deliverables:

- API reference for TS packages
- better clarity around supported exports

Exit criteria:

- developers can answer “what does this export do?” without opening source files

## Phase 6: Improve Runtime UX And Troubleshooting

Objective:

- make failures understandable and recoverable

Tasks:

- [ ] audit user-facing error messages across:
  - scaffolded apps
  - `eeg-web-ble`
  - `rppg-web`
  - WASM-loading paths
- [ ] replace vague failures with actionable guidance
- [x] document expected failure modes:
  - unsupported browser
  - missing secure context
  - missing BLE support
  - missing packaged WASM assets
  - workspace install pitfalls
- [x] add troubleshooting sections to relevant package READMEs and consumer docs

Deliverables:

- better runtime error messages
- troubleshooting guidance that matches real failures

Exit criteria:

- common developer failures point directly to a fix or next step

## Phase 7: Add True Consumer Smoke Tests

Objective:

- validate the published experience, not just the monorepo experience

Tasks:

- [x] add CI jobs that simulate real consumers:
  - scaffold app outside the repo workspace
  - install package tarballs or published-style artifacts
  - build the generated app
  - run lightweight runtime smoke checks if feasible
- [x] add one smoke flow for each entry point:
  - [x] `create-elata-demo`
  - [x] `@elata-biosciences/eeg-web`
  - [x] `@elata-biosciences/eeg-web-ble`
  - [x] `@elata-biosciences/rppg-web`
- [x] ensure release verification covers consumer packaging expectations, not just internal builds

Deliverables:

- CI coverage for actual developer adoption paths
- fewer regressions in public-facing workflows

Exit criteria:

- the repo can prove the documented consumer flows still work

## Phase 8: Clarify Stability, Versioning, And Migration

Objective:

- increase trust in the SDK over time

Tasks:

- define a public stability policy:
  - stable APIs
  - experimental APIs
  - deprecation expectations
- add migration notes for releases that affect public behavior
- document semver expectations for package consumers
- identify which exports are compatibility layers versus preferred long-term paths

Deliverables:

- stability policy
- migration guidance format
- clearer trust signals for adopters

Exit criteria:

- users can predict what a version bump means for them

## Recommended Execution Order

1. Phase 0: Baseline and audit
2. Phase 1: Lock canonical entry points
3. Phase 2: Make demo scaffolding product-grade
4. Phase 3: Strengthen consumer package docs and examples
5. Phase 4: Publish consumer-facing reference docs
6. Phase 6: Improve runtime UX and troubleshooting
7. Phase 7: Add true consumer smoke tests
8. Phase 5: Add API reference and type-level discoverability
9. Phase 8: Clarify stability, versioning, and migration

Why this order:

- phases 1 to 4 improve first impressions and reduce confusion fastest
- phase 6 reduces frustration once users hit real-world platform issues
- phase 7 protects the improved experience from regression
- phase 5 becomes more valuable after public entry points are stable
- phase 8 should codify the public contract once the main adoption surfaces are cleaner

## Quick Wins

These can land immediately while broader work is being planned:

- add “Choose the right package” to the root README
- add generated READMEs to scaffold templates
- add troubleshooting sections to package READMEs
- add a browser and platform compatibility table
- add consumer smoke tests for scaffolded apps outside the workspace

## Risks

- improving docs without consumer smoke tests may create false confidence
- adding too many public surfaces at once can increase maintenance burden
- mixing internal planning docs with public docs can still confuse users unless navigation stays explicit
- runtime/platform complexity, especially Web Bluetooth and Safari/iOS, can still overwhelm new users unless errors are carefully handled

## Recommendation

Start with Phases 0 through 3 in one coordinated DX sprint. That gives the repo
clear public entry points, stronger scaffolding, and package docs that better
match reality. Then use Phases 4, 6, and 7 to turn that clearer story into a
durable, testable product experience.
