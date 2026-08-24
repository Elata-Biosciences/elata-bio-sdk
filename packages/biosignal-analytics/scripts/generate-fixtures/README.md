# Golden fixture generators

Python oracles for the committed golden fixtures in
`packages/biosignal-analytics/fixtures/`. The Rust crate
(`crates/elata-biosignal-features/tests/golden_parity.rs`), the WASM build,
and the TypeScript implementations in this package are all parity-tested
against the same JSON files.

## Regenerating

```bash
cd packages/biosignal-analytics/scripts/generate-fixtures
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python gen_eeg_fixtures.py
.venv/bin/python gen_pulse_fixtures.py
.venv/bin/python gen_stats_fixtures.py
.venv/bin/python gen_manifest.py
```

(Any Python >= 3.11 with the pinned packages works; run the scripts from this
directory so `oracle_common.py` imports.)

## Layout

- `oracle_common.py` — the normative reference implementation of every
  `algorithm@version` (welch_psd@1, eeg_band_power@2, spectral_entropy@1,
  dominant_frequency@1, alpha_peak@2, hjorth@1, window_stats@1,
  eeg_quality_flags@1, nn_clean@1, hrv_time_domain@1, summary_stats@1,
  robust_stats@1, robust_z@1). Change an algorithm => bump its version, and
  regenerate.
- `gen_eeg_fixtures.py` — EEG spectral/time-domain/quality fixtures.
- `gen_pulse_fixtures.py` — HRV time-domain fixtures.
- `gen_stats_fixtures.py` — summary/robust statistics fixtures.
- `gen_manifest.py` — records environment versions, seeds, and tolerances.

All random inputs use `np.random.default_rng(seed)` with the seeds recorded in
`fixtures/manifest.json`; sample arrays are float32-quantized before the
float64 oracle runs so the committed inputs are exactly representable in both
pipelines. Fixtures are committed; the generators run only at
algorithm-change time, never at build or test time.
