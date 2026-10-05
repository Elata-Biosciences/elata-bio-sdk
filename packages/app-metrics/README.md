# @elata-biosciences/app-metrics

Per-user metrics storage for sandboxed apps in the Elata appstore.

The package ships two entry points:

- **`@elata-biosciences/app-metrics`** — `createMetricsClient()` for apps running inside the sandboxed iframe.
- **`@elata-biosciences/app-metrics/host`** — `createMetricsHost()` for the appstore shell.

The host owns storage; the app talks to the host over a transferred `MessagePort`. Data is namespaced per `(walletAddress, appId)` and never crosses app boundaries.

Platform docs: [Metrics and scores](https://docs.elata.bio/apps/platform/metrics-and-scores) on docs.elata.bio.

## App-side usage

```ts
import { createMetricsClient } from "@elata-biosciences/app-metrics";

const metrics = createMetricsClient();

await metrics.record({ type: "level_complete", data: { level: 3, time: 42 } });
await metrics.saveScore({ value: 1200, meta: { level: 3 } });

const top = await metrics.loadScores({ order: "value_desc", limit: 10 });
```

| Method | What it does |
| --- | --- |
| `ready()` | Resolves once the host handshake completes |
| `record({ type, data })` | Store an event record (up to 64 KB by default) |
| `query({ type?, since?, until?, limit? })` | Read records back |
| `clear()` | Delete this app's records for the user |
| `saveScore({ value, meta? })` | Store a numeric score |
| `loadScores({ order?, since?, until?, limit? })` | Read scores; `order` is `"value_desc"` or `"timestamp_desc"` |
| `reportAffect(report)` | Contribute a derived session result to the biometric Score (see below) |
| `dispose()` | Tear down listeners; pending calls reject with `disposed` |

Calls reject with `MetricsClientError`, whose `code` is a host code
(`quota_exceeded`, `invalid_payload`, `rate_limited`, `internal`,
`scope_denied`, `not_supported`) or a local one (`handshake_timeout`,
`disposed`, `transport`).

## Host-side usage (appstore)

```ts
import { createMetricsHost, createIndexedDbAdapter } from "@elata-biosciences/app-metrics/host";

const host = createMetricsHost({
  iframe,
  appId,
  walletAddress,
  storage: createIndexedDbAdapter(),
});
host.start();
```

## `reportAffect` (biometric Score)

Where `record`, `query`, and `saveScore` data is kept is up to the host. The
Elata App Store keeps a local copy and syncs it to the signed-in user's
account; it never leaves that `(user, app)` scope.

`reportAffect` is different: with the `biometrics` scope and the user's
consent, an app sends a *derived* session aggregate (never raw signal) to the
Elata platform, where it contributes to the user's cross-app biometric Score.

```ts
const result = await metrics.reportAffect({
  dimension: "calm",      // "calm" | "stress" | "focus"
  baselineValue: 0.42,    // 0..1
  sessionValue: 0.61,     // 0..1
  delta: 0.19,            // -1..1
  meanHr: 68,             // optional
  signalQuality: 0.85,    // 0..1
  confidence: 0.8,        // 0..1
  source: "rppg",
  durationSec: 300,
});
// { accepted, calibrating, score }  (score is 0-100 once calibrated, else null)
```

It rejects with `scope_denied` if the app lacks the `biometrics` scope or the
user has not consented, and with `not_supported` if the host has no handler.
See [Consent and insights](https://docs.elata.bio/apps/platform/consent-and-insights)
for how apps request consent.
