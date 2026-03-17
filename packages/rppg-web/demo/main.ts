import { initDemo } from '../src/demoApp';
import { MediaPipeFaceFrameSource } from '../src/mediaPipeFaceFrameSource';

// --- DOM helpers ---
function getEl<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
}

// --- UI refs ---
const video        = getEl<HTMLVideoElement>('video');
const startBtn     = getEl('start-btn');
const startBtnLabel = getEl('start-btn-label');
const heartIcon    = getEl('heart-icon');
const bpmMainEl    = getEl('bpm-main');
const bpmEl        = getEl('bpm');
const bpmRawEl     = getEl('bpm-raw');
const confEl       = getEl('confidence');
const signalEl     = getEl('signal');
const backendBadge = getEl('backend-badge');
const roiBadge     = getEl('roi-badge');
const fpsBadge     = getEl('fps-badge');
const snrBadge     = getEl('snr-badge');
const intensityEl  = getEl('intensity');
const skinEl       = getEl('skin');
const motionEl     = getEl('motion');
const clippingEl   = getEl('clipping');
const reasonsEl    = getEl('reasons');
const reasonWrap   = getEl('reason-wrap');
const statusBadge  = getEl('status-badge');
const statusBadgeWrap = getEl('status-badge-wrap');
const qualityBadgeWrap = getEl('quality-badge-wrap');
const signalQualityBadge = getEl('signal-quality-badge');
const idleOverlay  = getEl('idle-overlay');
const waveCanvas   = getEl<HTMLCanvasElement>('wave-canvas');
const debugToggle  = getEl('debug-toggle');
const debugPanel   = getEl('debug-panel');
const debugChevron = getEl('debug-chevron');

// --- Debug toggle ---
let debugOpen = false;
debugToggle.addEventListener('click', () => {
  debugOpen = !debugOpen;
  debugPanel.classList.toggle('hidden', !debugOpen);
  debugChevron.style.transform = debugOpen ? 'rotate(180deg)' : '';
});

// --- Waveform signal buffer ---
type SignalPoint = { time: number; value: number };
const signalBuffer: SignalPoint[] = [];
const SIGNAL_WINDOW_MS = 10_000;

function pushSignalPoint(value: number) {
  const now = performance.now();
  signalBuffer.push({ time: now, value });
  // Trim old samples
  while (signalBuffer.length > 1 && now - signalBuffer[0].time > SIGNAL_WINDOW_MS) {
    signalBuffer.shift();
  }
}

// --- Canvas oscilloscope ---
function drawWaveform() {
  const ctx = waveCanvas.getContext('2d');
  if (!ctx) return;

  const width = waveCanvas.width;
  const height = waveCanvas.height;

  ctx.clearRect(0, 0, width, height);

  // Centre grid line
  ctx.strokeStyle = '#1e293b'; // slate-800
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  if (signalBuffer.length < 2) return;

  const firstTime = signalBuffer[0].time;
  const lastTime  = signalBuffer[signalBuffer.length - 1].time;
  const spanMs    = Math.max(1, lastTime - firstTime);

  const values = signalBuffer.map((s) => s.value);
  const min    = Math.min(...values);
  const max    = Math.max(...values);
  const range  = max - min || 1;

  const valueToY = (v: number) => {
    const norm = (v - min) / range;
    return height - (norm * height * 0.8 + height * 0.1);
  };

  // Axis labels
  ctx.save();
  ctx.fillStyle = '#64748b'; // slate-500
  ctx.font = '9px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const mid = min + range / 2;
  ctx.fillText(max.toFixed(3), 4, valueToY(max));
  ctx.fillText(mid.toFixed(3), 4, valueToY(mid));
  ctx.fillText(min.toFixed(3), 4, valueToY(min));

  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`last ${(spanMs / 1000).toFixed(1)} s`, width - 4, height - 2);
  ctx.restore();

  // Signal line (emerald)
  ctx.beginPath();
  ctx.strokeStyle = '#10b981'; // emerald-500
  ctx.lineWidth = 2;
  for (let i = 0; i < signalBuffer.length; i++) {
    const x = ((signalBuffer[i].time - firstTime) / spanMs) * width;
    const y = valueToY(signalBuffer[i].value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// --- Status badge helpers ---
type BadgeStyle = 'running' | 'calibrating' | 'warning' | 'idle';

function setStatusBadge(text: string, style: BadgeStyle) {
  statusBadge.textContent = text;
  statusBadge.className = [
    'text-xs px-4 py-1.5 rounded-full font-semibold shadow-lg flex items-center gap-2',
    style === 'running'     ? 'bg-emerald-600/90 text-white' :
    style === 'calibrating' ? 'bg-indigo-600/90 text-white' :
    style === 'warning'     ? 'bg-amber-500/90 text-white animate-pulse' :
                              'bg-slate-700/90 text-slate-200',
  ].join(' ');
}

// --- State ---
let running = false;
let emaBpm: number | null = null;
const emaAlpha = 0.2;
let rafId: number | null = null;
let sampleCount = 0;
const CALIBRATION_SAMPLES = 150; // ~5s at 30fps

// --- Main start/stop ---
startBtn.addEventListener('click', async () => {
  if (running) {
    // Stop not wired up for simplicity — reload to stop
    window.location.reload();
    return;
  }
  await startDemo();
});

async function startDemo() {
  running = true;
  startBtnLabel.textContent = 'Stop';

  // Switch start button to red/stop style
  startBtn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-wider transition-colors';

  idleOverlay.classList.add('hidden');
  statusBadgeWrap.classList.remove('hidden');
  qualityBadgeWrap.classList.remove('hidden');
  setStatusBadge('Requesting camera...', 'warning');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
  } catch {
    setStatusBadge('Camera access denied', 'warning');
    return;
  }

  const track = (video.srcObject as MediaStream).getVideoTracks()[0];
  const settings = track?.getSettings?.() ?? {};
  const trackFps = typeof settings.frameRate === 'number' ? settings.frameRate : null;

  setStatusBadge('Initializing...', 'calibrating');

  let lastStats = { intensity: 0, skinRatio: 0, fps: trackFps, r: 0, g: 0, b: 0, clipRatio: 0, motion: 0 };

  const { proc, source } = await initDemo(video, {
    sampleRate: trackFps ?? 30,
    windowSec: 8,
    roiSmoothingAlpha: 0.15,
    useSkinMask: true,
    skinRatioSmoothingAlpha: 0.22,
    onStats: (s) => {
      lastStats = s;
      sampleCount++;
      // Feed intensity into waveform buffer
      pushSignalPoint(s.intensity);
    },
  });

  // ROI source label
  const usingFace = source instanceof MediaPipeFaceFrameSource;
  roiBadge.textContent = `ROI: ${usingFace ? 'Face' : 'Center'}`;

  // Backend label
  const backendAvailable = (window as any).__rppg_demo?.backendAvailable;
  const backendLabel = backendAvailable ? 'WASM' : 'JS';
  backendBadge.textContent = backendLabel;
  backendBadge.className = backendAvailable
    ? 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-300 border border-emerald-700/50'
    : 'text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700';

  setStatusBadge('Calibrating... Hold still', 'calibrating');

  // --- Animation loop ---
  function renderLoop() {
    drawWaveform();
    rafId = requestAnimationFrame(renderLoop);
  }
  rafId = requestAnimationFrame(renderLoop);

  // --- Metrics polling ---
  setInterval(() => {
    const metrics = proc.getMetrics();
    const rawBpm = metrics.bpm ?? null;

    // Smoothed BPM (EMA)
    if (rawBpm) {
      emaBpm = emaBpm === null ? rawBpm : emaBpm + (rawBpm - emaBpm) * emaAlpha;
    }

    const smoothed = emaBpm ? Math.round(emaBpm) : null;
    const signalQuality = metrics.signal_quality ?? 0;
    const confidence = metrics.confidence ?? 0;
    const snr = metrics.snr as any;

    // --- Big BPM display ---
    bpmMainEl.textContent = smoothed !== null ? String(smoothed) : '--';
    bpmEl.textContent     = smoothed !== null ? String(smoothed) : '--';
    bpmRawEl.textContent  = rawBpm ? rawBpm.toFixed(1) : '--';
    confEl.textContent    = confidence.toFixed(2);
    signalEl.textContent  = signalQuality.toFixed(2);

    // Heart animation
    if (smoothed !== null) {
      heartIcon.classList.remove('heart-idle');
      heartIcon.classList.add('heart-pulse');
    } else {
      heartIcon.classList.add('heart-idle');
      heartIcon.classList.remove('heart-pulse');
    }

    // Signal quality badge
    signalQualityBadge.textContent = `${Math.round(signalQuality * 100)}%`;

    // Badges
    fpsBadge.textContent  = lastStats.fps ? `FPS: ${lastStats.fps.toFixed(0)}` : 'FPS: --';
    snrBadge.textContent  = Number.isFinite(snr) ? `SNR: ${Number(snr).toFixed(1)}` : 'SNR: --';

    // Debug
    intensityEl.textContent = Number.isFinite(lastStats.intensity) ? lastStats.intensity.toFixed(4) : '--';
    skinEl.textContent      = Number.isFinite(lastStats.skinRatio) ? `${(lastStats.skinRatio * 100).toFixed(0)}%` : '--';
    motionEl.textContent    = Number.isFinite(lastStats.motion) ? lastStats.motion.toFixed(3) : '--';
    clippingEl.textContent  = Number.isFinite(lastStats.clipRatio) ? `${(lastStats.clipRatio * 100).toFixed(1)}%` : '--';

    // Reason codes
    const reasons = metrics.reason_codes && metrics.reason_codes.length > 0 ? metrics.reason_codes : null;
    if (reasons) {
      reasonWrap.classList.remove('hidden');
      reasonsEl.textContent = reasons.join(', ');
    } else {
      reasonWrap.classList.add('hidden');
    }

    // Status badge logic
    if (sampleCount < CALIBRATION_SAMPLES) {
      const pct = Math.round((sampleCount / CALIBRATION_SAMPLES) * 100);
      setStatusBadge(`Calibrating... ${pct}%`, 'calibrating');
    } else if (smoothed !== null && confidence > 0.4) {
      setStatusBadge('Active', 'running');
    } else if (signalQuality < 0.3) {
      setStatusBadge('Poor signal — face camera', 'warning');
    } else {
      setStatusBadge('Acquiring signal...', 'calibrating');
    }
  }, 1000);
}
