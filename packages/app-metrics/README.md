# @elata-biosciences/app-metrics

Per-user, per-app metrics storage for sandboxed apps in the Elata App Store.

Apps record events through a `MessageChannel`; the appstore host owns storage,
namespacing, quotas, and (eventually) end-to-end encryption. The server never
sees plaintext metrics.

See [`docs/STORAGE_PLAN.md`](../../../quantify/docs/STORAGE_PLAN.md) for the full design.

## App-side (sandboxed iframe)

```ts
import { createMetricsClient } from "@elata-biosciences/app-metrics";

const metrics = createMetricsClient();

await metrics.record({
  type: "level_complete",
  data: { level: 3, durationMs: 42_000 },
});

const recent = await metrics.query({ type: "level_complete", limit: 50 });
```

The client waits for the host handshake automatically. If the app is loaded
outside the appstore (e.g. opened directly), `record`/`query` will reject after
the handshake timeout.

## Host-side (appstore shell)

```ts
import {
  createMetricsHost,
  createIndexedDbAdapter,
} from "@elata-biosciences/app-metrics/host";

const host = createMetricsHost({
  iframe,
  appId: "0xabc...",            // assigned by the appstore, immutable per iframe
  walletAddress: account.address,
  storage: createIndexedDbAdapter(),
});
iframe.addEventListener("load", () => host.start(), { once: true });
// later:
host.stop();
```

## Guarantees

- Apps can never read other apps' records — the host scopes every read by `appId`.
- Apps cannot forge `appId`, `walletAddress`, `timestamp`, or record `id`.
- Per-app default quota: 5 MB. Per-record cap: 64 KB. Write rate: 100/min.
- Storage adapter is pluggable; the host shipped here uses IndexedDB by default.

## Status

- 0.1.0 — Stage 1 (local-only IndexedDB). No cross-device sync. No encryption
  layer yet — `STORAGE_PLAN.md` covers the Stage 2 path.
