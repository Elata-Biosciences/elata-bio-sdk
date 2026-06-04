# rppg-web replay benchmark

Apples-to-apples comparison of the **local** SDK rPPG Bayes pipeline against
**TradeLock's recorded outputs**, on real recorded sessions — no cross-repo
dependency, because TradeLock's per-sample outputs are already embedded in the
recording.

## How it works

TradeLock's debug recorder downloads a `tradelock-debug-session-*.json`
(`ReplayDebugSession` shape: `syncSamples` + optional `pairEvents`). Each sync
sample carries both the estimator inputs and the BPM TradeLock *recorded* at the
time. `replayBayesSession()` re-runs the SDK's `BpmBayesTracker` over those same
inputs, so we can diff:

- **Clean agreement** (`cleanAgree`): mean `|SDK replay BPM − TradeLock final BPM|`
  over only the samples TradeLock **trusted** (not suppressed) and did **not**
  manually lock/snap. This is the fair head-to-head — prefer it. In practice only
  ~20% of recorded samples qualify; the rest are TradeLock holding on low quality
  or human-pinned output.
- **All agreement** (`agreeAll`): same but over every sample. Contaminated by
  suppressed/locked samples; kept only for reference.
- **Reference MAE** (`ref*`): mean abs error vs the Muse reference, from the
  `pairEvents` windows. The only ground-truth-anchored column — but reference
  coverage is currently thin, and `refTL` is near-tautological because TradeLock
  reinforces its tracker toward the reference.

> **`cleanAgree` measures divergence from TradeLock, not correctness.** TradeLock
> is not ground truth. A large `cleanAgree` flags that the pipelines disagree; use
> reference-paired sessions (`ref*`) to decide which one is actually right.

## Run it

```bash
# 1. Build the local package so the CLI measures in-dev code (not npm).
pnpm --dir packages/rppg-web build

# 2. Point it at recordings (a dir is scanned for tradelock-debug-session-*.json).
pnpm --dir packages/rppg-web run bench:replay -- ~/Downloads
# or specific files:
node packages/rppg-web/bench/replaySessionBenchmark.mjs ~/Downloads/tradelock-debug-session-123.json
```

The comparison core (`summarizeReplaySession`, `aggregateComparisons`, `maeOf`)
is exported from the package and unit-tested in
`src/__tests__/replayBenchmark.test.ts`.

## Improvement loop

1. Run the benchmark to get a baseline (agreement + reference MAE).
2. Port a TradeLock improvement into `rppg-web`.
3. Rebuild and re-run; confirm `refSDK` dropped (closer to ground truth) and/or
   agreement moved as expected, with nothing else regressing.

## Known limitations / next steps

- Reference coverage is thin (most recordings have 0–1 `pairEvents`); agreement
  is the broad signal until more reference-paired sessions are captured.
- Covers the **BPM/Bayes** path only. ROI/mesh extraction, HRV, mental-state,
  and affect need their own fixtures (the signal-level recordings bypass
  MediaPipe). A live `RppgSessionRecorder` emitting this same `ReplayDebugSession`
  shape is the natural next addition for capturing fresh, reference-paired runs.
