import { MediaPipeFaceFrameSource } from '../mediaPipeFaceFrameSource';
import { Frame } from '../frameSource';

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

class FakeVideo {
  videoWidth: number;
  videoHeight: number;
  constructor(w: number, h: number) { this.videoWidth = w; this.videoHeight = h; }
}

function setupCanvasMock(w: number, h: number) {
  const origCreate = document.createElement.bind(document);
  document.createElement = ((tag: string) =>
    tag === 'canvas'
      ? (new FakeCanvas(w, h) as unknown as HTMLCanvasElement)
      : origCreate(tag)) as any;
  return () => { document.createElement = origCreate; };
}

test('MediaPipeFaceFrameSource computes ROI from landmarks and emits frame with roi', async () => {
  const restore = setupCanvasMock(200, 100);

  const video = new FakeVideo(200, 100) as unknown as HTMLVideoElement;
  let onResultsCb: any = null;
  const faceMesh = {
    set onResults(cb: any) { onResultsCb = cb; },
    send: jest.fn()
  };

  const src = new MediaPipeFaceFrameSource(video, faceMesh as any, 30);
  const onFrame = jest.fn((f: Frame) => {
    expect(f.roi).toBeDefined();
    const roi = f.roi!;
    expect(roi.x).toBeGreaterThan(30);
    expect(roi.y).toBeGreaterThan(20);
    expect(roi.w).toBeGreaterThan(10);
    expect(roi.h).toBeGreaterThan(10);
  });
  src.onFrame = onFrame;
  await src.start();

  const landmarks = [
    { x: 0.45, y: 0.4 },
    { x: 0.55, y: 0.4 },
    { x: 0.5, y: 0.5 },
  ];
  onResultsCb({ multiFaceLandmarks: [landmarks] });

  await new Promise((r) => setTimeout(r, 10));
  await src.stop();
  expect(onFrame).toHaveBeenCalled();

  restore();
});

describe('MediaPipeFaceFrameSource edge cases', () => {
  test('no landmarks detected still emits a frame without roi', async () => {
    const restore = setupCanvasMock(200, 100);
    const video = new FakeVideo(200, 100) as unknown as HTMLVideoElement;
    let onResultsCb: any = null;
    const faceMesh = {
      set onResults(cb: any) { onResultsCb = cb; },
      send: jest.fn()
    };

    const src = new MediaPipeFaceFrameSource(video, faceMesh as any, 30);
    const frames: Frame[] = [];
    src.onFrame = (f) => frames.push(f);
    await src.start();

    onResultsCb({ multiFaceLandmarks: [] });

    await new Promise((r) => setTimeout(r, 10));
    await src.stop();

    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0].roi).toBeUndefined();
    restore();
  });

  test('emits sub-ROIs (forehead + cheeks) when landmarks present', async () => {
    const restore = setupCanvasMock(400, 400);
    const video = new FakeVideo(400, 400) as unknown as HTMLVideoElement;
    let onResultsCb: any = null;
    const faceMesh = {
      set onResults(cb: any) { onResultsCb = cb; },
      send: jest.fn()
    };

    const src = new MediaPipeFaceFrameSource(video, faceMesh as any, 30);
    const frames: Frame[] = [];
    src.onFrame = (f) => frames.push(f);
    await src.start();

    const landmarks = [
      { x: 0.3, y: 0.3 },
      { x: 0.7, y: 0.3 },
      { x: 0.3, y: 0.7 },
      { x: 0.7, y: 0.7 },
      { x: 0.5, y: 0.5 },
    ];
    onResultsCb({ multiFaceLandmarks: [landmarks] });

    await new Promise((r) => setTimeout(r, 10));
    await src.stop();

    expect(frames.length).toBeGreaterThan(0);
    const frame = frames[0];
    expect(frame.rois).toBeDefined();
    expect(frame.rois!.length).toBe(3);

    for (const roi of frame.rois!) {
      expect(roi.x).toBeGreaterThanOrEqual(0);
      expect(roi.y).toBeGreaterThanOrEqual(0);
      expect(roi.w).toBeGreaterThanOrEqual(1);
      expect(roi.h).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(roi.x)).toBe(true);
      expect(Number.isInteger(roi.y)).toBe(true);
    }
    restore();
  });

  test('ROI smoothing across multiple frames converges rather than jumping', async () => {
    const restore = setupCanvasMock(200, 200);
    const video = new FakeVideo(200, 200) as unknown as HTMLVideoElement;
    let onResultsCb: any = null;
    const faceMesh = {
      set onResults(cb: any) { onResultsCb = cb; },
      send: jest.fn()
    };

    const src = new MediaPipeFaceFrameSource(video, faceMesh as any, 30);
    const frames: Frame[] = [];
    src.onFrame = (f) => frames.push(f);
    await src.start();

    const baseLandmarks = [
      { x: 0.4, y: 0.4 },
      { x: 0.6, y: 0.4 },
      { x: 0.5, y: 0.6 },
    ];
    onResultsCb({ multiFaceLandmarks: [baseLandmarks] });

    // Slightly shift landmarks
    const shiftedLandmarks = baseLandmarks.map((l) => ({ x: l.x + 0.01, y: l.y + 0.01 }));
    onResultsCb({ multiFaceLandmarks: [shiftedLandmarks] });

    await new Promise((r) => setTimeout(r, 10));
    await src.stop();

    expect(frames.length).toBeGreaterThanOrEqual(2);
    const roi1 = frames[0].roi!;
    const roi2 = frames[1].roi!;
    // The second ROI should be smoothed, not jumping by the full shift
    const dx = Math.abs(roi2.x - roi1.x);
    expect(dx).toBeLessThan(20);
    restore();
  });

  test('uses requestVideoFrameCallback when available', async () => {
    const restore = setupCanvasMock(200, 100);
    const video = new FakeVideo(200, 100) as unknown as HTMLVideoElement;

    let vfcCallback: any = null;
    (video as any).requestVideoFrameCallback = jest.fn((cb: any) => {
      vfcCallback = cb;
      return 42;
    });
    (video as any).cancelVideoFrameCallback = jest.fn();

    const faceMesh = {
      set onResults(_cb: any) {},
      send: jest.fn()
    };

    const src = new MediaPipeFaceFrameSource(video, faceMesh as any, 30);
    const frames: Frame[] = [];
    src.onFrame = (f) => frames.push(f);
    await src.start();

    expect((video as any).requestVideoFrameCallback).toHaveBeenCalled();

    // Simulate a video frame callback
    if (vfcCallback) {
      vfcCallback(performance.now(), { mediaTime: 0.5 });
    }

    await src.stop();
    expect((video as any).cancelVideoFrameCallback).toHaveBeenCalled();
    restore();
  });

  test('falls back to setTimeout when requestVideoFrameCallback unavailable', async () => {
    jest.useFakeTimers();
    const restore = setupCanvasMock(200, 100);
    const video = new FakeVideo(200, 100) as unknown as HTMLVideoElement;

    const faceMesh = {
      set onResults(_cb: any) {},
      send: jest.fn()
    };

    const src = new MediaPipeFaceFrameSource(video, faceMesh as any, 30);
    const frames: Frame[] = [];
    src.onFrame = (f) => frames.push(f);
    await src.start();

    jest.advanceTimersByTime(100);
    expect(faceMesh.send).toHaveBeenCalled();

    await src.stop();
    restore();
    jest.useRealTimers();
  });
});
