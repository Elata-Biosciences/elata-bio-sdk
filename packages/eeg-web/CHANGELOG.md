# Changelog

> Entries below stop at 0.2.1. Versions after that (through 0.12.0) were released
> without Changesets entries. See the
> [git history](https://github.com/Elata-Biosciences/elata-bio-sdk/commits/main/packages/eeg-web)
> for those changes. New releases cut with `./run.sh bump` are recorded here again.

## 0.2.1

### Patch Changes

- d1615d6: Ship `llms.txt` in each published package for AI/tooling context, include the
  scaffolder README in the npm tarball, and add concise TSDoc on primary entry
  points so declarations surface in IDEs and `.d.ts` consumers.
- 7fed52d: Normalize `initEegWasm()` inputs onto the non-deprecated wasm-bindgen init
  shape, add a smoke test for the low-level rPPG pipeline wrapper, align the
  scaffolded rPPG demo with `createRppgSession()`, harden the browser rPPG runner
  to fail closed after fatal backend errors instead of reusing a broken WASM
  pipeline, and clarify that browser apps should prefer the session wrapper over
  raw generated WASM exports.

All notable changes to `@elata-biosciences/eeg-web` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2024-01-01

### Added

- Initial public release of the EEG WASM web wrapper.
- `initEegWasm` and `initEegWasmSync` initialization helpers.
- Re-exports of all `wasm-bindgen` generated APIs.
- `HeadbandFrameV1` frame schema and `HeadbandTransport` interface.
- `HeadbandTransportState` enum for transport lifecycle.
