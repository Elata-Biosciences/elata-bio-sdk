import {
  FrameSource,
  Frame,
  averageGreenInROI,
  averageGreenInROIWithSkinMaskStats,
  averageRgbInROI,
  averageRgbInROIWithSkinMaskStats,
} from './frameSource';
import { RppgProcessor } from './rppgProcessor';

export type DemoRunnerOptions = {
  roi?: { x: number; y: number; w: number; h: number } | null;
  sampleRate?: number;
  roiSmoothingAlpha?: number;
  useSkinMask?: boolean;
  onStats?: (stats: { intensity: number; skinRatio: number; fps: number | null; r: number; g: number; b: number; clipRatio: number; motion: number }) => void;
  skinRatioSmoothingAlpha?: number;
};

export class DemoRunner {
  private running = false;
  private frameCount = 0;
  private lastSampleTs = 0;
  private smoothedRoi: { x: number; y: number; w: number; h: number } | null = null;
  private frameTimes: number[] = [];
  private lastFps: number | null = null;
  private lastCenter: { x: number; y: number } | null = null;
  private smoothedSkinRatio: number | null = null;

  constructor(private source: FrameSource, private processor: RppgProcessor, private opts: DemoRunnerOptions = {}) {
    this.source.onFrame = this.onFrame.bind(this);
  }

  async start() {
    this.running = true;
    await this.source.start();
  }

  async stop() {
    this.running = false;
    await this.source.stop();
  }

  private onFrame(frame: Frame) {
    if (!this.running) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.frameTimes.push(now);
    if (this.frameTimes.length > 30) this.frameTimes.shift();
    if (this.frameTimes.length >= 2) {
      const dt = (this.frameTimes[this.frameTimes.length - 1] - this.frameTimes[0]) / 1000;
      if (dt > 0) this.lastFps = (this.frameTimes.length - 1) / dt;
    }
    const useSkinMask = this.opts.useSkinMask !== false;
    let rgb = { r: 0, g: 0, b: 0 };
    let skinRatio = 1;
    let clipRatio = 0;
    let intensity = 0;
    let motion = 0;

    const rois = frame.rois && frame.rois.length > 0 ? frame.rois : null;
    if (rois) {
      const agg = aggregateRgbFromRois(frame, rois, useSkinMask);
      rgb = { r: agg.r, g: agg.g, b: agg.b };
      skinRatio = agg.skinRatio;
      clipRatio = agg.clipRatio;
      intensity = agg.g;
      if (frame.roi) {
        motion = computeMotion(frame.roi, this.lastCenter);
        this.lastCenter = { x: frame.roi.x + frame.roi.w * 0.5, y: frame.roi.y + frame.roi.h * 0.5 };
      }
    } else {
      let roi = this.opts.roi;
      if (typeof roi === 'undefined') {
        roi = frame.roi ?? null;
      }
      if (!roi) {
        roi = { x: Math.floor((frame.width - 100) / 2), y: Math.floor((frame.height - 100) / 2), w: 100, h: 100 };
      }
      const clamped = clampRoiToFrame(roi, frame.width, frame.height);
      const smoothed = smoothRoi(this.smoothedRoi, clamped, this.opts.roiSmoothingAlpha);
      const smoothedClamped = clampRoiToFrame(smoothed, frame.width, frame.height);
      this.smoothedRoi = smoothedClamped;
      if (useSkinMask) {
        const rgbRes = averageRgbInROIWithSkinMaskStats(
          frame,
          smoothedClamped.x,
          smoothedClamped.y,
          smoothedClamped.w,
          smoothedClamped.h
        );
        rgb = { r: rgbRes.r, g: rgbRes.g, b: rgbRes.b };
        skinRatio = rgbRes.skinRatio;
        clipRatio = rgbRes.clipRatio;
        intensity = rgbRes.g;
      } else {
        rgb = averageRgbInROI(frame, smoothedClamped.x, smoothedClamped.y, smoothedClamped.w, smoothedClamped.h);
        intensity = rgb.g;
        skinRatio = 1;
        clipRatio = 0;
      }
      motion = computeMotion(smoothedClamped, this.lastCenter);
      this.lastCenter = { x: smoothedClamped.x + smoothedClamped.w * 0.5, y: smoothedClamped.y + smoothedClamped.h * 0.5 };
    }
    if (!Number.isFinite(intensity)) return;
    skinRatio = smooth01(this.smoothedSkinRatio, skinRatio, this.opts.skinRatioSmoothingAlpha ?? 0.2);
    this.smoothedSkinRatio = skinRatio;
    const ts = frame.timestampMs ?? Date.now();
    const proc = this.processor as any;
    if (typeof proc.pushSampleRgbMeta === 'function') {
      proc.pushSampleRgbMeta(ts, rgb.r, rgb.g, rgb.b, skinRatio, motion, clipRatio);
    } else if (typeof proc.pushSampleRgb === 'function') {
      proc.pushSampleRgb(ts, rgb.r, rgb.g, rgb.b, skinRatio);
    } else if (typeof proc.pushSample === 'function') {
      proc.pushSample(ts, intensity);
    } else {
      throw new TypeError('processor has no push sample API');
    }
    if (this.opts.onStats) {
      this.opts.onStats({ intensity, skinRatio, fps: this.lastFps, r: rgb.r, g: rgb.g, b: rgb.b, clipRatio, motion });
    }
  }
}

function clampRoiToFrame(roi: { x: number; y: number; w: number; h: number }, width: number, height: number) {
  const x = Math.max(0, Math.min(width - 1, Math.floor(roi.x)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(roi.y)));
  const w = Math.max(1, Math.min(width - x, Math.floor(roi.w)));
  const h = Math.max(1, Math.min(height - y, Math.floor(roi.h)));
  return { x, y, w, h };
}

function smoothRoi(
  prev: { x: number; y: number; w: number; h: number } | null,
  next: { x: number; y: number; w: number; h: number },
  alpha = 0.2
) {
  if (!prev) return next;
  const prevCx = prev.x + prev.w * 0.5;
  const prevCy = prev.y + prev.h * 0.5;
  const nextCx = next.x + next.w * 0.5;
  const nextCy = next.y + next.h * 0.5;
  const dx = nextCx - prevCx;
  const dy = nextCy - prevCy;
  const maxDim = Math.max(prev.w, prev.h);
  if (Math.sqrt(dx * dx + dy * dy) > maxDim * 0.35) {
    return next;
  }
  const a = Math.min(0.9, Math.max(0.05, alpha));
  return {
    x: prev.x + (next.x - prev.x) * a,
    y: prev.y + (next.y - prev.y) * a,
    w: prev.w + (next.w - prev.w) * a,
    h: prev.h + (next.h - prev.h) * a,
  };
}

function aggregateRgbFromRois(frame: Frame, rois: { x: number; y: number; w: number; h: number }[], useSkinMask: boolean) {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumW = 0; // weight for RGB (skin pixels)
  let sumArea = 0;
  let sumSkinArea = 0;
  let sumClipArea = 0;
  for (const roi of rois) {
    const clamped = clampRoiToFrame(roi, frame.width, frame.height);
    const area = clamped.w * clamped.h;
    sumArea += area;
    if (useSkinMask) {
      const rgbRes = averageRgbInROIWithSkinMaskStats(frame, clamped.x, clamped.y, clamped.w, clamped.h);
      // Keep ROI contribution from collapsing to near-zero on transient skin-mask misses.
      const weight = area * Math.max(0.15, rgbRes.skinRatio);
      sumR += rgbRes.r * weight;
      sumG += rgbRes.g * weight;
      sumB += rgbRes.b * weight;
      sumW += weight;
      sumSkinArea += rgbRes.skinRatio * area;
      sumClipArea += rgbRes.clipRatio * area;
    } else {
      const rgbRes = averageRgbInROI(frame, clamped.x, clamped.y, clamped.w, clamped.h);
      sumR += rgbRes.r * area;
      sumG += rgbRes.g * area;
      sumB += rgbRes.b * area;
      sumW += area;
      sumSkinArea += area;
    }
  }
  if (sumW <= 0 || sumArea <= 0) {
    return { r: 0, g: 0, b: 0, skinRatio: 0, clipRatio: 0 };
  }
  return {
    r: sumR / sumW,
    g: sumG / sumW,
    b: sumB / sumW,
    skinRatio: sumSkinArea / sumArea,
    clipRatio: sumClipArea / sumArea,
  };
}

function computeMotion(roi: { x: number; y: number; w: number; h: number }, last: { x: number; y: number } | null) {
  if (!last) return 0;
  const cx = roi.x + roi.w * 0.5;
  const cy = roi.y + roi.h * 0.5;
  const dx = cx - last.x;
  const dy = cy - last.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const norm = Math.max(1, Math.max(roi.w, roi.h));
  return Math.min(1, dist / norm);
}

function smooth01(prev: number | null, next: number, alpha: number): number {
  const n = Math.max(0, Math.min(1, next));
  if (prev === null || !Number.isFinite(prev)) return n;
  const a = Math.min(0.8, Math.max(0.05, alpha));
  const delta = n - prev;
  const effectiveAlpha = Math.abs(delta) > 0.3 ? a * 0.35 : a;
  return Math.max(0, Math.min(1, prev + delta * effectiveAlpha));
}
