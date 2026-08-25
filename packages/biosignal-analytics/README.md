# @elata-biosciences/biosignal-analytics

Browser-native analytics over standardized Elata biosignal data: a versioned
metric registry, WASM-backed EEG window features, HRV and robust statistics,
and transparent headline-score formulas.

The package is useful on its own — it does not require the Elata App Store, a
server, or a network connection. It pairs naturally with
`@elata-biosciences/biosignal-session`, which records the sessions this
analyzes.

## Entry points

| Entry | Contents |
| --- | --- |
| `.` | Everything below, re-exported |
| `./registry` | Metric definitions, evidence tiers, algorithm versions |
| `./insights` | Personal baselines and headline-score formulas |
| `./worker` | The analytics worker entry (module worker) |
| `./testing` | Fixture loaders and synthetic signal helpers |
| `./wasm/*` | Built WASM glue and binary |

## Scientific discipline

Every metric carries a **registered definition**: unit, evidence tier
(`beta-default` / `advanced` / `experimental` / `rejected`), measurement class,
the exact `algorithm@version` that produced it, quality gates, and aggregation
policy. Observations carry provenance, so a value can always be traced to its
inputs and recomputed when an algorithm improves.

Deterministic feature code is verified against **Python oracle fixtures**
(NumPy/SciPy) committed under `fixtures/`, with declared tolerances. The same
fixtures gate three implementations — the Rust crate, the WASM build, and the
TypeScript helpers — so the numbers agree across all of them. Regenerate with
`scripts/generate-fixtures/` (see its README).

## EEG window features

One coarse call per window keeps the JS/WASM boundary cheap: a window of
interleaved samples goes in, one structured result comes out — window stats,
absolute/relative/log band powers, spectral entropy, dominant frequency,
qualified alpha peak, Hjorth parameters, and quality flags (flatline, clipping,
extreme amplitude, line noise), plus the `configId` and algorithm versions that
produced them.

```ts
import { analyzeEeg, initAnalyticsWasm } from "@elata-biosciences/biosignal-analytics";

await initAnalyticsWasm();
const result = await analyzeEeg({
  samples,                       // interleaved samples[sampleIdx][channelIdx]
  sampleRateHz: 256,
  channels: ["TP9", "AF7", "AF8", "TP10"],
});
```

## Headline scores

Scores are product interpretations, never measurements, and they say so.
`scoreMeasurementQuality` describes the *recording* rather than the person and
is always available alongside any other score. Every other score — Activation,
Recovery, Focus, Readiness, Resilience — exposes every contributor with its
weight, robust z-score, and quality, and **withholds itself** (a `null` value
plus a machine-readable reason) when the personal baseline, the data quality,
or the history behind it is insufficient. A missing contributor never silently
becomes a neutral middle value: weights are renormalized over the contributors
that were actually included.

The withhold reasons are part of the contract, not diagnostics:

| reason | meaning |
| --- | --- |
| `inputs_missing` | the measurement was not made |
| `insufficient_quality` | it was made too poorly to read |
| `insufficient_baseline` | there is no usable personal baseline to compare it to |
| `no_activation_detected` | Recovery: nothing qualified as an activation |
| `recovery_incomplete` | Recovery: the recording ended before the activation came back down |
| `no_task_context` | Focus: nothing was being attended to |
| `insufficient_history` | Readiness / Resilience: below the minimum-history policy |

`insufficient_history` carries a counted `withheldDetail` — `{requirement,
have, need}` per unmet floor — so a caller can say "eleven more days" rather
than "not enough data". Readiness requires 14 qualified days spanning 14
calendar days; Resilience requires 21 of each plus 6 recovered activation
episodes. Rolling personal baselines (`computeRollingBaseline`) supply the
30-day median, MAD and 10/25/75/90 personal ranges those policies are measured
against, with Hampel outlier rejection and the same day-count gating.

Focus is deliberately **not** a theta/beta ratio — that ratio is not a valid
attention measure, so neither band is an input, and tests assert it.

## Workers

Analysis runs off the UI thread through a small versioned protocol. The client
takes an injected port or worker factory, so tests and host-owned ports work
without a real worker:

```ts
import {
  createAnalyticsWorkerClient,
  launchAnalyticsWorker,
} from "@elata-biosciences/biosignal-analytics";

const client = createAnalyticsWorkerClient({ createWorker: launchAnalyticsWorker });
```

`launchAnalyticsWorker` lives in its own module because `import.meta` cannot be
parsed under Jest's CJS transform; tests inject a `port` instead.
