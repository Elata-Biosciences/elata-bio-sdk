import { initDemo } from '../src/demoApp';
import { MediaPipeFaceFrameSource } from '../src/mediaPipeFaceFrameSource';

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
}

async function start() {
  const video = getEl('video') as HTMLVideoElement;
  const statusEl = getEl('status');
  const bpmEl = getEl('bpm');
  const bpmRawEl = getEl('bpm-raw');
  const confEl = getEl('confidence');
  const signalEl = getEl('signal');
  const backendEl = getEl('backend');
  const roiEl = getEl('roi');
  const fpsEl = getEl('fps');
  const intensityEl = getEl('intensity');
  const skinEl = getEl('skin');
  const motionEl = getEl('motion');
  const clippingEl = getEl('clipping');
  const snrEl = getEl('snr');
  const intervalEl = getEl('metrics-interval');
  const reasonsEl = getEl('reasons');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240 },
      audio: false,
    });
    video.srcObject = stream;
  } catch (err) {
    statusEl.textContent = 'Camera access required for demo.';
    return;
  }

  const track = (video.srcObject as MediaStream).getVideoTracks()[0];
  const settings = track?.getSettings ? track.getSettings() : {};
  const trackFps = typeof settings?.frameRate === 'number' ? settings.frameRate : null;

  statusEl.textContent = 'Initializing...';
  let lastStats = { intensity: 0, skinRatio: 0, fps: trackFps, r: 0, g: 0, b: 0, clipRatio: 0, motion: 0 };
  const { proc, source } = await initDemo(video, {
    sampleRate: trackFps ?? 30,
    windowSec: 8,
    roiSmoothingAlpha: 0.15,
    useSkinMask: true,
    skinRatioSmoothingAlpha: 0.22,
    onStats: (s) => {
      lastStats = s;
    },
  });

  const usingFaceRoi = source instanceof MediaPipeFaceFrameSource;
  roiEl.textContent = usingFaceRoi ? 'MediaPipe Face ROI' : 'Centered box';

  const backendAvailable = (window as any).__rppg_demo?.backendAvailable;
  backendEl.textContent = backendAvailable ? 'WASM (Rust)' : 'JS fallback';

  statusEl.textContent = 'Running';

  const updateIntervalMs = 1000;
  let emaBpm: number | null = null;
  const emaAlpha = 0.2;

  intervalEl.textContent = `${(updateIntervalMs / 1000).toFixed(1)}s`;

  setInterval(() => {
    const metrics = proc.getMetrics();
    const rawBpm = metrics.bpm ?? null;

    bpmRawEl.textContent = rawBpm ? rawBpm.toFixed(1) : '--';

    if (rawBpm) {
      emaBpm = emaBpm === null ? rawBpm : emaBpm + (rawBpm - emaBpm) * emaAlpha;
    }

    bpmEl.textContent = emaBpm ? emaBpm.toFixed(1) : '--';

    confEl.textContent = (metrics.confidence ?? 0).toFixed(2);
    signalEl.textContent = (metrics.signal_quality ?? 0).toFixed(2);
    snrEl.textContent = Number.isFinite(metrics.snr as any) ? Number(metrics.snr).toFixed(2) : '--';
    reasonsEl.textContent = (metrics.reason_codes && metrics.reason_codes.length > 0) ? metrics.reason_codes.join(', ') : '--';

    fpsEl.textContent = lastStats.fps ? lastStats.fps.toFixed(1) : '--';
    intensityEl.textContent = Number.isFinite(lastStats.intensity) ? lastStats.intensity.toFixed(4) : '--';
    skinEl.textContent = Number.isFinite(lastStats.skinRatio) ? (lastStats.skinRatio * 100).toFixed(0) + '%' : '--';
    motionEl.textContent = Number.isFinite(lastStats.motion) ? lastStats.motion.toFixed(3) : '--';
    clippingEl.textContent = Number.isFinite(lastStats.clipRatio) ? (lastStats.clipRatio * 100).toFixed(1) + '%' : '--';
  }, updateIntervalMs);
}

start().catch((err) => {
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = `Failed to start: ${String(err)}`;
});
