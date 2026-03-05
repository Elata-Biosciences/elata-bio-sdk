import {
  averageGreenInROI,
  averageRgbInROI,
  averageGreenInROIWithSkinMask,
  averageGreenInROIWithSkinMaskStats,
  averageRgbInROIWithSkinMaskStats,
  Frame,
} from '../frameSource';

function makeFrame(width: number, height: number, fill: [number, number, number, number]): Frame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return { data, width, height };
}

function makeFrameFromPixels(width: number, height: number, pixels: [number, number, number, number][]): Frame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i++) {
    data[i * 4] = pixels[i][0];
    data[i * 4 + 1] = pixels[i][1];
    data[i * 4 + 2] = pixels[i][2];
    data[i * 4 + 3] = pixels[i][3];
  }
  return { data, width, height };
}

// Typical skin-tone RGB that passes YCbCr skin check (cb ∈ [77,127], cr ∈ [133,173])
const SKIN_PIXEL: [number, number, number, number] = [200, 150, 120, 255];
// Blue pixel — clearly outside the skin mask thresholds
const NON_SKIN_PIXEL: [number, number, number, number] = [0, 0, 255, 255];

describe('averageGreenInROI', () => {
  test('uniform green frame returns normalised green value', () => {
    const frame = makeFrame(4, 4, [0, 128, 0, 255]);
    const result = averageGreenInROI(frame, 0, 0, 4, 4);
    expect(result).toBeCloseTo(128 / 255, 5);
  });

  test('full-white frame returns 1.0 for green channel', () => {
    const frame = makeFrame(2, 2, [255, 255, 255, 255]);
    expect(averageGreenInROI(frame, 0, 0, 2, 2)).toBeCloseTo(1.0, 5);
  });

  test('full-black frame returns 0 for green channel', () => {
    const frame = makeFrame(2, 2, [0, 0, 0, 255]);
    expect(averageGreenInROI(frame, 0, 0, 2, 2)).toBeCloseTo(0, 5);
  });

  test('ROI subset averages only the selected pixels', () => {
    // 2x2: top-left g=0, top-right g=100, bottom-left g=200, bottom-right g=50
    const frame = makeFrameFromPixels(2, 2, [
      [0, 0, 0, 255],
      [0, 100, 0, 255],
      [0, 200, 0, 255],
      [0, 50, 0, 255],
    ]);
    // ROI covers only top-right pixel
    expect(averageGreenInROI(frame, 1, 0, 1, 1)).toBeCloseTo(100 / 255, 5);
    // ROI covers bottom row
    expect(averageGreenInROI(frame, 0, 1, 2, 1)).toBeCloseTo((200 + 50) / 2 / 255, 5);
  });

  test('zero-area ROI returns 0', () => {
    const frame = makeFrame(4, 4, [0, 128, 0, 255]);
    expect(averageGreenInROI(frame, 0, 0, 0, 4)).toBe(0);
    expect(averageGreenInROI(frame, 0, 0, 4, 0)).toBe(0);
  });

  test('works with plain number[] data', () => {
    const data = [0, 200, 0, 255, 0, 100, 0, 255];
    const frame: Frame = { data: data as any, width: 2, height: 1 };
    expect(averageGreenInROI(frame, 0, 0, 2, 1)).toBeCloseTo((200 + 100) / 2 / 255, 5);
  });
});

describe('averageRgbInROI', () => {
  test('returns correct per-channel averages', () => {
    const frame = makeFrameFromPixels(2, 1, [
      [100, 150, 200, 255],
      [200, 50, 100, 255],
    ]);
    const rgb = averageRgbInROI(frame, 0, 0, 2, 1);
    expect(rgb.r).toBeCloseTo((100 + 200) / 2 / 255, 5);
    expect(rgb.g).toBeCloseTo((150 + 50) / 2 / 255, 5);
    expect(rgb.b).toBeCloseTo((200 + 100) / 2 / 255, 5);
  });

  test('uniform frame returns same value for all channels', () => {
    const frame = makeFrame(3, 3, [128, 128, 128, 255]);
    const rgb = averageRgbInROI(frame, 0, 0, 3, 3);
    expect(rgb.r).toBeCloseTo(rgb.g, 5);
    expect(rgb.g).toBeCloseTo(rgb.b, 5);
  });

  test('zero-area ROI returns {0,0,0}', () => {
    const frame = makeFrame(4, 4, [255, 255, 255, 255]);
    const rgb = averageRgbInROI(frame, 0, 0, 0, 0);
    expect(rgb).toEqual({ r: 0, g: 0, b: 0 });
  });

  test('ROI respects bounds', () => {
    // 3x1: [R=10,G=20,B=30], [R=40,G=50,B=60], [R=70,G=80,B=90]
    const frame = makeFrameFromPixels(3, 1, [
      [10, 20, 30, 255],
      [40, 50, 60, 255],
      [70, 80, 90, 255],
    ]);
    const rgb = averageRgbInROI(frame, 1, 0, 2, 1);
    expect(rgb.r).toBeCloseTo((40 + 70) / 2 / 255, 5);
    expect(rgb.g).toBeCloseTo((50 + 80) / 2 / 255, 5);
    expect(rgb.b).toBeCloseTo((60 + 90) / 2 / 255, 5);
  });
});

describe('averageGreenInROIWithSkinMask', () => {
  test('delegates to averageGreenInROIWithSkinMaskStats and returns intensity', () => {
    const frame = makeFrame(10, 10, SKIN_PIXEL);
    const intensity = averageGreenInROIWithSkinMask(frame, 0, 0, 10, 10);
    const stats = averageGreenInROIWithSkinMaskStats(frame, 0, 0, 10, 10);
    expect(intensity).toBeCloseTo(stats.intensity, 10);
  });
});

describe('averageGreenInROIWithSkinMaskStats', () => {
  test('all-skin pixels returns high skinRatio', () => {
    const frame = makeFrame(10, 10, SKIN_PIXEL);
    const result = averageGreenInROIWithSkinMaskStats(frame, 0, 0, 10, 10);
    expect(result.skinRatio).toBeGreaterThan(0.5);
    expect(result.intensity).toBeCloseTo(SKIN_PIXEL[1] / 255, 2);
  });

  test('no-skin pixels falls back to unmasked green average', () => {
    const frame = makeFrame(10, 10, NON_SKIN_PIXEL);
    const result = averageGreenInROIWithSkinMaskStats(frame, 0, 0, 10, 10);
    // skinRatio should be at least minSkinRatio (0.1 for large frames)
    expect(result.skinRatio).toBeGreaterThanOrEqual(0.1);
    // intensity falls back to averageGreenInROI
    const fallback = averageGreenInROI(frame, 0, 0, 10, 10);
    expect(result.intensity).toBeCloseTo(fallback, 5);
  });

  test('mixed skin/non-skin averages only skin green channel', () => {
    // 12x1 frame: first 11 skin, last 1 non-skin
    const pixels: [number, number, number, number][] = [];
    for (let i = 0; i < 11; i++) pixels.push(SKIN_PIXEL);
    pixels.push(NON_SKIN_PIXEL);
    const frame = makeFrameFromPixels(12, 1, pixels);
    const result = averageGreenInROIWithSkinMaskStats(frame, 0, 0, 12, 1);
    // Skin count (11) >= max(10, floor(12*0.1)=1), so skin path is used
    expect(result.intensity).toBeCloseTo(SKIN_PIXEL[1] / 255, 2);
    expect(result.skinRatio).toBeCloseTo(11 / 12, 2);
  });

  test('small ROI with too few skin pixels triggers fallback', () => {
    // 3x3 = 9 pixels, threshold = max(10, floor(9*0.1)=0) = 10 → always fallback
    const frame = makeFrame(3, 3, SKIN_PIXEL);
    const result = averageGreenInROIWithSkinMaskStats(frame, 0, 0, 3, 3);
    const fallback = averageGreenInROI(frame, 0, 0, 3, 3);
    expect(result.intensity).toBeCloseTo(fallback, 5);
  });
});

describe('averageRgbInROIWithSkinMaskStats', () => {
  test('returns correct shape with skinRatio and clipRatio', () => {
    const frame = makeFrame(10, 10, SKIN_PIXEL);
    const result = averageRgbInROIWithSkinMaskStats(frame, 0, 0, 10, 10);
    expect(typeof result.r).toBe('number');
    expect(typeof result.g).toBe('number');
    expect(typeof result.b).toBe('number');
    expect(typeof result.skinRatio).toBe('number');
    expect(typeof result.clipRatio).toBe('number');
  });

  test('skin pixels produce correct RGB averages', () => {
    const frame = makeFrame(10, 10, SKIN_PIXEL);
    const result = averageRgbInROIWithSkinMaskStats(frame, 0, 0, 10, 10);
    expect(result.r).toBeCloseTo(SKIN_PIXEL[0] / 255, 2);
    expect(result.g).toBeCloseTo(SKIN_PIXEL[1] / 255, 2);
    expect(result.b).toBeCloseTo(SKIN_PIXEL[2] / 255, 2);
    expect(result.skinRatio).toBeGreaterThan(0.5);
  });

  test('clipping detected for near-zero and near-255 pixels', () => {
    // Pixels with R=0 trigger clipCount because R < 5
    const frame = makeFrame(10, 10, [0, 128, 128, 255]);
    const result = averageRgbInROIWithSkinMaskStats(frame, 0, 0, 10, 10);
    expect(result.clipRatio).toBeGreaterThan(0);
  });

  test('no clipping for mid-range pixels', () => {
    const frame = makeFrame(10, 10, [128, 128, 128, 255]);
    const result = averageRgbInROIWithSkinMaskStats(frame, 0, 0, 10, 10);
    expect(result.clipRatio).toBe(0);
  });

  test('non-skin pixels fall back to averageRgbInROI', () => {
    const frame = makeFrame(10, 10, NON_SKIN_PIXEL);
    const result = averageRgbInROIWithSkinMaskStats(frame, 0, 0, 10, 10);
    const fallbackRgb = averageRgbInROI(frame, 0, 0, 10, 10);
    expect(result.r).toBeCloseTo(fallbackRgb.r, 5);
    expect(result.g).toBeCloseTo(fallbackRgb.g, 5);
    expect(result.b).toBeCloseTo(fallbackRgb.b, 5);
  });

  test('zero-area ROI falls back and returns minSkinRatio', () => {
    const frame = makeFrame(4, 4, SKIN_PIXEL);
    const result = averageRgbInROIWithSkinMaskStats(frame, 0, 0, 0, 0);
    expect(result.r).toBe(0);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.clipRatio).toBe(0);
    // With count=0, minSkinRatio defaults to 0.1
    expect(result.skinRatio).toBeCloseTo(0.1, 5);
  });
});
