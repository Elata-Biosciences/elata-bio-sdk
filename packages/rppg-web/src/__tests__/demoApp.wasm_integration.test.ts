import { initDemo } from '../demoApp';

const pushSample = jest.fn();

jest.mock('../mediapipeLoader', () => ({
  loadFaceMesh: jest.fn(async () => null),
}));

jest.mock('../wasmBackend', () => ({
  loadWasmBackend: jest.fn(async () => ({
    newPipeline: () => ({
      push_sample: pushSample,
      get_metrics: () => ({
        bpm: pushSample.mock.calls.length > 0 ? 72 : null,
        confidence: 0.9,
        signal_quality: 0.8,
      }),
    }),
  })),
  createUnavailableBackend: jest.fn(() => ({
    newPipeline: () => ({
      push_sample: jest.fn(),
      get_metrics: () => ({ bpm: null, confidence: 0, signal_quality: 0 }),
    }),
  })),
}));

class FakeVideo {
  videoWidth = 320;
  videoHeight = 240;
  // Make `ensureVideoPlaying()` short-circuit by pretending the element
  // already has current video data.
  readyState = 2; // HTMLMediaElement.HAVE_CURRENT_DATA
  paused = false;
  ended = false;

  play() {
    this.readyState = 2;
    this.paused = false;
    return Promise.resolve();
  }

  // If the test ever hits the event-based fallback, keep these as no-ops.
  addEventListener() {}
  removeEventListener() {}
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

const origCreate = document.createElement;
beforeAll(() => {
  document.createElement = (tag: string) =>
    tag === 'canvas'
      ? (new FakeCanvas(320, 240) as unknown as HTMLCanvasElement)
      : origCreate(tag);
});

afterAll(() => {
  document.createElement = origCreate;
});

beforeEach(() => {
  pushSample.mockReset();
});

test('initDemo starts a live session and pushes samples when backend is available', async () => {
  const video = new FakeVideo() as unknown as HTMLVideoElement;
  const res = await initDemo(video);

  await new Promise((resolve) => setTimeout(resolve, 50));

  expect((window as any).__rppg_demo.backendAvailable).toBe(true);
  expect(res.session.backendMode).toBe('wasm');
  expect(pushSample).toHaveBeenCalled();

  const diagnostics = res.session.getDiagnostics();
  expect(diagnostics.framesSeen).toBeGreaterThan(0);
  expect(diagnostics.totalSamplesReceived).toBeGreaterThan(0);
  expect(diagnostics.processorIssues).not.toContain('no_samples_yet');

  await res.runner.stop();
});
