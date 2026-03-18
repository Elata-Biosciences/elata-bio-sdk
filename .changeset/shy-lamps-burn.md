---
"@elata-biosciences/eeg-web": patch
"@elata-biosciences/rppg-web": patch
"@elata-biosciences/create-elata-demo": patch
---

Normalize `initEegWasm()` inputs onto the non-deprecated wasm-bindgen init
shape, add a smoke test for the low-level rPPG pipeline wrapper, align the
scaffolded rPPG demo with `createRppgSession()`, harden the browser rPPG runner
to fail closed after fatal backend errors instead of reusing a broken WASM
pipeline, and clarify that browser apps should prefer the session wrapper over
raw generated WASM exports.
