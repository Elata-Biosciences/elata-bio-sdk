# Using rPPG In A Browser App

## Start With The Fastest Path

If you want a working reference app before integrating manually, scaffold the
rPPG demo:

```bash
npm create @elata-biosciences/elata-demo my-app
cd my-app
pnpm install
pnpm run dev
```

Use this guide when you want to add browser-side rPPG processing to an existing
app.

## Install

```bash
pnpm add @elata-biosciences/rppg-web
npm install @elata-biosciences/rppg-web
```

## What `rppg-web` Gives You

`@elata-biosciences/rppg-web` provides:

- `createRppgSession()` as the recommended browser integration API
- `RppgProcessor` for low-level sample ingestion and metrics
- `loadWasmBackend()` for packaged browser backend loading
- advanced helpers such as `DemoRunner` and frame-source helpers

## Recommended Vs Advanced

Recommended:

- Use `createRppgSession()` for browser apps.
- Use `createRppgPipeline()` from `@elata-biosciences/eeg-web` only if you intentionally need low-level sample ingestion.

Advanced:

- Use `RppgProcessor`, `DemoRunner`, custom backends, or generated WASM bindings only if you need custom orchestration and understand the runtime lifecycle already.
- If you are not debugging the SDK itself, do not start with generated WASM exports.

## Minimal Integration

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

## Typical Integration Flow

1. Acquire a camera stream in the browser and attach it to a `video` element.
2. Call `createRppgSession({ video, backend: "auto" })`.
3. Read metrics from `session.getMetrics()`.
4. Surface diagnostics from `onDiagnostics` or `session.getDiagnostics()`.
5. Stop the session during cleanup with `await session.stop()`.

`createRppgSession()` owns WASM init, FaceMesh loading, frame scheduling, ROI
selection, diagnostics, and cleanup.

Use `session.state` or `diagnostics.state` to distinguish:

- normal `running`
- startup fallback or degraded setup via `degraded`
- terminal runtime processor failure via `failed`

If you intentionally choose `faceMesh: "off"`, the session stays in supported
`video_frame` mode and is not reported as a FaceMesh failure by default.

If your app needs explicit asset paths instead of the default `/pkg/*` lookup,
pass one or more of:

```ts
const session = await createRppgSession({
  video: videoEl,
  wasmJsUrl: "/assets/rppg_wasm.js",
  wasmBinaryUrl: "/assets/rppg_wasm_bg.wasm",
});
```

Advanced apps can also provide `wasmImporter` directly.

If you need manual control, the lower-level `RppgProcessor`, `DemoRunner`, and
frame-source helpers are still available.

## When To Use The rPPG Template Instead

Prefer the scaffolded `rppg-web-demo` template when you want:

- a known-good browser camera example
- a reference for packaged WASM asset loading
- a faster comparison point when debugging your own integration

## Common Gotchas

- If `session.backendMode` is `unavailable`, your app is probably not serving the packaged `pkg/` assets correctly.
- If `session.state.status` is `failed`, treat that processor backend as terminal and recreate the session instead of continuing to poll metrics from it.
- If you see "backend pipeline has no push_sample API", you likely bypassed the safe wrapper path. Start with `createRppgSession()` for browser apps, or `initEegWasm()` plus `createRppgPipeline()` for low-level ingestion.
- If you hit `wasmrppgpipeline_new`, initialize the WASM module before creating low-level pipelines and avoid calling generated constructors directly.
- If you see deprecated init warnings, route startup through `initEegWasm()` instead of forwarding raw strings, URLs, or buffers to the generated init exports.
- If camera access fails, confirm the page has permission to use `getUserMedia`.
- If `session.lastError` is non-null, use its `code` and `message` to surface the real capture or processor failure instead of retrying blindly.
- If you are just evaluating the SDK, the scaffolded demo is much faster than building the whole browser pipeline yourself.

## Version Guidance

If you install both `@elata-biosciences/rppg-web` and
`@elata-biosciences/eeg-web`, prefer matching versions. They are developed and
verified together in this repo.

## Next Steps

- For package details, see [packages/rppg-web/README.md](/Users/khan/Documents/Projects/elata-bio-sdk/packages/rppg-web/README.md).
- For setup failures, read [troubleshooting.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/troubleshooting.md).
- For platform support details, read [compatibility.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/compatibility.md).
