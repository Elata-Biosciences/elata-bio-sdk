import { useState, useEffect, useRef, useCallback } from 'react';
import {
  initEegWasm,
  band_powers,
  WasmCalmnessModel,
  WasmAlphaBumpDetector,
  WasmAlphaPeakModel,
} from '@elata-biosciences/eeg-web';
import { MuseBleDevice } from '@elata-biosciences/eeg-web-ble';

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'synthetic' | 'headband';
type BandPowers = { delta: number; theta: number; alpha: number; beta: number; gamma: number };
type Calmness = { score: number; state: string; alphaBetaRatio: number };
type AlphaBump = { state: string; alphaPower: number; baseline: number };
type AlphaPeak = {
  peakFrequency: number;
  smoothedPeak: number;
  longTermPeak: number;
  snr: number;
  peakPower: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 256;
const WINDOW_SAMPLES = SAMPLE_RATE * 4;
const WAVEFORM_DISPLAY = SAMPLE_RATE * 3; // 3s of samples shown in graph
const SYNTH_TICK_MS = 32;                 // ~30 fps for synthetic animation

// Design tokens (TradeLock dark theme)
const C = {
  bg:          '#0f172a',
  surface:     'rgba(30,41,59,0.6)',
  surfaceHigh: 'rgba(30,41,59,0.9)',
  border:      'rgba(51,65,85,0.5)',
  borderFocus: 'rgba(51,65,85,0.8)',
  track:       '#1e293b',
  text:        '#f1f5f9',
  muted:       '#94a3b8',
  faint:       '#475569',
  emerald:     '#10b981',
  emeraldDim:  'rgba(16,185,129,0.15)',
  rose:        '#f43f5e',
  roseDim:     'rgba(244,63,94,0.15)',
  amber:       '#f59e0b',
  amberDim:    'rgba(245,158,11,0.15)',
  cyan:        '#22d3ee',
  cyanDim:     'rgba(34,211,238,0.12)',
  indigo:      '#818cf8',
  indigoDim:   'rgba(129,140,248,0.12)',
  blue:        '#60a5fa',
} as const;

// ── EEG processing ────────────────────────────────────────────────────────────

function makeSyntheticWindow(): Float32Array {
  const s = new Float32Array(WINDOW_SAMPLES);
  for (let i = 0; i < WINDOW_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    s[i] =
      Math.sin(2 * Math.PI * 2 * t) * 0.2 +
      Math.sin(2 * Math.PI * 6 * t) * 0.3 +
      Math.sin(2 * Math.PI * 10 * t) * 0.8 +
      Math.sin(2 * Math.PI * 20 * t) * 0.4 +
      Math.sin(2 * Math.PI * 40 * t) * 0.1;
  }
  return s;
}

function computePowers(samples: Float32Array): BandPowers {
  const r = band_powers(samples, SAMPLE_RATE);
  const p = { delta: r.delta, theta: r.theta, alpha: r.alpha, beta: r.beta, gamma: r.gamma };
  r.free();
  return p;
}

function runCalmness(model: WasmCalmnessModel, samples: Float32Array): Calmness | null {
  const r = model.process(samples);
  if (!r) return null;
  const c = { score: r.smoothed_score, state: r.state_description(), alphaBetaRatio: r.alpha_beta_ratio };
  r.free();
  return c;
}

function runAlphaBump(model: WasmAlphaBumpDetector, samples: Float32Array): AlphaBump | null {
  const r = model.process(samples);
  if (!r) return null;
  const b = { state: r.state, alphaPower: r.alpha_power, baseline: r.baseline };
  r.free();
  return b;
}

function runAlphaPeak(model: WasmAlphaPeakModel, samples: Float32Array): AlphaPeak | null {
  const r = model.process(samples);
  if (!r) return null;
  const p = {
    peakFrequency: r.peak_frequency,
    smoothedPeak: r.smoothed_peak_frequency,
    longTermPeak: r.long_term_peak_frequency,
    snr: r.snr,
    peakPower: r.peak_power,
  };
  r.free();
  return p;
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals);
}

function stateColor(state: string): string {
  if (state === 'high' || state === 'very calm' || state === 'calm') return C.emerald;
  if (state === 'low' || state === 'alert') return C.rose;
  if (state === 'transitioning' || state === 'neutral') return C.amber;
  return C.muted;
}

function stateBg(state: string): string {
  if (state === 'high' || state === 'very calm' || state === 'calm') return C.emeraldDim;
  if (state === 'low' || state === 'alert') return C.roseDim;
  if (state === 'transitioning' || state === 'neutral') return C.amberDim;
  return 'transparent';
}

// ── Design primitives ─────────────────────────────────────────────────────────

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${accent ? `${accent}30` : C.border}`,
        borderRadius: 16,
        padding: '16px 18px',
        backdropFilter: 'blur(8px)',
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: C.faint,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const color = stateColor(state);
  const bg = stateBg(state);
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'capitalize',
        color,
        background: bg,
        border: `1px solid ${color}40`,
        borderRadius: 999,
        padding: '2px 10px',
      }}
    >
      {state}
    </span>
  );
}

function MetricRow({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 8,
        gap: 8,
      }}
    >
      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: accent ?? C.text, fontVariantNumeric: 'tabular-nums' }}>
        {value}
        {unit && <span style={{ fontSize: 11, fontWeight: 400, color: C.faint, marginLeft: 3 }}>{unit}</span>}
      </span>
    </div>
  );
}

function ProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ background: C.track, borderRadius: 999, height: 6, overflow: 'hidden' }}>
      <div
        style={{
          background: color,
          height: '100%',
          width: `${pct}%`,
          borderRadius: 999,
          transition: 'width 0.5s ease',
          boxShadow: `0 0 6px ${color}60`,
        }}
      />
    </div>
  );
}

// ── Waveform graph ────────────────────────────────────────────────────────────

function WaveformGraph({
  bufRef,
  active,
}: {
  bufRef: React.MutableRefObject<number[]>;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // DPR-aware sizing
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const ctx = canvas.getContext('2d')!;

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const samples = bufRef.current.slice(-WAVEFORM_DISPLAY);
      const n = samples.length;

      // Subtle centre line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(51,65,85,0.5)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (n >= 2) {
        // Auto-scale Y with padding
        let min = Infinity, max = -Infinity;
        for (const v of samples) { if (v < min) min = v; if (v > max) max = v; }
        const pad = (max - min) * 0.15 || 0.1;
        const lo = min - pad, hi = max + pad, range = hi - lo;

        const toY = (v: number) => h - ((v - lo) / range) * h;

        // Filled area under the line
        ctx.beginPath();
        ctx.moveTo(0, toY(samples[0]));
        for (let i = 1; i < n; i++) {
          ctx.lineTo((i / (n - 1)) * w, toY(samples[i]));
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(34,211,238,0.18)');
        grad.addColorStop(1, 'rgba(34,211,238,0)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.strokeStyle = active ? C.cyan : C.faint;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.shadowColor = C.cyan;
        ctx.shadowBlur = active ? 8 : 0;
        ctx.moveTo(0, toY(samples[0]));
        for (let i = 1; i < n; i++) {
          ctx.lineTo((i / (n - 1)) * w, toY(samples[i]));
        }
        ctx.stroke();
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100%',
        height: 100,
        borderRadius: 8,
      }}
    />
  );
}

function WaveformCard({
  bufRef,
  active,
  mode,
}: {
  bufRef: React.MutableRefObject<number[]>;
  active: boolean;
  mode: Mode;
}) {
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <SectionLabel>Live EEG Signal</SectionLabel>
        <span style={{ fontSize: 10, color: C.faint }}>
          {mode === 'headband' ? 'TP9 channel · 256 Hz' : 'synthetic · 256 Hz'}
        </span>
      </div>
      <WaveformGraph bufRef={bufRef} active={active} />
    </Card>
  );
}

// ── Section components ────────────────────────────────────────────────────────

function AlphaBumpDisplay({ bump }: { bump: AlphaBump }) {
  const color = stateColor(bump.state);
  const bg = stateBg(bump.state);
  return (
    <Card accent={color}>
      <SectionLabel>Alpha Bump Detection</SectionLabel>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          padding: '10px 14px',
          background: bg,
          border: `1px solid ${color}30`,
          borderRadius: 10,
        }}
      >
        <span style={{ fontSize: 11, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Alpha State
        </span>
        <StateBadge state={bump.state} />
      </div>
      <MetricRow label="Alpha Power" value={fmt(bump.alphaPower, 4)} />
      <MetricRow label="Baseline" value={fmt(bump.baseline, 4)} />
    </Card>
  );
}

function CalmnessDisplay({ calmness }: { calmness: Calmness }) {
  const pct = Math.round(calmness.score * 100);
  const color = stateColor(calmness.state);
  return (
    <Card accent={color}>
      <SectionLabel>Calmness Model</SectionLabel>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {pct}
          <span style={{ fontSize: 18, fontWeight: 600, marginLeft: 2 }}>%</span>
        </div>
        <StateBadge state={calmness.state} />
      </div>

      {/* Alert ←→ Calm scale */}
      <div style={{ marginBottom: 14 }}>
        <ProgressBar value={pct} max={100} color={color} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
          <span style={{ fontSize: 10, color: C.rose, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Alert</span>
          <span style={{ fontSize: 10, color: C.emerald, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Calm</span>
        </div>
      </div>

      <MetricRow label="Calmness Score" value={fmt(calmness.score, 3)} />
      <MetricRow label="Alpha / Beta Ratio" value={fmt(calmness.alphaBetaRatio, 2)} />
    </Card>
  );
}

function AlphaPeakDisplay({ peak }: { peak: AlphaPeak }) {
  return (
    <Card accent={C.cyan}>
      <SectionLabel>Alpha Peak Model</SectionLabel>
      <MetricRow label="Peak Frequency"  value={fmt(peak.peakFrequency, 2)}  unit="Hz" accent={C.cyan} />
      <MetricRow label="Smoothed Peak"   value={fmt(peak.smoothedPeak, 2)}   unit="Hz" />
      <MetricRow label="Long-Term Peak"  value={fmt(peak.longTermPeak, 2)}   unit="Hz" />
      <MetricRow label="SNR"             value={fmt(peak.snr, 3)} />
      <MetricRow label="Peak Power"      value={fmt(peak.peakPower, 4)} />
    </Card>
  );
}

function BandPowersDisplay({ powers, mode }: { powers: BandPowers; mode: Mode }) {
  const max = Math.max(powers.delta, powers.theta, powers.alpha, powers.beta, powers.gamma) || 1;
  const bands: { label: string; key: keyof BandPowers; color: string }[] = [
    { label: 'Delta  0.5–4 Hz',  key: 'delta',  color: C.indigo },
    { label: 'Theta  4–8 Hz',    key: 'theta',  color: C.blue },
    { label: 'Alpha  8–13 Hz',   key: 'alpha',  color: C.emerald },
    { label: 'Beta   13–30 Hz',  key: 'beta',   color: C.amber },
    { label: 'Gamma  30–100 Hz', key: 'gamma',  color: C.rose },
  ];
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <SectionLabel>Band Powers</SectionLabel>
        <span style={{ fontSize: 10, color: C.faint, marginBottom: 12 }}>
          {mode === 'headband' ? 'TP9 channel' : 'synthetic signal'}
        </span>
      </div>
      {bands.map(({ label, key, color }) => (
        <div key={key} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
              {powers[key].toFixed(4)}
            </span>
          </div>
          <ProgressBar value={powers[key]} max={max} color={color} />
        </div>
      ))}
    </Card>
  );
}

// ── Mode toggle ───────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const isHeadband = mode === 'headband';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 13, color: isHeadband ? C.faint : C.text, fontWeight: isHeadband ? 400 : 600, transition: 'color 0.2s' }}>
        Synthetic
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isHeadband}
        onClick={() => onChange(isHeadband ? 'synthetic' : 'headband')}
        style={{
          position: 'relative',
          width: 44,
          height: 24,
          borderRadius: 12,
          background: isHeadband ? C.indigo : C.faint,
          border: 'none',
          cursor: 'pointer',
          transition: 'background 0.25s',
          flexShrink: 0,
          padding: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: isHeadband ? 23 : 3,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
            transition: 'left 0.25s',
          }}
        />
      </button>
      <span style={{ fontSize: 13, color: isHeadband ? C.text : C.faint, fontWeight: isHeadband ? 600 : 400, transition: 'color 0.2s' }}>
        Headband (BLE)
      </span>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [mode, setMode] = useState<Mode>('synthetic');
  const [status, setStatus] = useState('Initializing WASM...');
  const [powers, setPowers] = useState<BandPowers | null>(null);
  const [calmness, setCalmness] = useState<Calmness | null>(null);
  const [alphaBump, setAlphaBump] = useState<AlphaBump | null>(null);
  const [alphaPeak, setAlphaPeak] = useState<AlphaPeak | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [wasmReady, setWasmReady] = useState(false);

  const deviceRef    = useRef<MuseBleDevice | null>(null);
  const rollingBuf   = useRef<number[]>([]);
  const waveformBuf  = useRef<number[]>([]);   // raw samples for graph
  const synthPhase   = useRef(0);              // running sample count for synthetic
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const synthFastRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const calmnessRef  = useRef<WasmCalmnessModel | null>(null);
  const alphaBumpRef = useRef<WasmAlphaBumpDetector | null>(null);
  const alphaPeakRef = useRef<WasmAlphaPeakModel | null>(null);

  function clearTick() {
    if (intervalRef.current !== null) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (synthFastRef.current !== null) { clearInterval(synthFastRef.current); synthFastRef.current = null; }
  }

  async function teardownHeadband() {
    clearTick();
    if (deviceRef.current) {
      await deviceRef.current.releaseSession().catch(() => {});
      deviceRef.current = null;
    }
    rollingBuf.current = [];
  }

  // Push samples into the waveform display buffer (capped at WAVEFORM_DISPLAY)
  const pushWaveform = useCallback((samples: number[]) => {
    waveformBuf.current.push(...samples);
    if (waveformBuf.current.length > WAVEFORM_DISPLAY)
      waveformBuf.current = waveformBuf.current.slice(-WAVEFORM_DISPLAY);
  }, []);

  function processWindow(samples: Float32Array) {
    setPowers(computePowers(samples));
    if (calmnessRef.current)  setCalmness(runCalmness(calmnessRef.current, samples));
    if (alphaBumpRef.current) setAlphaBump(runAlphaBump(alphaBumpRef.current, samples));
    if (alphaPeakRef.current) setAlphaPeak(runAlphaPeak(alphaPeakRef.current, samples));
  }

  function resetModels() {
    calmnessRef.current?.reset();
    alphaBumpRef.current?.reset();
    alphaPeakRef.current?.reset();
  }

  useEffect(() => {
    initEegWasm().then(() => {
      calmnessRef.current  = new WasmCalmnessModel(SAMPLE_RATE, 1);
      alphaBumpRef.current = new WasmAlphaBumpDetector(SAMPLE_RATE, 1);
      alphaPeakRef.current = new WasmAlphaPeakModel(SAMPLE_RATE, 1);
      setWasmReady(true);
      setStatus('Ready.');
    });
    return () => {
      calmnessRef.current?.free();  calmnessRef.current  = null;
      alphaBumpRef.current?.free(); alphaBumpRef.current = null;
      alphaPeakRef.current?.free(); alphaPeakRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!wasmReady || mode !== 'synthetic') return;
    setStatus('Running synthetic EEG analysis.');
    setDeviceName(null);
    setSampleCount(0);
    resetModels();
    synthPhase.current = 0;
    waveformBuf.current = [];

    // Fast tick: generate ~8 samples per frame for smooth waveform animation
    const batchSize = Math.round(SAMPLE_RATE * SYNTH_TICK_MS / 1000);
    synthFastRef.current = setInterval(() => {
      const batch: number[] = [];
      for (let i = 0; i < batchSize; i++) {
        const t = synthPhase.current / SAMPLE_RATE;
        batch.push(
          Math.sin(2 * Math.PI * 2  * t) * 0.2 +
          Math.sin(2 * Math.PI * 6  * t) * 0.3 +
          Math.sin(2 * Math.PI * 10 * t) * 0.8 +
          Math.sin(2 * Math.PI * 20 * t) * 0.4 +
          Math.sin(2 * Math.PI * 40 * t) * 0.1
        );
        synthPhase.current++;
      }
      pushWaveform(batch);
    }, SYNTH_TICK_MS);

    // Slow tick: run WASM analysis every second
    intervalRef.current = setInterval(() => processWindow(makeSyntheticWindow()), 1000);

    return () => {
      if (intervalRef.current)  { clearInterval(intervalRef.current);  intervalRef.current  = null; }
      if (synthFastRef.current) { clearInterval(synthFastRef.current); synthFastRef.current = null; }
    };
  }, [wasmReady, mode]);

  useEffect(() => {
    if (mode !== 'headband') void teardownHeadband();
  }, [mode]);

  function switchMode(next: Mode) {
    setPowers(null); setCalmness(null); setAlphaBump(null); setAlphaPeak(null);
    waveformBuf.current = [];
    resetModels();
    setStatus(next === 'synthetic' ? 'Switching to synthetic...' : 'Ready to connect.');
    setMode(next);
  }

  async function connectHeadband() {
    await teardownHeadband();
    setPowers(null); setCalmness(null); setAlphaBump(null); setAlphaPeak(null);
    setSampleCount(0);
    waveformBuf.current = [];
    resetModels();
    try {
      setStatus('Requesting Bluetooth device...');
      const device = new MuseBleDevice();
      deviceRef.current = device;
      await device.prepareSession();
      const info = device.getBoardInfo();
      setDeviceName(info.device_name);
      setStatus(`Connected to ${info.device_name}. Streaming...`);
      await device.startStream((rows) => {
        const batch = rows.map((r) => r[0]);
        for (const v of batch) rollingBuf.current.push(v);
        if (rollingBuf.current.length > WINDOW_SAMPLES)
          rollingBuf.current = rollingBuf.current.slice(-WINDOW_SAMPLES);
        pushWaveform(batch);
        setSampleCount((c) => c + rows.length);
      });
      intervalRef.current = setInterval(() => {
        if (rollingBuf.current.length < SAMPLE_RATE) return;
        processWindow(new Float32Array(rollingBuf.current));
      }, 1000);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to connect.');
    }
  }

  useEffect(() => () => { void teardownHeadband(); }, []);

  return (
    <main
      style={{
        maxWidth: 480,
        margin: '0 auto',
        padding: '2rem 1rem 4rem',
        minHeight: '100vh',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: C.text,
            letterSpacing: '-0.02em',
            marginBottom: 18,
          }}
        >
          Elata EEG Demo
        </h1>
        <ModeToggle mode={mode} onChange={switchMode} />
      </div>

      {/* Status bar */}
      <div
        style={{
          fontSize: 12,
          color: C.muted,
          marginBottom: 20,
          padding: '8px 12px',
          background: C.surface,
          borderRadius: 8,
          border: `1px solid ${C.border}`,
          minHeight: 36,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: wasmReady ? C.emerald : C.amber,
            marginRight: 8,
            flexShrink: 0,
            boxShadow: wasmReady ? `0 0 6px ${C.emerald}` : `0 0 6px ${C.amber}`,
          }}
        />
        {status}
      </div>

      {/* Headband connect */}
      {mode === 'headband' && (
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={connectHeadband}
            style={{
              background: C.indigo,
              color: '#fff',
              border: 'none',
              borderRadius: 999,
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.02em',
              boxShadow: `0 0 12px ${C.indigo}40`,
              transition: 'opacity 0.15s',
            }}
          >
            Connect Muse
          </button>
          {deviceName && (
            <span style={{ fontSize: 12, color: C.emerald, fontWeight: 600 }}>{deviceName}</span>
          )}
          {sampleCount > 0 && (
            <span style={{ fontSize: 12, color: C.muted }}>
              {sampleCount.toLocaleString()} samples
            </span>
          )}
        </div>
      )}

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <WaveformCard bufRef={waveformBuf} active={wasmReady} mode={mode} />
        {alphaBump && <AlphaBumpDisplay bump={alphaBump} />}
        {calmness  && <CalmnessDisplay calmness={calmness} />}
        {alphaPeak && <AlphaPeakDisplay peak={alphaPeak} />}
        {powers    && <BandPowersDisplay powers={powers} mode={mode} />}
      </div>
    </main>
  );
}
