import { loadWasmBackend } from '../wasmBackend';

test('loadWasmBackend finds and returns a backend when bundle is present', async () => {
  const backend = await loadWasmBackend(async (url) => {
    if (url === '/pkg/rppg_wasm.js') {
      return {
        WasmRppgPipeline: class {
          constructor(public sr: number, public ws: number) {}
          push_sample() {}
          get_metrics() { return { bpm: null, confidence: 0, signal_quality: 0 }; }
        }
      };
    }
    throw new Error('missing module');
  });

  expect(backend).not.toBeNull();
  const p = backend!.newPipeline(30, 5);
  expect(typeof p.push_sample === 'function' || typeof p.pushSample === 'function').toBeTruthy();
});

test('loadWasmBackend returns null when no bundle present', async () => {
  const backend = await loadWasmBackend(async () => {
    throw new Error('missing module');
  });

  expect(backend).toBeNull();
});
