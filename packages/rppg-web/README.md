# @elata-biosciences/rppg-web

TypeScript wrapper for the Elata rPPG pipeline.

## What This Package Is

This package provides:

- `createRppgSession()` as the recommended browser integration entrypoint
- `RppgProcessor` for lower-level sample ingestion and metrics work
- packaged browser WASM backend loading from `/pkg`
- advanced helpers such as `DemoRunner` and frame sources

## When To Use It

Use `@elata-biosciences/rppg-web` when you want:

- browser-side rPPG processing
- packaged WASM backend loading without wiring the low-level runtime yourself
- demo helpers for camera-driven prototypes and integrations

If you are evaluating the SDK for the first time, start with the
`create-elata-demo` rPPG template before integrating manually.

## Install

```bash
pnpm add @elata-biosciences/rppg-web
npm install @elata-biosciences/rppg-web
```

## Requirements

- Node.js `>= 20` for builds, tests, and demos
- modern browser with WebAssembly support for the default backend
- optional MediaPipe FaceMesh for face-ROI demo helpers

## Usage

```ts
import { createRppgSession } from "@elata-biosciences/rppg-web";

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

Intentional `faceMesh: "off"` sessions use `video_frame` mode without being
reported as a FaceMesh failure. If a fatal processor exception occurs,
`session.state` switches to terminal `failed`, later metrics reads return safe
null/zero values, and the runner stops instead of continuing to reuse the same
backend instance.

If your app needs explicit asset control, `createRppgSession()` also accepts:

- `wasmJsUrl`
- `wasmBinaryUrl`
- `wasmImporter`

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
