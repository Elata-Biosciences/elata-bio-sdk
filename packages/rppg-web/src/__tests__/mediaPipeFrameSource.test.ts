import { MediaPipeFrameSource } from '../mediaPipeFrameSource';
import { Frame } from '../frameSource';

// Mock HTMLCanvasElement getContext and video behaviour
class FakeCtx {
  private data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(width: number, height: number, fillValue = 128) {
    this.width = width;
    this.height = height;
    // RGBA per pixel
    const n = width * height * 4;
    this.data = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i += 4) {
      this.data[i] = 0; // r
      this.data[i + 1] = fillValue; // g
      this.data[i + 2] = 0; // b
      this.data[i + 3] = 255; // a
    }
  }
  drawImage() {
    // no-op
  }
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

class FakeVideo {
  videoWidth: number;
  videoHeight: number;
  constructor(w: number, h: number) { this.videoWidth = w; this.videoHeight = h; }
}

describe('MediaPipeFrameSource', () => {
  let origCreateCanvas: any;
  beforeAll(() => {
    origCreateCanvas = document.createElement;
  });
  afterAll(() => {
    document.createElement = origCreateCanvas;
  });

  test('captures frames and calls onFrame with expected data', async () => {
    // Replace document.createElement to return our FakeCanvas
    document.createElement = (tagName: string) => {
      if (tagName === 'canvas') return new FakeCanvas(2, 1) as unknown as HTMLCanvasElement;
      return origCreateCanvas(tagName);
    };

    const video = new FakeVideo(2, 1) as unknown as HTMLVideoElement;
    const src = new MediaPipeFrameSource(video, { fps: 60 });
    const onFrame = jest.fn((frame: Frame) => {
      expect(frame.width).toBe(2);
      expect(frame.height).toBe(1);
      // data length = 2 * 1 * 4
      expect((frame.data as Uint8ClampedArray).length).toBe(8);
    });
    src.onFrame = onFrame;
    await src.start();
    // give it one capture tick
    await new Promise((r) => setTimeout(r, 20));
    await src.stop();
    expect(onFrame).toHaveBeenCalled();
  });
});
