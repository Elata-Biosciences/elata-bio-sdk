import { initDemo } from '../demoApp';
import { loadFaceMesh } from '../mediapipeLoader';

jest.mock('../mediapipeLoader', () => ({
  loadFaceMesh: jest.fn(async () => null),
}));

jest.mock('../wasmBackend', () => ({
  loadWasmBackend: jest.fn(async () => null),
}));

const mockedLoadFaceMesh = loadFaceMesh as jest.MockedFunction<typeof loadFaceMesh>;

class FakeVideo {
  videoWidth = 320;
  videoHeight = 240;
}

class FakeCtx {
  private data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(width: number, height: number, fillValue = 128) {
    this.width = width;
    this.height = height;
    const n = width * height * 4;
    this.data = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i += 4) {
      this.data[i] = 0;
      this.data[i + 1] = fillValue;
      this.data[i + 2] = 0;
      this.data[i + 3] = 255;
    }
  }
  drawImage() {}
  getImageData(_x: number, _y: number, w: number, h: number) {
    return { data: this.data.slice(0, w * h * 4) } as ImageData;
  }
}

class FakeCanvas {
  width: number;
  height: number;
  private ctx: FakeCtx;
  constructor(w: number, h: number, fillValue = 128) {
    this.width = w;
    this.height = h;
    this.ctx = new FakeCtx(w, h, fillValue);
  }
  getContext(_name: string) {
    return this.ctx as unknown as CanvasRenderingContext2D;
  }
}

let restoreCanvas: (() => void) | null = null;
beforeEach(() => {
  const origCreate = document.createElement.bind(document);
  document.createElement = ((tag: string) =>
    tag === 'canvas' ? (new FakeCanvas(320, 240) as unknown as HTMLCanvasElement) : origCreate(tag)) as any;
  restoreCanvas = () => { document.createElement = origCreate; };
});
afterEach(() => {
  restoreCanvas?.();
  jest.restoreAllMocks();
});

test('initDemo falls back to MediaPipeFrameSource when faceMesh absent', async () => {
  mockedLoadFaceMesh.mockResolvedValueOnce(null);
  const video = new FakeVideo() as unknown as HTMLVideoElement;
  const res = await initDemo(video);
  expect(res.source).toBeDefined();
  expect(res.proc).toBeDefined();
  await res.runner.stop();
});

test('initDemo uses MediaPipeFaceFrameSource when faceMesh is available', async () => {
  const fakeFaceMesh = {
    onResults: jest.fn(),
    send: jest.fn(),
  };
  mockedLoadFaceMesh.mockResolvedValueOnce(fakeFaceMesh as any);

  const video = new FakeVideo() as unknown as HTMLVideoElement;
  const res = await initDemo(video);

  expect(res.source).toBeDefined();
  expect(res.source.constructor.name).toBe('MediaPipeFaceFrameSource');
  await res.runner.stop();
});

test('initDemo falls back to JS backend when WASM load fails', async () => {
  mockedLoadFaceMesh.mockResolvedValueOnce(null);
  // wasmBackend mock already returns null by default

  const video = new FakeVideo() as unknown as HTMLVideoElement;
  const res = await initDemo(video);

  expect(res.proc).toBeDefined();
  const metrics = res.proc.getMetrics();
  expect(metrics).toBeDefined();
  await res.runner.stop();
});

test('initDemo assigns to window.__rppg_demo for debugging', async () => {
  mockedLoadFaceMesh.mockResolvedValueOnce(null);
  const video = new FakeVideo() as unknown as HTMLVideoElement;
  const res = await initDemo(video);

  expect((window as any).__rppg_demo).toBeDefined();
  expect((window as any).__rppg_demo.source).toBe(res.source);
  expect((window as any).__rppg_demo.proc).toBe(res.proc);
  expect((window as any).__rppg_demo.runner).toBe(res.runner);
  await res.runner.stop();
});
