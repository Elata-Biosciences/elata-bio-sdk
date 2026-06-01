# @elata-biosciences/create-elata-demo

## 0.2.1

### Patch Changes

- d1615d6: Ship `llms.txt` in each published package for AI/tooling context, include the
  scaffolder README in the npm tarball, and add concise TSDoc on primary entry
  points so declarations surface in IDEs and `.d.ts` consumers.
- 3f4bd8f: Polish the `rppg-web-demo` template UI for clearer demos and screen recordings: top bar, large BPM readout, confidence/quality meters, higher default camera resolution, live diagnostics via `onDiagnostics`, and collapsible technical sections. Add DM Sans / IBM Plex Mono via Google Fonts.
- 7fed52d: Normalize `initEegWasm()` inputs onto the non-deprecated wasm-bindgen init
  shape, add a smoke test for the low-level rPPG pipeline wrapper, align the
  scaffolded rPPG demo with `createRppgSession()`, harden the browser rPPG runner
  to fail closed after fatal backend errors instead of reusing a broken WASM
  pipeline, and clarify that browser apps should prefer the session wrapper over
  raw generated WASM exports.
