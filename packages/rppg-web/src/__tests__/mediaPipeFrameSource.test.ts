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
  public lastContextOptions: unknown = null;
  constructor(w: number, h: number, fillValue = 128) {
    this.width = w;
    this.height = h;
    this.ctx = new FakeCtx(w, h, fillValue);
  }
  getContext(_name: string, options?: unknown) {
    this.lastContextOptions = options ?? null;
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
    const createdCanvas = new FakeCanvas(2, 1);
    // Replace document.createElement to return our FakeCanvas
    document.createElement = (tagName: string) => {
      if (tagName === 'canvas') return createdCanvas as unknown as HTMLCanvasElement;
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
    expect(createdCanvas.lastContextOptions).toEqual(
      expect.objectContaining({ willReadFrequently: true }),
    );
  });

  test('uses now when mediaTime is 0 (live stream)', async () => {
    const createdCanvas = new FakeCanvas(2, 1);
    document.createElement = (tagName: string) => {
      if (tagName === 'canvas') return createdCanvas as unknown as HTMLCanvasElement;
      return origCreateCanvas(tagName);
    };

    const video = new FakeVideo(2, 1) as unknown as HTMLVideoElement;
    let vfcCb: any = null;
    (video as any).requestVideoFrameCallback = jest.fn((cb: any) => { vfcCb = cb; return 1; });
    (video as any).cancelVideoFrameCallback = jest.fn();

    const src = new MediaPipeFrameSource(video, { fps: 60 });
    const frames: Frame[] = [];
    src.onFrame = (f) => frames.push(f);
    await src.start();

    vfcCb(12345, { mediaTime: 0 });

    await src.stop();
    expect(frames.length).toBe(1);
    expect(frames[0].timestampMs).toBe(12345);
  });

  test('uses mediaTime when non-zero (video file playback)', async () => {
    const createdCanvas = new FakeCanvas(2, 1);
    document.createElement = (tagName: string) => {
      if (tagName === 'canvas') return createdCanvas as unknown as HTMLCanvasElement;
      return origCreateCanvas(tagName);
    };

    const video = new FakeVideo(2, 1) as unknown as HTMLVideoElement;
    let vfcCb: any = null;
    (video as any).requestVideoFrameCallback = jest.fn((cb: any) => { vfcCb = cb; return 1; });
    (video as any).cancelVideoFrameCallback = jest.fn();

    const src = new MediaPipeFrameSource(video, { fps: 60 });
    const frames: Frame[] = [];
    src.onFrame = (f) => frames.push(f);
    await src.start();

    vfcCb(99999, { mediaTime: 1.5 });

    await src.stop();
    expect(frames.length).toBe(1);
    expect(frames[0].timestampMs).toBe(1500);
  });

  test('emits capture errors instead of swallowing them silently', async () => {
    class ThrowingCanvas extends FakeCanvas {
      override getContext(_name: string, options?: unknown) {
        this.lastContextOptions = options ?? null;
        return {
          drawImage() {
            throw new Error('video not ready');
          },
          getImageData() {
            throw new Error('should not be reached');
          },
        } as unknown as CanvasRenderingContext2D;
      }
    }

    document.createElement = (tagName: string) => {
      if (tagName === 'canvas') return new ThrowingCanvas(2, 1) as unknown as HTMLCanvasElement;
      return origCreateCanvas(tagName);
    };

    const video = new FakeVideo(2, 1) as unknown as HTMLVideoElement;
    const src = new MediaPipeFrameSource(video, { fps: 60 });
    const onError = jest.fn();
    (src as any).onError = onError;

    await src.start();
    await new Promise((r) => setTimeout(r, 20));
    await src.stop();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'capture_failed',
        stage: 'capture',
        message: 'video not ready',
      }),
    );
    expect((src as any).getLastError()).toEqual(
      expect.objectContaining({
        code: 'capture_failed',
      }),
    );
  });
});
