# Implementation Plan: rPPG SDK Diagnostics And Tracker Upgrades

Status: **Phase 1 complete** in-repo (diagnostics, tracker upgrades, replay helpers, tests—see checkboxes below). Phase 2 has one open item about where a **browser-only debug panel** should live.

This document tracks the focused work of importing the most reusable rPPG
diagnostics and tracker ideas from `../TradeLock` into the SDK without pulling
product-specific UI or trading logic into this repository.

## Why this exists

The repository already has broad rPPG plans in
`docs/implementation-plan-rppg.md` and
`docs/implementation-plan-harmonic-selection.md`, but neither is a good
working plan for the narrower task of:

- improving SDK observability
- making tracker behavior more replayable and testable
- porting waveform-aware tracker context from `TradeLock`

## Scope

In scope:

- `packages/rppg-web` diagnostics helpers that are generic and SDK-safe
- `packages/rppg-web` tracker upgrades that improve reference persistence,
  waveform-aware updates, and snapshot richness
- replay-friendly utilities for offline tracker analysis in tests and demos
- package exports and tests for the new functionality

Out of scope:

- `TradeLock` UI state, calibration screens, or trading/product behavior
- copying `TradeLock/src/App.tsx`
- importing product thresholds or persistence formats unchanged

## Planned imports from TradeLock

### 1. Waveform diagnostics

Source inspiration:

- `../TradeLock/src/lib/rppgDebug.ts`

Targets in this repo:

- add a focused diagnostics module to `packages/rppg-web`
- port `computeWaveformPeriodicityProfile`
- expose a typed profile structure for tracker and replay use

### 2. Richer tracker context and state

Source inspiration:

- `../TradeLock/src/lib/bpmBayesTracker.ts`
- `../TradeLock/docs/bpm-bayes-tracker.md`

Targets in this repo:

- extend `packages/rppg-web/src/bpmBayesTracker.ts`
- support optional waveform-aware evidence
- add persistent reference prior state
- add `reinforceReference()` and `getReferenceState()`
- enrich snapshots with reference provenance and waveform reliability

### 3. Replay-friendly utilities

Source inspiration:

- `../TradeLock/src/cli/debugSessionReplayCore.ts`

Targets in this repo:

- add an SDK-local replay helper for offline tracker evaluation
- keep it pure TS and package-test friendly
- use waveform diagnostics and tracker measurements from recorded samples

## Implementation phases

### Phase 1: SDK-safe imports

- [x] Create a focused implementation plan for this workstream.
- [x] Add waveform periodicity diagnostics to `packages/rppg-web`.
- [x] Upgrade `BpmBayesTracker` with persistent reference and waveform-aware
      behavior.
- [x] Wire `RppgProcessor` to pass waveform diagnostics into the tracker.
- [x] Add a replay helper for offline tracker analysis.
- [x] Add Jest coverage for diagnostics, tracker state, and replay behavior.

### Phase 2: Demo and docs follow-up

- [x] Add demo surfaces that can display waveform profile / tracker state.
- [x] Document how to use replay utilities against recorded sessions.
- [x] Add a browser replay import/viewer page for exported replay payloads.
- [ ] Decide whether a browser-only debug panel belongs in `packages/rppg-web`
      or in a separate demo package.

## Acceptance criteria for Phase 1

- `packages/rppg-web` exports a waveform periodicity profile helper.
- `BpmBayesTracker` can preserve and restore reference prior state.
- `BpmBayesTracker` can accept waveform profile context and reference
  reinforcement without breaking existing consumers.
- `RppgProcessor` uses the new waveform profile when updating the tracker.
- Package tests cover the new behavior.

## Notes

- Prefer importing narrow algorithmic pieces instead of mirroring
  `TradeLock` structure.
- If code already exists in the SDK, port only the missing delta.
- Keep diagnostics optional and non-invasive for normal consumers.
