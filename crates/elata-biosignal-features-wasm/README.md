# elata-biosignal-features-wasm

WebAssembly bindings for `elata-biosignal-features`, mirroring the
`elata-rppg-wasm` adapter style (`cfg_attr(target_arch = "wasm32")` so
`cargo test` exercises the same code natively).

Exposes `WasmEegWindowAnalyzer`:

- `new(sample_rate_hz, channel_count, config_json?)` — optional
  `EegWindowConfig` JSON, defaults applied per field.
- `analyze_window(interleaved: Float32Array) -> string` — one coarse call per
  window; returns `EegWindowFeaturesV1` JSON.
- `update_layout(sample_rate_hz, channel_count)`.
- `config_id() -> string` — stable hash of the resolved config (provenance).

Built into `packages/biosignal-analytics/wasm/` by that package's
`scripts/build-wasm.mjs` (cargo + wasm-bindgen `--target web`).
