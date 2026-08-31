---
"@elata-biosciences/biosignal-analytics": minor
---

Add the biosignal-analytics package: a versioned metric registry with evidence
tiers and algorithm versions, WASM-backed EEG window features (Welch PSD, band
powers, spectral entropy, dominant frequency, alpha peak, Hjorth, window stats,
quality flags), HRV and robust statistics in TypeScript, and transparent
headline-score formulas (Measurement Quality, Activation, Recovery) that expose
their contributors and withhold themselves on insufficient data. Deterministic
features are parity-tested against committed Python (NumPy/SciPy) oracle
fixtures across the Rust crate, the WASM build, and TypeScript.
