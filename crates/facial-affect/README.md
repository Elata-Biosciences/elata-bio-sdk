Facial Affect Core (Rust)
=========================

This crate implements a small, calibration-based facial affect classifier meant to run on-device (native or WASM).

Key concepts
- `LandmarkMetrics` (smile, brow_height, brow_distance, eye_openness) — a small vector of normalized metrics.
- `SentimentCore` — smoothing, baseline calibration, simple heuristic rules (happy, surprised, stressed, focused, fatigue).

Usage (pseudo):

```rust
let mut core = facial_affect::SentimentCore::default();
// during calibration
core.start_calibration();
// feed several frames of neutral/personal baseline
for m in baseline_metrics { core.update_from_metrics(m, ts); }
core.finalize_calibration();

// during runtime
let out = core.update_from_metrics(metrics, ts);
println!("label={:?} conf={}", out.label, out.confidence);
```

Notes
- Landmark -> metric translation is intentionally left for adapters (MediaPipe/JS or native). Use `getDistance` (inter-eye) to normalize distances.
- The goal is to keep the core pure and lightweight so it can be ported to WASM/FFI easily.
