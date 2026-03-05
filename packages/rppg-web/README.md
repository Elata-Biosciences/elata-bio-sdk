# @elata-biosciences/rppg-web

TypeScript wrapper for the Elata rPPG pipeline. This package provides a small
processor class that delegates to a backend pipeline (WASM or native).

## Install

Using `pnpm` (recommended):

```bash
pnpm add @elata-biosciences/rppg-web @elata-biosciences/eeg-web
```

Using `npm`:

```bash
npm install @elata-biosciences/rppg-web @elata-biosciences/eeg-web
```

## Requirements

- Node.js **>= 18** for builds, tests, and demos.
- Modern browser with WebAssembly support for using the default WASM backend.
- Optional: MediaPipe FaceMesh if you use the face-ROI demo helpers.

## Key exports

- `RppgProcessor` – high-level processor for ingesting samples and computing metrics.
- `DemoRunner` – helper for wiring a frame source to a processor in demos.
- `MediaPipeFrameSource`, `MediaPipeFaceFrameSource` – frame sources for camera input.

## Usage

```ts
import { RppgProcessor } from "@elata-biosciences/rppg-web";
import { initEegWasm, RppgPipeline } from "@elata-biosciences/eeg-web";

await initEegWasm();

const backend = {
  newPipeline: (sampleRate: number, windowSec: number) =>
    new RppgPipeline(sampleRate, windowSec),
};

const processor = new RppgProcessor(backend, 30, 5);
processor.pushSample(Date.now(), 0.42);
console.log(processor.getMetrics());
```

The backend must expose `newPipeline(sampleRate, windowSec)` and return an
object with `push_sample`/`get_metrics` (or camelCase equivalents).

## TypeScript layout

- `src/*.ts`: source code edited in this repo
- `dist/*.js`: emitted runtime files used by consumers
- `dist/*.d.ts`: emitted type declarations used by TypeScript consumers
- `demo/*`: demo-only files, not part of the package runtime API
- `src/__tests__/*`: test-only files, not loaded by consumers

When consuming `@elata-biosciences/rppg-web`, TypeScript resolves types from `dist/index.d.ts`
and runtime code from `dist/index.js`.

## MediaPipe face ROI

Use MediaPipe FaceMesh to drive a face ROI for sampling:

```ts
import { RppgProcessor, DemoRunner, MediaPipeFaceFrameSource, MediaPipeFrameSource, loadFaceMesh } from "@elata-biosciences/rppg-web";
import { initEegWasm, RppgPipeline } from "@elata-biosciences/eeg-web";

await initEegWasm();
const backend = { newPipeline: (sr: number, ws: number) => new RppgPipeline(sr, ws) };
const processor = new RppgProcessor(backend, 30, 6);

const faceMesh = await loadFaceMesh();
const source = faceMesh
  ? new MediaPipeFaceFrameSource(videoEl, faceMesh, 30)
  : new MediaPipeFrameSource(videoEl, { fps: 30 });

const runner = new DemoRunner(source, processor);
await runner.start();
```

When a face ROI is available, `DemoRunner` uses it automatically.


## TO RUN DEMO

Install dependencies first:

```bash
npm --prefix packages/rppg-web install
```

Then run:

```bash
npm --prefix packages/rppg-web run start-demo
```

This now does all required build steps before serving:
- builds `rppg-wasm` for `wasm32-unknown-unknown`
- runs `wasm-bindgen` into `packages/rppg-web/demo/pkg`
- bundles `packages/rppg-web/demo/main.ts` to `packages/rppg-web/demo/demo.js`

Useful explicit commands:

```bash
# build wasm glue only
npm --prefix packages/rppg-web run build:wasm

# bundle demo JS only
npm --prefix packages/rppg-web run bundle:demo

# full build (wasm + bundle), no server
npm --prefix packages/rppg-web run build:demo

# serve existing artifacts without rebuilding
npm --prefix packages/rppg-web run start-demo:quick
```

Wait a couple seconds before the pipeline starts computing BPM predictions

## Release Notes

For package publishing flow, release tags (`next` then promote to `latest`),
and rollback/deprecate guidance, see [`docs/releasing.md`](../../docs/releasing.md).
