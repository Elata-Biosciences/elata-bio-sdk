export type ROI = { x: number; y: number; w: number; h: number };

export type Frame = {
  // RGBA pixel data as a flat Uint8ClampedArray or number[] with length = width*height*4
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
  roi?: ROI;
  rois?: ROI[];
  timestampMs?: number;
};

export interface FrameSource {
  onFrame: ((frame: Frame) => void) | null;
  start(): Promise<void>;
  stop(): Promise<void>;
}

// A small helper to compute average green channel in a rectangular ROI
export function averageGreenInROI(frame: Frame, x: number, y: number, w: number, h: number): number {
  const data = frame.data;
  const width = frame.width;
  let sum = 0;
  let count = 0;
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      const idx = (row * width + col) * 4;
      const g = (data as any)[idx + 1];
      sum += g;
      count++;
    }
  }
  // normalize 0..1
  return count === 0 ? 0 : (sum / count) / 255.0;
}

export function averageRgbInROI(frame: Frame, x: number, y: number, w: number, h: number): { r: number; g: number; b: number } {
  const data = frame.data;
  const width = frame.width;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      const idx = (row * width + col) * 4;
      sumR += (data as any)[idx + 0];
      sumG += (data as any)[idx + 1];
      sumB += (data as any)[idx + 2];
      count++;
    }
  }
  if (count === 0) return { r: 0, g: 0, b: 0 };
  return { r: (sumR / count) / 255.0, g: (sumG / count) / 255.0, b: (sumB / count) / 255.0 };
}

// Compute average green channel using a simple skin mask (YCbCr thresholds).
export function averageGreenInROIWithSkinMask(
  frame: Frame,
  x: number,
  y: number,
  w: number,
  h: number
): number {
  return averageGreenInROIWithSkinMaskStats(frame, x, y, w, h).intensity;
}

export function averageGreenInROIWithSkinMaskStats(
  frame: Frame,
  x: number,
  y: number,
  w: number,
  h: number
): { intensity: number; skinRatio: number } {
  const data = frame.data;
  const width = frame.width;
  let sum = 0;
  let count = 0;
  let skinCount = 0;
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      const idx = (row * width + col) * 4;
      const r = (data as any)[idx + 0];
      const g = (data as any)[idx + 1];
      const b = (data as any)[idx + 2];
      // ITU-R BT.601 conversion to Cb/Cr (approx)
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const isSkin = cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
      if (isSkin) {
        sum += g;
        skinCount++;
      }
      count++;
    }
  }
  const skinRatio = count > 0 ? skinCount / count : 0;
  const minSkinRatio = count > 0 ? Math.max(0.1, 10 / count) : 0.1;
  if (skinCount < Math.max(10, Math.floor(count * 0.1))) {
    // Not enough skin-like pixels; fall back to unmasked average.
    return { intensity: averageGreenInROI(frame, x, y, w, h), skinRatio: Math.max(skinRatio, minSkinRatio) };
  }
  return { intensity: (sum / skinCount) / 255.0, skinRatio };
}

export function averageRgbInROIWithSkinMaskStats(
  frame: Frame,
  x: number,
  y: number,
  w: number,
  h: number
): { r: number; g: number; b: number; skinRatio: number; clipRatio: number } {
  const data = frame.data;
  const width = frame.width;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  let skinCount = 0;
  let clipCount = 0;
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      const idx = (row * width + col) * 4;
      const r = (data as any)[idx + 0];
      const g = (data as any)[idx + 1];
      const b = (data as any)[idx + 2];
      if (r < 5 || g < 5 || b < 5 || r > 250 || g > 250 || b > 250) {
        clipCount++;
      }
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const isSkin = cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
      if (isSkin) {
        sumR += r;
        sumG += g;
        sumB += b;
        skinCount++;
      }
      count++;
    }
  }
  const skinRatio = count > 0 ? skinCount / count : 0;
  const clipRatio = count > 0 ? clipCount / count : 0;
  const minSkinRatio = count > 0 ? Math.max(0.1, 10 / count) : 0.1;
  if (skinCount < Math.max(10, Math.floor(count * 0.1))) {
    const rgb = averageRgbInROI(frame, x, y, w, h);
    return { ...rgb, skinRatio: Math.max(skinRatio, minSkinRatio), clipRatio };
  }
  if (skinCount === 0) return { r: 0, g: 0, b: 0, skinRatio, clipRatio };
  return {
    r: (sumR / skinCount) / 255.0,
    g: (sumG / skinCount) / 255.0,
    b: (sumB / skinCount) / 255.0,
    skinRatio,
    clipRatio,
  };
}
