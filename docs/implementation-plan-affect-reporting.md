# Affect Reporting Implementation Plan (`reportAffect`)

Status: **proposed** — greenfield. No code written yet; this is the build spec.

## Goal

Let a sandboxed app contribute a **derived per-session affect aggregate** to the
Elata platform's biometric **Score** (Readiness/Calm/…), so app usage can move a
user's score and rank apps by their contribution.

This is the SDK half of the appstore spec
[`BIOMETRIC_SCORE.md`](../../elata-appstore/docs/BIOMETRIC_SCORE.md). The appstore
half already exists: the `AffectSample`/`UserScore` tables, the
`POST /api/scores/affect` route, the score math (`src/lib/scores/`), and the
`biometrics` scope on the embed bridge. **This plan adds the one missing link:
the `reportAffect` op on `@elata-biosciences/app-metrics`.**

Reference sensing integration: `../catbridge` already uses
`@elata-biosciences/rppg-web` (`createManagedRppgSession`) for live HR — it just
doesn't report anything back yet. It is the first app to wire `reportAffect`.

## Principles (binding)

1. **Derived aggregates only — never raw signal.** No webcam frames, no per-beat
   waveform, no landmark series ever leave the app. `reportAffect` carries only
   the session-level scalars below. This is the SDK enforcement of
   `APP_SUBMISSION_POLICY.md` §2.
2. **`reportAffect` is the one op that is *not* local-only.** Every existing
   metrics op (`record`/`query`/`saveScore`) stays in the user's IndexedDB and
   never touches a server. `reportAffect` deliberately forwards to the appstore
   server — that server departure is the whole point of a *platform-owned* score
   and is why it is gated (scope + consent).
3. **Outcome, not minutes.** The SDK reports a measured affect *level/delta*, not
   time-in-app. Time alone must never produce a contribution.
4. **The host injects identity.** The client never sends `appId`/`walletAddress`;
   the host already owns both. Prevents an app from attributing samples elsewhere.

## Wire protocol changes — `packages/app-metrics/src/protocol.ts`

This file is **mirrored verbatim** in the appstore at
`src/lib/metrics-host/protocol.ts`. Any change here must be applied there in the
same PR cycle. Add additively at `v: 1` (unknown ops already return
`invalid_payload`, which the client surfaces for feature detection — same as
`saveScore` shipped).

### New payload + op

```ts
/** v0 dimension is 'calm'; others reserved for later sensors. */
export type AffectDimension = "calm" | "stress" | "focus";

/**
 * Derived per-session aggregate. Mirrors the appstore `/api/scores/affect`
 * body and `src/lib/scores/types.ts` SessionSummary (minus host-injected
 * identity). All values are derived scalars — never raw signal.
 */
export interface AffectReport {
  dimension: AffectDimension;       // 'calm' for v0
  baselineValue: number;            // 0..1, start-of-session baseline
  sessionValue: number;             // 0..1, recency-weighted in-session mean
  delta: number;                    // -1..1
  meanHr?: number;                  // session-aggregate vital, not a waveform
  signalQuality: number;            // 0..1
  confidence: number;               // 0..1, rises with #sensors
  source: string;                   // 'rppg' | 'rppg+hrv' | …
  durationSec: number;              // integer seconds
}
```

Add to `ClientRequest`:

```ts
| { v: 1; id: string; op: "reportAffect"; report: AffectReport }
```

Add to `HostErrorCode`:

```ts
| "scope_denied"      // app lacks the biometrics scope, or user has not consented
| "not_supported"     // host has no reportAffect handler wired
```

Add a validator and call it from `isClientRequest`:

```ts
export function isValidAffectReport(value: unknown): value is AffectReport {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  const in01 = (n: unknown) => typeof n === "number" && n >= 0 && n <= 1;
  return (
    (r.dimension === "calm" || r.dimension === "stress" || r.dimension === "focus") &&
    in01(r.baselineValue) && in01(r.sessionValue) &&
    typeof r.delta === "number" && r.delta >= -1 && r.delta <= 1 &&
    in01(r.signalQuality) && in01(r.confidence) &&
    typeof r.source === "string" && r.source.length > 0 && r.source.length <= 64 &&
    typeof r.durationSec === "number" && Number.isInteger(r.durationSec) && r.durationSec >= 0 &&
    (r.meanHr === undefined || (typeof r.meanHr === "number" && r.meanHr >= 20 && r.meanHr <= 240))
  );
}
// in isClientRequest:
if (v.op === "reportAffect") return isValidAffectReport(v.report);
```

## Client API — `packages/app-metrics/src/client.ts`

Add to `MetricsClient`:

```ts
/**
 * Report a derived affect aggregate toward the platform Score. Unlike record/
 * saveScore this leaves the device (to the Elata platform only) and requires
 * the biometrics scope + user consent — rejects with `scope_denied` otherwise.
 */
reportAffect(report: AffectReport): Promise<ReportAffectResult>;
```

```ts
export interface ReportAffectResult {
  accepted: boolean;     // false if the host dropped it as unqualified
  calibrating: boolean;  // true while the user is below cold-start
  score: number | null;  // 0–100 once calibrated, else null
}
```

Implementation mirrors the existing `send<T>()` pattern:

```ts
reportAffect: (report) =>
  send<ReportAffectResult>({ op: "reportAffect", report }),
```

No `appId`/`walletAddress` — the host injects them.

## Host changes — `packages/app-metrics/src/host.ts`

The host cannot satisfy `reportAffect` from local storage; it must forward to
the appstore server. So the appstore provides a handler and the granted scope:

```ts
export interface MetricsHostOptions {
  // …existing…
  /** Capabilities granted to this app (from the embed ELATA_INIT handshake). */
  scopes?: ("biometrics")[];
  /** Whether the user has consented to biometric contribution this session. */
  biometricsConsent?: boolean;
  /**
   * Forwards a derived affect report to the platform. Provided by the appstore
   * (POSTs to /api/scores/affect with the host's appId + walletAddress).
   * If omitted, reportAffect returns `not_supported`.
   */
  onReportAffect?: (
    report: AffectReport,
    ctx: { appId: string; walletAddress: string },
  ) => Promise<ReportAffectResult>;
}
```

Host dispatch for `reportAffect`:

1. If no `onReportAffect` → respond `{ ok: false, error: "not_supported" }`.
2. If `scopes` lacks `"biometrics"` or `biometricsConsent !== true` →
   `{ ok: false, error: "scope_denied" }`.
3. Apply the existing **write rate limit** (reuse `writeRateLimit`) — affect
   reports are writes and must be capped per the anti-farming rules.
4. Validate with `isValidAffectReport` → `invalid_payload` on failure.
5. `await onReportAffect(report, { appId, walletAddress })`, return its result.

The host does **not** persist affect reports to the storage adapter — they are
not local data. The server (`/api/scores/affect`) is the source of truth and
re-derives `qualified` itself.

## Sensing helper (recommended)

So app authors don't each re-implement baseline/recency/quality math (and
diverge from the appstore's `src/lib/scores/sampling.ts`), ship a small
accumulator. Proposed: a sibling export `@elata-biosciences/app-metrics/affect`,
or a helper in `rppg-web`.

```ts
const acc = createAffectAccumulator({ source: "rppg" });
// each rPPG tick:
acc.push({ tMs, value: snapshotToCalm(snap), quality: snap.gating.quality });
// at session end:
const report = acc.summarize();          // → AffectReport
if (report) await metrics.reportAffect(report);
```

`summarize()` must produce the same shape and use the same baseline-window /
recency-weighting / quality-floor rules as the appstore
`summarizeSession()` (keep them in sync; ideally extract a shared module). It
returns `null` for an unusable session (too short / below quality floor) so the
app simply skips the call.

`snapshotToCalm(RppgAppSnapshot) → 0..1` is the one model-specific mapping — HR
(and later HRV/respiration) to a calm scalar. v0 may start with a coarse
HR-based mapping; confidence stays low (`source: "rppg"`) until HRV lands, which
keeps the user "Calibrating" per the appstore cold-start rules.

## Versioning & compatibility

- Additive at `PROTOCOL_VERSION = 1`. Old hosts return `invalid_payload` for the
  unknown op; the client treats that as "reportAffect unsupported" for feature
  detection (mirror the `saveScore` rollout note in `STORAGE_SCORES_PLAN.md`).
- No bump to `INIT_MESSAGE_KIND` or the handshake.

## Privacy & security checklist

- [ ] Only `AffectReport` scalars cross the port — assert no `RppgAppSnapshot`,
      frame, or array series is reachable from the payload.
- [ ] `reportAffect` gated on `biometrics` scope **and** `biometricsConsent`.
- [ ] Rate-limited as a write op.
- [ ] `meanHr` is the only vital permitted, as a session aggregate (no series).
- [ ] Mirrors appstore `APP_SUBMISSION_POLICY.md` §2 (first-party, derived only).

## Testing

- protocol: `isValidAffectReport` accept/reject table; `isClientRequest` for the
  new op.
- client: `reportAffect` round-trips; surfaces `scope_denied` / `not_supported`.
- host: scope/consent gating, rate-limit path, `onReportAffect` delegation, and
  that nothing is written to the storage adapter.
- A consumer smoke test (extend `scripts/smoke-consumer-tarballs.mjs`) that an
  app can import and call `reportAffect`.

## Cross-repo sync

| SDK (this repo) | Appstore (`../elata-appstore`) |
| --- | --- |
| `packages/app-metrics/src/protocol.ts` | `src/lib/metrics-host/protocol.ts` (verbatim mirror) |
| `AffectReport` type | `/api/scores/affect` zod body + `src/lib/scores/types.ts` |
| `summarize()` rules | `src/lib/scores/sampling.ts` |
| `onReportAffect` handler shape | appstore `useMetricsHost` wiring |

Keep these aligned in the same change. The appstore route, tables, score math,
and `biometrics` scope already exist (`BIOMETRIC_SCORE.md` §11 v0.1).

## Rollout

1. Protocol + validator (this repo + appstore mirror).
2. Client `reportAffect` + `ReportAffectResult`.
3. Host dispatch + `onReportAffect`/scope/consent options.
4. Sensing accumulator + `snapshotToCalm` (v0: HR-only).
5. Appstore wires `onReportAffect` → `POST /api/scores/affect` in `useMetricsHost`.
6. catbridge calls `reportAffect` at level end (reference integration).
7. Changeset + publish; bump appstore's pinned `@elata-biosciences/app-metrics`.
