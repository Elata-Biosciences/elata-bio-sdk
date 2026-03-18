---
"@elata-biosciences/eeg-web": patch
"@elata-biosciences/rppg-web": patch
---

Normalize `initEegWasm()` inputs onto the non-deprecated wasm-bindgen init
shape, add a smoke test for the low-level rPPG pipeline wrapper, and clarify
that browser apps should prefer `createRppgSession()` over raw generated WASM
exports.
