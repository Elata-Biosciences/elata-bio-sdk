# @elata-biosciences/rppg-web

TypeScript wrapper for the Elata rPPG pipeline.

## What This Package Is

This package provides:

- `RppgProcessor` for ingesting samples and computing metrics
- packaged browser WASM backend loading from `/pkg`
- demo-oriented helpers such as `DemoRunner` and frame sources

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
import { RppgProcessor, loadWasmBackend } from "@elata-biosciences/rppg-web";

const backend = await loadWasmBackend();
if (!backend) {
  throw new Error("No packaged rPPG WASM backend found.");
}

const processor = new RppgProcessor(backend, 30, 5);
processor.pushSample(Date.now(), 0.42);
console.log(processor.getMetrics());
```

`loadWasmBackend()` looks for packaged WASM bundles at common paths such as
`/pkg/rppg_wasm.js` and the legacy `/pkg/eeg_wasm.js`.

If you want to inject your own backend, it must expose
`newPipeline(sampleRate, windowSec)` and return an object with `push_sample`
and `get_metrics` or camelCase equivalents.

## Key Exports

- `RppgProcessor`
- `DemoRunner`
- `MediaPipeFrameSource`
- `MediaPipeFaceFrameSource`
- `loadWasmBackend`

## MediaPipe Face ROI

```ts
import {
  RppgProcessor,
  DemoRunner,
  MediaPipeFaceFrameSource,
  MediaPipeFrameSource,
  loadFaceMesh,
  loadWasmBackend
} from "@elata-biosciences/rppg-web";
const backend = await loadWasmBackend();
if (!backend) throw new Error("No packaged rPPG WASM backend found.");
const processor = new RppgProcessor(backend, 30, 6);

const faceMesh = await loadFaceMesh();
const source = faceMesh
  ? new MediaPipeFaceFrameSource(videoEl, faceMesh, 30)
  : new MediaPipeFrameSource(videoEl, { fps: 30 });

const runner = new DemoRunner(source, processor);
await runner.start();
```

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

## Package Layout

- `src/*.ts`: source edited in this repo
- `dist/*.js`: emitted runtime files
- `dist/*.d.ts`: emitted type declarations
- `pkg/*`: packaged WASM runtime assets
- `demo/*`: demo-only files

## Troubleshooting

- If `loadWasmBackend()` returns `null`, make sure your app is serving the packaged `pkg/rppg_wasm.js` and `.wasm` assets.
- If camera access fails, verify that the page has permission to use `getUserMedia` and that the browser supports the required APIs.
- If you want a known-good starting point, scaffold the `rppg-web-demo` template with `create-elata-demo` and compare your setup against it.

## Release Notes

For release flow, dist-tags, and recovery guidance, see
[docs/releasing.md](https://github.com/Elata-Biosciences/elata-bio-sdk/blob/main/docs/releasing.md).
