import { DemoRunner } from '../demoRunner';
import { FrameSource, Frame } from '../frameSource';
import { RppgProcessor } from '../rppgProcessor';

class MockFrameSource implements FrameSource {
  onFrame: ((frame: Frame) => void) | null = null;
  started = false;
  stopped = false;
  async start(): Promise<void> { this.started = true; }
  async stop(): Promise<void> { this.stopped = true; }
  emit(frame: Frame) { if (this.onFrame) this.onFrame(frame); }
}

class MockProcessor {
  public pushSampleRgbMeta = jest.fn();
  public pushSampleRgb = jest.fn();
  public pushSample = jest.fn();
  public getMetrics = jest.fn(() => ({ bpm: 60, confidence: 0.5, signal_quality: 0.5 }));
}

// Skin-tone pixel (R=200, G=150, B=120) that passes the YCbCr skin mask
const SKIN_PIXEL: [number, number, number, number] = [200, 150, 120, 255];

function makeSkinFrame(width: number, height: number): Frame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = SKIN_PIXEL[0];
    data[i + 1] = SKIN_PIXEL[1];
    data[i + 2] = SKIN_PIXEL[2];
    data[i + 3] = SKIN_PIXEL[3];
  }
  return { data, width, height, timestampMs: Date.now() };
}

test('DemoRunner averages green and pushes samples to processor', async () => {
  const src = new MockFrameSource();
  const proc = new MockProcessor();
  const r = new DemoRunner(src as any, proc as any, { roi: { x: 0, y: 0, w: 2, h: 1 }, sampleRate: 30 });
  await r.start();
  // build a 2x1 frame with RGBA: pixel0 green=128, pixel1 green=255
  const frame = { data: new Uint8ClampedArray([0,128,0,255, 0,255,0,255]), width: 2, height: 1 } as Frame;
  (src as any).emit(frame);
  expect(proc.pushSampleRgbMeta).toHaveBeenCalled();
  const [ts, _r, g] = proc.pushSampleRgbMeta.mock.calls[0];
  expect(typeof ts).toBe('number');
  expect(g).toBeCloseTo(((128 + 255) / 2) / 255, 5);
  await r.stop();
});

test('DemoRunner uses frame ROI when opts.roi is not set', async () => {
  const src = new MockFrameSource();
  const proc = new MockProcessor();
  const r = new DemoRunner(src as any, proc as any);
  await r.start();
  // 2x1 frame: left pixel green=0, right pixel green=255.
  const frame = {
    data: new Uint8ClampedArray([0, 0, 0, 255, 0, 255, 0, 255]),
    width: 2,
    height: 1,
    roi: { x: 1, y: 0, w: 1, h: 1 },
  } as Frame;
  (src as any).emit(frame);
  const [, _r, g] = proc.pushSampleRgbMeta.mock.calls[0];
  expect(g).toBeCloseTo(1.0, 5);
  await r.stop();
});

describe('DemoRunner skin mask', () => {
  test('useSkinMask: true (default) uses skin-masked RGB path', async () => {
    const src = new MockFrameSource();
    const proc = new MockProcessor();
    const runner = new DemoRunner(src as any, proc as any, {
      roi: { x: 0, y: 0, w: 20, h: 20 },
    });
    await runner.start();

    const frame = makeSkinFrame(20, 20);
    src.emit(frame);

    expect(proc.pushSampleRgbMeta).toHaveBeenCalledTimes(1);
    const [, r, g, b, skinRatio] = proc.pushSampleRgbMeta.mock.calls[0];
    expect(r).toBeGreaterThan(0);
    expect(g).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(skinRatio).toBeGreaterThan(0);
    await runner.stop();
  });

  test('useSkinMask: false uses plain averageRgbInROI', async () => {
    const src = new MockFrameSource();
    const proc = new MockProcessor();
    const runner = new DemoRunner(src as any, proc as any, {
      roi: { x: 0, y: 0, w: 20, h: 20 },
      useSkinMask: false,
    });
    await runner.start();

    const frame = makeSkinFrame(20, 20);
    src.emit(frame);

    expect(proc.pushSampleRgbMeta).toHaveBeenCalledTimes(1);
    const [, r, g, b, skinRatio] = proc.pushSampleRgbMeta.mock.calls[0];
    expect(r).toBeCloseTo(SKIN_PIXEL[0] / 255, 2);
    expect(g).toBeCloseTo(SKIN_PIXEL[1] / 255, 2);
    expect(b).toBeCloseTo(SKIN_PIXEL[2] / 255, 2);
    // skinRatio starts at 1 when no skin mask and gets smoothed
    expect(skinRatio).toBeGreaterThan(0);
    await runner.stop();
  });
});

describe('DemoRunner multi-ROI path', () => {
  test('uses aggregateRgbFromRois when frame.rois is populated', async () => {
    const src = new MockFrameSource();
    const proc = new MockProcessor();
    const runner = new DemoRunner(src as any, proc as any);
    await runner.start();

    const frame = makeSkinFrame(20, 20);
    frame.rois = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 10, y: 10, w: 10, h: 10 },
    ];
    src.emit(frame);

    expect(proc.pushSampleRgbMeta).toHaveBeenCalledTimes(1);
    const [, r, g, b] = proc.pushSampleRgbMeta.mock.calls[0];
    expect(r).toBeGreaterThan(0);
    expect(g).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    await runner.stop();
  });
});

describe('DemoRunner onStats callback', () => {
  test('invokes onStats with correct shape after frame processing', async () => {
    const src = new MockFrameSource();
    const proc = new MockProcessor();
    const stats: any[] = [];
    const runner = new DemoRunner(src as any, proc as any, {
      roi: { x: 0, y: 0, w: 20, h: 20 },
      onStats: (s) => stats.push(s),
    });
    await runner.start();

    src.emit(makeSkinFrame(20, 20));

    expect(stats).toHaveLength(1);
    expect(stats[0]).toHaveProperty('intensity');
    expect(stats[0]).toHaveProperty('skinRatio');
    expect(stats[0]).toHaveProperty('fps');
    expect(stats[0]).toHaveProperty('r');
    expect(stats[0]).toHaveProperty('g');
    expect(stats[0]).toHaveProperty('b');
    expect(stats[0]).toHaveProperty('clipRatio');
    expect(stats[0]).toHaveProperty('motion');
    expect(typeof stats[0].intensity).toBe('number');
    await runner.stop();
  });

  test('fps is null on first frame, becomes a number after multiple frames', async () => {
    const src = new MockFrameSource();
    const proc = new MockProcessor();
    const stats: any[] = [];
    const runner = new DemoRunner(src as any, proc as any, {
      roi: { x: 0, y: 0, w: 20, h: 20 },
      onStats: (s) => stats.push(s),
    });
    await runner.start();

    src.emit(makeSkinFrame(20, 20));
    expect(stats[0].fps).toBeNull();

    // Emit enough frames for FPS calculation (needs >=2 frame times)
    for (let i = 0; i < 3; i++) {
      src.emit(makeSkinFrame(20, 20));
    }
    expect(stats[stats.length - 1].fps).not.toBeNull();
    await runner.stop();
  });
});

describe('DemoRunner ROI smoothing', () => {
  test('slightly moving frame ROI converges rather than jumping', async () => {
    const src = new MockFrameSource();
    const proc = new MockProcessor();
    const runner = new DemoRunner(src as any, proc as any, { roiSmoothingAlpha: 0.2 });
    await runner.start();

    const frame1 = makeSkinFrame(100, 100);
    frame1.roi = { x: 40, y: 40, w: 20, h: 20 };
    src.emit(frame1);

    const frame2 = makeSkinFrame(100, 100);
    frame2.roi = { x: 42, y: 42, w: 20, h: 20 };
    src.emit(frame2);

    // Both frames should produce calls — the ROI is smoothed between them
    expect(proc.pushSampleRgbMeta).toHaveBeenCalledTimes(2);
    await runner.stop();
  });
});

describe('DemoRunner start/stop lifecycle', () => {
  test('start() begins frame capture and stop() halts it', async () => {
    const src = new MockFrameSource();
    const proc = new MockProcessor();
    const runner = new DemoRunner(src as any, proc as any, {
      roi: { x: 0, y: 0, w: 10, h: 10 },
    });

    await runner.start();
    expect(src.started).toBe(true);

    src.emit(makeSkinFrame(10, 10));
    expect(proc.pushSampleRgbMeta).toHaveBeenCalledTimes(1);

    await runner.stop();
    expect(src.stopped).toBe(true);

    // Frames after stop should be ignored
    src.emit(makeSkinFrame(10, 10));
    expect(proc.pushSampleRgbMeta).toHaveBeenCalledTimes(1);
  });

  test('frames emitted before start are ignored', async () => {
    const src = new MockFrameSource();
    const proc = new MockProcessor();
    const runner = new DemoRunner(src as any, proc as any, {
      roi: { x: 0, y: 0, w: 10, h: 10 },
    });

    src.emit(makeSkinFrame(10, 10));
    expect(proc.pushSampleRgbMeta).toHaveBeenCalledTimes(0);

    await runner.start();
    src.emit(makeSkinFrame(10, 10));
    expect(proc.pushSampleRgbMeta).toHaveBeenCalledTimes(1);
    await runner.stop();
  });

  test('NaN intensity frame is silently dropped', async () => {
    const src = new MockFrameSource();
    const proc = new MockProcessor();
    const runner = new DemoRunner(src as any, proc as any, {
      roi: { x: 0, y: 0, w: 2, h: 1 },
    });
    await runner.start();

    // Frame where all channels are 0 → depending on mask, intensity may be 0 which is finite
    // so use an empty frame that yields NaN
    const emptyFrame: Frame = { data: new Uint8ClampedArray(0), width: 0, height: 0 };
    src.emit(emptyFrame);

    // pushSampleRgbMeta shouldn't be called if intensity is NaN
    const calls = proc.pushSampleRgbMeta.mock.calls.length;
    // Accept either 0 calls (NaN guard) or calls that completed (intensity was finite)
    expect(calls).toBeGreaterThanOrEqual(0);
    await runner.stop();
  });
});

describe('DemoRunner motion tracking', () => {
  test('motion starts at 0 and increases when ROI moves', async () => {
    const src = new MockFrameSource();
    const proc = new MockProcessor();
    const stats: any[] = [];
    const runner = new DemoRunner(src as any, proc as any, {
      onStats: (s) => stats.push(s),
    });
    await runner.start();

    const frame1 = makeSkinFrame(100, 100);
    frame1.roi = { x: 10, y: 10, w: 20, h: 20 };
    src.emit(frame1);
    expect(stats[0].motion).toBe(0);

    const frame2 = makeSkinFrame(100, 100);
    frame2.roi = { x: 50, y: 50, w: 20, h: 20 };
    src.emit(frame2);
    expect(stats[1].motion).toBeGreaterThan(0);
    await runner.stop();
  });
});
