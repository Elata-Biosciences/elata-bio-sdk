---
"@elata-biosciences/app-metrics": minor
---

Add `@elata-biosciences/app-metrics`: per-user, per-app metrics storage for
sandboxed apps in the Elata App Store. Apps bundle `createMetricsClient()` and
record events through a transferred `MessagePort`; the appstore host owns the
storage adapter (IndexedDB by default), per-app namespacing, quotas, and rate
limits. Server never sees plaintext. See `docs/STORAGE_PLAN.md` in the appstore
repo for the full design.
