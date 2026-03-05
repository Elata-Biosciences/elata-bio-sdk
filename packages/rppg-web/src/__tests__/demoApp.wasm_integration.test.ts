import { initDemo } from '../demoApp';

// This test asserts that the demo detects a real wasm backend when the actual built
// bundle is available at demo/pkg/rppg_wasm.js. It is intentionally written to fail
// until we implement the build-and-copy step that creates the file (TDD).

jest.mock('../mediapipeLoader', () => ({ loadFaceMesh: jest.fn(async () => null) }));

class FakeVideo { videoWidth = 320; videoHeight = 240; }

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
  document.createElement = (tag: string) => tag === 'canvas' ? (new FakeCanvas(320, 240) as unknown as HTMLCanvasElement) : origCreate(tag);
});
afterAll(() => { document.createElement = origCreate; });

test('initDemo detects wasm backend when built bundle exists at demo/pkg', async () => {
  // Expectation: demo should detect backendAvailable when bundle exists.
  // This will fail until the build script writes `demo/pkg/rppg_wasm.js`.
  const video = new FakeVideo() as unknown as HTMLVideoElement;
  const res = await initDemo(video);
  expect((window as any).__rppg_demo.backendAvailable).toBe(true);

  await res.runner.stop();
});
