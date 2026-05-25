# __APP_NAME__

End-to-end demo of `@elata-biosciences/app-metrics`: an rPPG recovery game
that runs inside a sandboxed iframe and stores scores through a host shell.

## Run

```bash
npm install
npm run dev
```

Open the printed local URL. The page you see is the **host shell** — what the
Elata appstore would be in production. The boxed area inside is a sandboxed
iframe loading the actual app. They talk over a transferred `MessagePort`;
storage lives in the host (IndexedDB), not in the app.

To bundle just the app for upload to the appstore:

```bash
npm run build:zip
```

This produces `app.zip` containing the iframe game (renamed to `index.html`),
which is the upload format the appstore expects. The dev host shell is not
included in the zip.

## What the demo does

1. **Calibrate** — 15s of resting pulse. The last third of samples is
   averaged into the baseline BPM. The baseline is persisted via
   `metrics.record({ type: 'baseline', data })` so the next session can read
   it back without recalibrating.
2. **Anticipate** — random 5–15s wait. The user knows it's coming but not
   when.
3. **Visual burst** — a single 200ms orange pulse overlay. A "reduced motion"
   toggle replaces it with a soft, non-luminance color shift for
   photosensitive users. Single pulses stay well inside WCAG flash
   thresholds.
4. **Recover** — measure the time until BPM returns to baseline + 5 BPM and
   stays there for 3 seconds. 60-second timeout.
5. **Save** — `metrics.saveScore()` with the recovery time. Leaderboard reads
   via `metrics.loadScores({ limit: 10 })`.

## Rough edges this demo deliberately bumps into

The `app-metrics` API is new and intentionally narrow. Two patterns this
demo uses are workarounds for surfaces the package does not yet offer
cleanly. They're documented here so they're visible — not hidden.

### 1. Lower-is-better scores require negation

The protocol's `ScoreOrder` is `"value_desc" | "timestamp_desc"`. There is
no `value_asc`. Recovery time is lower-is-better, so we store
`saveScore({ value: -recoveryMs })` and read `loadScores({ limit: 10 })`
(which defaults to `value_desc`). The least-negative scores — the fastest
recoveries — come first.

This works but is awkward. A future API revision could either accept a
`value_asc` order, or take a typed score field (e.g.
`saveScore({ scores: { recoveryMs: 4_200 } })`) with per-field ordering at
read time. Either would eliminate the sign-flip dance.

When rendering scores, the demo flips the sign back: `Math.abs(s.value)`.
If you forget that step, scores will display as `-4.2s`.

### 2. Baseline calibration is a state value, not an event

We persist `baseline` via `record({ type: 'baseline', data })` and read the
latest with `query({ type: 'baseline', limit: 1 })`. That works because
`query` returns newest-first, but it's a mutable single value being
shoehorned into an append-only event log. Every recalibration appends a new
record; old baselines accumulate until `clear()` is called.

A future API revision could add a small key-value primitive
(`setState(key, value)` / `getState(key)`) for things like calibration
baselines, user preferences, and last-used settings — values that change
infrequently and where only the latest matters.

## File layout

```
index.html          host shell entry (dev-only)
game.html           iframe app entry (the thing that ships)
src/
  host/             host shell — createMetricsHost + iframe wiring
  game/             the actual app — rPPG + recovery game + metrics client
  shared/           constants shared between the two entries
```

The two HTML entries are configured in `vite.config.ts` via
`rollupOptions.input`. The host shell only runs in development; in
production (uploaded to the appstore) only the iframe app is loaded, and
the appstore itself plays the host role.
