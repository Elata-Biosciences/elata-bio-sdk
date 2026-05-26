# @elata-biosciences/app-metrics

Per-user metrics storage for sandboxed apps in the Elata appstore.

The package ships two entry points:

- **`@elata-biosciences/app-metrics`** — `createMetricsClient()` for apps running inside the sandboxed iframe.
- **`@elata-biosciences/app-metrics/host`** — `createMetricsHost()` for the appstore shell.

The host owns storage; the app talks to the host over a transferred `MessagePort`. Data is namespaced per `(walletAddress, appId)` and never crosses app boundaries.

See `docs/STORAGE_PLAN.md` and `docs/STORAGE_SCORES_PLAN.md` in the appstore repo for the full design.

## App-side usage

```ts
import { createMetricsClient } from "@elata-biosciences/app-metrics";

const metrics = createMetricsClient();

await metrics.record({ type: "level_complete", data: { level: 3, time: 42 } });
await metrics.saveScore({ value: 1200, meta: { level: 3 } });

const top = await metrics.loadScores({ order: "value_desc", limit: 10 });
```

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

## Planned: `reportAffect` (biometric Score)

`record`/`query`/`saveScore` are **local-only** — they never leave the device.
A planned `reportAffect` op is the one exception: with the `biometrics` scope and
user consent, an app may send a *derived* session aggregate (never raw signal) to
the Elata platform to contribute to the platform-owned biometric Score. See
[`docs/implementation-plan-affect-reporting.md`](../../docs/implementation-plan-affect-reporting.md)
and `BIOMETRIC_SCORE.md` in the appstore repo. Not yet implemented.
