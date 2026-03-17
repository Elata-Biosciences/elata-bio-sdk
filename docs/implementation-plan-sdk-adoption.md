# SDK Adoption And Developer Experience Plan

Status: proposed implementation plan

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

- document the current “new developer” flows for:
  - scaffold a demo app
  - add SDK packages to an existing app
  - run EEG web demo
  - run rPPG web demo
- measure time-to-first-success and friction points for each flow
- list current public surfaces:
  - README
  - package READMEs
  - `create-elata-demo`
  - package exports
  - demo templates
- identify all consumer-facing docs that still read like maintainer docs

Deliverables:

- a short baseline report in `docs/`
- an issue list grouped by onboarding, package docs, runtime UX, and release UX

Exit criteria:

- the team agrees on the top friction points and success metrics

## Phase 1: Lock The Canonical Entry Points

Objective:

- make it impossible for new users to misunderstand how to start

Tasks:

- keep `create-elata-demo` as the primary “new project” path
- make the root README answer three questions quickly:
  - what packages exist
  - which one should I use
  - how do I start fast
- add a “Choose the right package” section to the root README
- add a “When to use this package” section to every package README
- keep `sync-to` explicitly framed as local `eeg-web` development only
- add a short compatibility summary to the root README:
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

- add a generated README to each scaffolded template
- include template-specific notes in generated apps:
  - what the app demonstrates
  - required browser capabilities
  - required hardware, if any
  - how to run it
- ensure scaffolder output prints the correct next steps for:
  - standalone app
  - app created inside a parent `pnpm` workspace
- review all template copy for clarity and consistency
- add template screenshots or GIF references where helpful
- consider a “doctor” or “preflight” script for scaffolded apps if setup friction remains high

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

- standardize all package READMEs around:
  - what this package is
  - when to use it
  - install
  - requirements
  - minimal usage
  - build/dev notes
  - release notes link
- add one “recommended path” example per package
- add one “advanced/custom integration” example where relevant
- ensure examples reflect current runtime behavior:
  - `rppg-web` should show `loadWasmBackend()` first
  - `eeg-web-ble` should show realistic transport startup and caveats
- add links between related packages:
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

- create a consumer-oriented docs area, either:
  - a lightweight `docs/guides/` structure in-repo, or
  - a generated docs site later
- add the first guide set:
  - getting started
  - choosing packages
  - using EEG in a browser app
  - using Web Bluetooth with supported devices
  - using rPPG in a browser app
  - troubleshooting common failures
- add a compatibility matrix covering:
  - browser support
  - Web Bluetooth support
  - Safari/iOS behavior
  - supported device classes
  - Node and package manager expectations
- separate planning docs from public docs in navigation

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

- audit user-facing error messages across:
  - scaffolded apps
  - `eeg-web-ble`
  - `rppg-web`
  - WASM-loading paths
- replace vague failures with actionable guidance
- document expected failure modes:
  - unsupported browser
  - missing secure context
  - missing BLE support
  - missing packaged WASM assets
  - workspace install pitfalls
- add troubleshooting sections to relevant package READMEs and consumer docs

Deliverables:

- better runtime error messages
- troubleshooting guidance that matches real failures

Exit criteria:

- common developer failures point directly to a fix or next step

## Phase 7: Add True Consumer Smoke Tests

Objective:

- validate the published experience, not just the monorepo experience

Tasks:

- add CI jobs that simulate real consumers:
  - scaffold app outside the repo workspace
  - install package tarballs or published-style artifacts
  - build the generated app
  - run lightweight runtime smoke checks if feasible
- add one smoke flow for each entry point:
  - `create-elata-demo`
  - `@elata-biosciences/eeg-web`
  - `@elata-biosciences/eeg-web-ble`
  - `@elata-biosciences/rppg-web`
- ensure release verification covers consumer packaging expectations, not just internal builds

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
