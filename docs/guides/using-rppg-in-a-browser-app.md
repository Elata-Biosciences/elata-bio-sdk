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

- `RppgProcessor` for sample ingestion and metrics
- `loadWasmBackend()` for packaged browser backend loading
- demo helpers such as `DemoRunner` and frame-source helpers

## Minimal Integration

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

## Typical Integration Flow

1. Load the packaged WASM backend with `loadWasmBackend()`.
2. Acquire a camera stream in the browser.
3. Convert frames into samples through your chosen frame-source path.
4. Feed those samples into `RppgProcessor`.
5. Read BPM, confidence, and signal-quality metrics from `getMetrics()`.

## When To Use The rPPG Template Instead

Prefer the scaffolded `rppg-web-demo` template when you want:

- a known-good browser camera example
- a reference for packaged WASM asset loading
- a faster comparison point when debugging your own integration

## Common Gotchas

- If `loadWasmBackend()` returns `null`, your app is probably not serving the packaged `pkg/` assets correctly.
- If camera access fails, confirm the page has permission to use `getUserMedia`.
- If you are just evaluating the SDK, the scaffolded demo is much faster than building the whole browser pipeline yourself.

## Next Steps

- For package details, see [packages/rppg-web/README.md](/Users/khan/Documents/Projects/elata-bio-sdk/packages/rppg-web/README.md).
- For setup failures, read [troubleshooting.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/troubleshooting.md).
- For platform support details, read [compatibility.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/compatibility.md).
