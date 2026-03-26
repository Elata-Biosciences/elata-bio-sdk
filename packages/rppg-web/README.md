# @elata-biosciences/rppg-web

TypeScript wrapper for the Elata rPPG pipeline.

## What This Package Is

This package provides:

- `createRppgSession()` as the recommended browser integration entrypoint
- `RppgProcessor` for lower-level sample ingestion and metrics work
- packaged browser WASM backend loading from `/pkg`
- advanced helpers such as `DemoRunner` and frame sources

## When To Use It

**Abstraction level: managed session.** This package owns the camera capture
loop, WASM loading, face ROI, diagnostics, and lifecycle for you — you call
`createRppgSession()` and poll `getMetrics()`. If you want raw pipeline
primitives to compose yourself, use `createRppgPipeline()` from `eeg-web`
instead.

Use `@elata-biosciences/rppg-web` when you want:

- browser-side rPPG processing with a managed camera session
- packaged WASM backend loading without wiring the low-level runtime yourself
- built-in diagnostics, graceful degradation, and lifecycle management

If you are evaluating the SDK for the first time, start with the
`create-elata-demo` rPPG template before integrating manually.

## Install

```bash
pnpm add @elata-biosciences/rppg-web
npm install @elata-biosciences/rppg-web
```

**Using a local `file:` path** (monorepo or local dev)? You must build the
WASM backend before running `pnpm install` in your app — `file:` installs copy
whatever is on disk at the time. Run `build:wasm` first:

```bash
pnpm --dir packages/rppg-web run build:wasm  # requires Rust + wasm-bindgen
cd your-app && pnpm install
```

The published npm package includes pre-built `pkg/` assets — this step is only
needed when working from the repo source.

## Requirements

- Node.js `>= 20` for builds, tests, and demos
- modern browser with WebAssembly support for the default backend
- optional MediaPipe FaceMesh for face-ROI demo helpers

**Building the WASM backend from source** (not needed when installing from npm):
- Rust toolchain (`rustup`, `cargo`)
- `wasm-bindgen-cli` (`cargo install wasm-bindgen-cli`)
- Run `pnpm --dir packages/rppg-web run build:wasm` to compile and place assets in `pkg/`

## Vite Config

### WASM asset placement

The default session loader fetches WASM files from `/pkg/rppg_wasm.js` and
`/pkg/rppg_wasm_bg.wasm`. In a Vite app, place those files under `public/pkg/`
so they are served at that path:

```
your-app/
  public/
    pkg/
      rppg_wasm.js
      rppg_wasm_bg.wasm
```

The built assets live in `node_modules/@elata-biosciences/rppg-web/pkg/` after
an npm install. Copy or symlink that directory into your app's `public/` folder,
or use the import-based options below to let Vite manage the asset URLs instead.

**Already using `@elata-biosciences/eeg-web`?** You don't need rppg-web's WASM
at all. The session loader tries `/pkg/eeg_wasm.js` as a fallback, and eeg-web's
WASM exports `RppgPipeline`. Copy `node_modules/@elata-biosciences/eeg-web/wasm/`
to `public/pkg/` instead — it satisfies the interface automatically.

### Dynamic import restriction

Vite 7 blocks `import(url)` for files served from `/public`, which is where
most projects place the `pkg/` WASM assets. **If you skip this step, the
session will start, `backendMode` will be `"unavailable"`, and BPM will always
be null — no error is thrown.** Two approaches to fix it:

**Option A — vite-plugin-wasm (recommended)**

```bash
npm install -D vite-plugin-wasm vite-plugin-top-level-await
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
});
```

Then import the WASM JS bundle statically and pass it as `wasmImporter`:

```ts
import * as rppgWasm from "@elata-biosciences/rppg-web/pkg/rppg_wasm.js";
import { createRppgSession } from "@elata-biosciences/rppg-web";

const session = await createRppgSession({
  video: videoEl,
  wasmImporter: () => Promise.resolve(rppgWasm),
});
```

**Option B — explicit URL imports (no extra plugins)**

```ts
import rppgWasmJsUrl from "@elata-biosciences/rppg-web/pkg/rppg_wasm.js?url";
import rppgWasmBinaryUrl from "@elata-biosciences/rppg-web/pkg/rppg_wasm_bg.wasm?url";
import { createRppgSession } from "@elata-biosciences/rppg-web";

const session = await createRppgSession({
  video: videoEl,
  wasmJsUrl: rppgWasmJsUrl,
  wasmBinaryUrl: rppgWasmBinaryUrl,
});
```

Option B works because Vite resolves `?url` imports to fingerprinted asset
URLs at build time, bypassing the public directory restriction entirely.

## Usage

Minimal camera → BPM loop:

```ts
import { createRppgSession } from "@elata-biosciences/rppg-web";

// 1. Acquire camera and attach to a video element
const stream = await navigator.mediaDevices.getUserMedia({ video: true });
const video = document.createElement("video");
video.srcObject = stream;
await video.play();

// 2. Start an rPPG session
const session = await createRppgSession({
  video,
  backend: "auto",
  faceMesh: "off",
});

// 3. Poll for BPM
const interval = setInterval(() => {
  const metrics = session.getMetrics();
  if (metrics?.bpm != null) {
    console.log("BPM:", metrics.bpm.toFixed(1));
  }
}, 1000);

// 4. Cleanup
// clearInterval(interval);
// await session.stop();
```

Expect a ~10 second warmup before the first BPM estimate.

> **If BPM is always null:** check `session.backendMode` before assuming bad
> signal. If it is `"unavailable"`, the WASM assets did not load — the session
> runs gracefully but metrics will always be null. This looks identical to the
> warmup period. See the [Vite Config](#vite-config) section above.

If you need a single boolean for UI gating (e.g. "show the BPM display"),
use `createRppgAppAdapter().canPublish` instead of polling `getMetrics()`
directly — it handles the backend check, confidence threshold, and warmup
window in one place.

With diagnostics:

```ts
const session = await createRppgSession({
  video: videoEl,
  sampleRate: 30,
  backend: "auto",
  faceMesh: "off",
  onDiagnostics: (diagnostics) => {
    console.log(diagnostics.state.status, diagnostics.faceTrackingMode);
    console.log(diagnostics.framesSeen, diagnostics.totalSamplesReceived);
    console.log(diagnostics.issues, diagnostics.processorFailure);
  },
  onError: (error) => {
    console.error(error.code, error.message);
  },
});

console.log(session.getMetrics());
```

`createRppgSession()` owns the packaged WASM init, FaceMesh loading, frame
capture loop, ROI handling, diagnostics emission, and cleanup. If WASM is not
available and you use `backend: "auto"`, the session falls back to an
`unavailable` backend mode and reports that state through diagnostics instead of
failing silently.

## Which API To Use

| API | Use when |
|-----|----------|
| `createRppgSession()` | Starting point for most browser apps — handles WASM init, frame capture, ROI, diagnostics, and cleanup. |
| `createManagedRppgSession()` | Same as above, plus automatic restart after terminal processor failures. |
| `createRppgAppAdapter()` | You want a single app-facing snapshot (status, BPM, `canPublish`, trace) to drive UI state — use this instead of calling `getMetrics()` yourself and writing the gating logic. |
| `createRppgAppMonitor()` | You want the SDK to own the update loop entirely — it polls on an interval and pushes snapshots to a subscriber, so you don't write any `setInterval` + `getMetrics()` code at all. |
| `RppgProcessor` / `DemoRunner` | You need custom capture orchestration or rendering that the session helpers don't cover. |

If you're unsure, start with `createRppgSession()` and a `setInterval` +
`getMetrics()` poll. Reach for the adapter/monitor when you want the SDK to
own that loop.

## Recommended Vs Advanced

Recommended:

- Use `createRppgSession()` for browser apps that need camera capture, packaged WASM loading, ROI handling, diagnostics, and cleanup.
- Use `createManagedRppgSession()` when you also want automatic restart after terminal processor failures.
- Use `createRppgPipeline()` from `@elata-biosciences/eeg-web` only when you intentionally want low-level sample ingestion and already own the surrounding orchestration.

Advanced:

- Drop to `RppgProcessor`, `DemoRunner`, frame sources, or generated WASM bindings only when you need custom orchestration that the session helper does not cover.
- If you are debugging the SDK itself, compare against `createRppgSession()` first so you know whether the problem is in your app wiring or lower-level runtime behavior.

`loadWasmBackend()` still looks for packaged WASM bundles at common paths such
as `/pkg/rppg_wasm.js` and the legacy `/pkg/eeg_wasm.js`.

If you want to inject your own backend, it must expose
`newPipeline(sampleRate, windowSec)` and return an object with `push_sample`
and `get_metrics` or camelCase equivalents.

## Key Exports

- `createRppgSession`
- `createManagedRppgSession`
- `RppgSession`
- `RppgProcessor`
- `DemoRunner`
- `MediaPipeFrameSource`
- `MediaPipeFaceFrameSource`
- `loadWasmBackend`
- `computeWaveformPeriodicityProfile`
- `computeTraceWaveformDebug`
- `normalizeRppgError`
- `createRppgAppAdapter`
- `createRppgAppMonitor`
- `ensureVideoPlaying`
- `replayBayesSession`

## Session Diagnostics

```ts
import {
  createRppgSession,
  type RppgSessionDiagnostics,
} from "@elata-biosciences/rppg-web";

const session = await createRppgSession({
  video: videoEl,
  onDiagnostics: (diagnostics: RppgSessionDiagnostics) => {
    console.log(diagnostics.roiSource, diagnostics.processorMethod);
    console.log(diagnostics.lastSampleAgeMs, diagnostics.issues);
  },
});

console.log(session.lastError);
```

Every session diagnostics payload includes:

- `framesSeen`, `droppedFrames`, and `lastDropReason`
- `roiSource` and `processorMethod`
- `totalSamplesReceived`, `windowSampleCount`, and `lastSampleAgeMs`
- processor issue codes such as `no_samples_yet`, `insufficient_window`, and `low_skin_ratio`
- session-level issues such as `backend_unavailable`
- `state` with `running`, `degraded`, or terminal `failed` status
- `processorFailure` when a fatal backend exception poisons the WASM pipeline
- `lastError` when capture, FaceMesh, or processor work fails

**Warmup indicator:** During the ~10 second warmup window, `diagnostics.issues`
contains `insufficient_window`. Once that clears, the processor has enough
samples for a BPM estimate. `diagnostics.windowSampleCount` gives the raw
sample count if you want to show a progress indicator.

**FaceMesh fallback:** `faceMesh: "auto"` falls back to `video_frame` mode if
MediaPipe fails to load. Check `diagnostics.faceTrackingMode` to see which
mode is active — `"face_mesh"` or `"video_frame"`.

Intentional `faceMesh: "off"` sessions use `video_frame` mode without being
reported as a FaceMesh failure. If a fatal processor exception occurs,
`session.state` switches to terminal `failed`, later metrics reads return safe
null/zero values, and the runner stops instead of continuing to reuse the same
backend instance.

If your app needs explicit asset control, `createRppgSession()` also accepts:

- `wasmJsUrl`
- `wasmBinaryUrl`
- `wasmImporter`
- `ensureVideoPlayback`
- `videoPlaybackTimeoutMs`

Those options let apps bypass guessed `/pkg/*` paths when bundler or deploy
layout needs explicit wiring.

## Managed Session

If your app wants a supervised lifecycle with retry-on-processor-failure, use
`createManagedRppgSession()`:

```ts
import { createManagedRppgSession } from "@elata-biosciences/rppg-web";

const managed = await createManagedRppgSession({
  video: videoEl,
  faceMesh: "off",
  maxRetries: 3,
  retryDelayMs: 1500,
  onStateChange: (state) => {
    console.log(state.status, state.retryCount, state.lastError?.code);
  },
});

console.log(managed.state.status);
console.log(managed.getMetrics());
```

The managed wrapper sits above `RppgSession`; it does not replace the lower
level API when you want full lifecycle ownership.

## Public Trace Snapshot

If you want recent waveform/debug samples without reading internal processor
fields, use `getTraceSnapshot()`:

```ts
const trace = session.getTraceSnapshot(300);

console.log(trace.sampleRate, trace.windowSec);
console.log(trace.points);
console.log(trace.backendFailure);
```

`getTraceSnapshot()` is the supported way to read recent intensity/sample data
for debug panels or regression tooling.

If you also want peak/threshold-style waveform debug without reading processor
internals, use `computeTraceWaveformDebug()`:

```ts
import { computeTraceWaveformDebug } from "@elata-biosciences/rppg-web";

const waveform = computeTraceWaveformDebug(session.getTraceSnapshot(300));

console.log(waveform.peaks);
console.log(waveform.threshold);
```

## Error Normalization

Use `normalizeRppgError()` to convert raw session errors or degraded
diagnostics into stable app-facing categories and recovery guidance:

```ts
import { normalizeRppgError } from "@elata-biosciences/rppg-web";

const normalized = normalizeRppgError(session.lastError, session.getDiagnostics());

console.log(normalized?.code);
console.log(normalized?.message);
console.log(normalized?.guidance);
```

The helper covers cases such as:

- `wasm_init_failed`
- `face_tracking_init_failed`
- `camera_not_playing`
- `capture_failed`
- `canvas_unavailable`
- `processor_failed`
- `backend_unavailable`

## App Adapter

If you want a single app-facing snapshot for UI state, publish gating, trace
data, and stable messages, use `createRppgAppAdapter()`:

```ts
import {
  createManagedRppgSession,
  createRppgAppAdapter,
} from "@elata-biosciences/rppg-web";

const managed = await createManagedRppgSession({
  video: videoEl,
  faceMesh: "off",
});

const adapter = createRppgAppAdapter();
const app = adapter.getSnapshot(managed);

console.log(app.status);
console.log(app.canPublish);
console.log(app.publishBpm);
console.log(app.message);
console.log(app.trace.points);
```

This is the recommended reference-adapter path before building a custom
`useRppg`-style state layer in your app.

If you want the SDK to own the polling/subscription loop too, use
`createRppgAppMonitor()`:

```ts
import {
  createManagedRppgSession,
  createRppgAppMonitor,
} from "@elata-biosciences/rppg-web";

const managed = await createManagedRppgSession({ video: videoEl, faceMesh: "off" });
const monitor = createRppgAppMonitor(managed, { intervalMs: 500 });

const unsubscribe = monitor.subscribe((snapshot) => {
  console.log(snapshot.status, snapshot.publishBpm);
});

monitor.start();
```

## Video Playback Helper

If your app needs to coordinate autoplay/readiness explicitly before starting a
session, use `ensureVideoPlaying()`:

```ts
import { ensureVideoPlaying } from "@elata-biosciences/rppg-web";

await ensureVideoPlaying(videoEl, { timeoutMs: 5000 });
```

`createRppgSession()` uses the same helper internally by default.

## Low-Level Integration

If you need custom capture orchestration, the lower-level APIs are still
available:

- `loadWasmBackend()` for manual backend loading
- `RppgProcessor` for direct sample ingestion
- `DemoRunner`, `MediaPipeFrameSource`, and `MediaPipeFaceFrameSource` for advanced browser control

For most browser apps, prefer `createRppgSession()` and only drop lower if you
need custom lifecycle or rendering behavior.

## Version Compatibility

`@elata-biosciences/rppg-web` and `@elata-biosciences/eeg-web` are tested in
lockstep in this repo. Prefer matching package versions unless release notes
say otherwise.

## Build And Dev Notes

**Using from source?** Run `pnpm --dir packages/rppg-web build` before
importing the package. The published npm release ships a pre-built `dist/`, but
a fresh clone does not. The `prepare` script handles this automatically after
`pnpm install`.

To also build the WASM assets (required for the `pkg/` directory and any
integration that loads WASM), run `pnpm --dir packages/rppg-web run build:wasm`
first. This requires Rust and `wasm-bindgen`.

**Using via `file:` path (monorepo or local integration)?** Run `build:wasm`
*before* running `pnpm install` in the consumer app. `file:` installs copy
whatever is on disk at install time — if `pkg/` doesn't exist yet, it won't
be included. The sequence is:

```bash
pnpm --dir packages/rppg-web run build:wasm  # builds pkg/ at package root
cd your-app && pnpm install                   # now pkg/ is copied in
```

From the repo root:

```bash
pnpm --dir packages/rppg-web run build:demo
pnpm --dir packages/rppg-web build
pnpm --dir packages/rppg-web test
```

To run the in-package demo:

```bash
pnpm --dir packages/rppg-web run start-demo
```

Useful explicit commands:

```bash
pnpm --dir packages/rppg-web run build:wasm
pnpm --dir packages/rppg-web run bundle:demo
pnpm --dir packages/rppg-web run start-demo:quick
```

Demo entry points after `start-demo` / `start-demo:quick`:

- `/index.html`: live camera demo with tracker and replay debug panels
- `/replay.html`: import a copied replay JSON blob or a raw replay session and inspect the summary offline

## Replay Workflow

The live demo can copy a replay JSON payload from its debug panel. That payload
is already a serialized `ReplayBayesSessionResult`, so it can be:

- pasted into the `/replay.html` page in the in-package demo
- stored with bug reports for tracker regressions
- compared across SDK versions to spot replay output changes

If you have a raw session payload shaped like `ReplayDebugSession`, the replay
page can also run `replayBayesSession()` on it and render the result.

## Package Layout

- `src/*.ts`: source edited in this repo
- `dist/*.js`: emitted runtime files
- `dist/*.d.ts`: emitted type declarations
- `pkg/*`: packaged WASM runtime assets
- `demo/*`: demo-only files

## Troubleshooting

- If `session.backendMode` is `unavailable`, make sure your app is serving the packaged `pkg/rppg_wasm.js` and `.wasm` assets.
- If you see "backend pipeline has no push_sample API", make sure you are using `createRppgSession()` or a backend created through the normalized wrappers rather than constructing generated bindings directly.
- If you hit `wasmrppgpipeline_new`, make sure the underlying WASM module was initialized before creating low-level pipelines and prefer the package helpers over raw generated constructors.
- If you see deprecated init warnings, route startup through `initEegWasm()` instead of calling generated init exports with raw strings, URLs, or buffers.
- If camera access fails, verify that the page has permission to use `getUserMedia` and that the browser supports the required APIs.
- If you want a known-good starting point, scaffold the `rppg-web-demo` template with `create-elata-demo` and compare your setup against it.

## Release Notes

For release flow, dist-tags, and recovery guidance, see
[docs/releasing.md](https://github.com/Elata-Biosciences/elata-bio-sdk/blob/main/docs/releasing.md).
