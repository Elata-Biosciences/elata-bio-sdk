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

function calmnessColor(state: string): string {
  if (state === 'high' || state === 'very calm' || state === 'calm') return 'var(--good)';
  if (state === 'low' || state === 'alert') return 'var(--bad)';
  return 'var(--warn)';
}

function calmnessGradient(state: string): string {
  if (state === 'high' || state === 'very calm' || state === 'calm')
    return 'linear-gradient(90deg, #059669, #34d399)';
  if (state === 'low' || state === 'alert')
    return 'linear-gradient(90deg, #e11d48, #f43f5e)';
  return 'linear-gradient(90deg, #d97706, #fbbf24)';
}

function getStatusTone(
  wasmReady: boolean,
  mode: Mode,
  deviceName: string | null,
  status: string,
): 'live' | 'warn' | 'error' {
  const lower = status.toLowerCase();
  if (lower.includes('failed') || lower.includes('unavailable') || lower.includes('error'))
    return 'error';
  if (!wasmReady) return 'warn';
  if (mode === 'headband' && !deviceName) return 'warn';
  return 'live';
}

// ── ModeToggle ─────────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const isHeadband = mode === 'headband';
  return (
    <div className="mode-toggle">
      <span className={`mode-toggle-label${isHeadband ? '' : ' mode-toggle-label--active'}`}>
        Synthetic
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isHeadband}
        className={`mode-toggle-btn${isHeadband ? ' mode-toggle-btn--on' : ''}`}
        onClick={() => onChange(isHeadband ? 'synthetic' : 'headband')}
      >
        <span className="mode-toggle-thumb" />
      </button>
      <span className={`mode-toggle-label${isHeadband ? ' mode-toggle-label--active' : ''}`}>
        Headband (BLE)
      </span>
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
      if (!canvas) return;
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
        ctx.strokeStyle = active ? '#22d3ee' : '#475569';
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#22d3ee';
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

  return <canvas ref={canvasRef} className="waveform-canvas" />;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [mode, setMode] = useState<Mode>('synthetic');
  const [status, setStatus] = useState('Initializing WASM…');
  const [powers, setPowers] = useState<BandPowers | null>(null);
  const [calmness, setCalmness] = useState<Calmness | null>(null);
  const [alphaBump, setAlphaBump] = useState<AlphaBump | null>(null);
  const [alphaPeak, setAlphaPeak] = useState<AlphaPeak | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [wasmReady, setWasmReady] = useState(false);

  const deviceRef    = useRef<MuseBleDevice | null>(null);
  const rollingBuf   = useRef<number[]>([]);
  const waveformBuf  = useRef<number[]>([]);
  const synthPhase   = useRef(0);
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

    intervalRef.current = setInterval(() => processWindow(makeSyntheticWindow()), 1000);

    return () => {
      if (intervalRef.current)  { clearInterval(intervalRef.current);  intervalRef.current  = null; }
      if (synthFastRef.current) { clearInterval(synthFastRef.current); synthFastRef.current = null; }
    };
  }, [wasmReady, mode]);

  useEffect(() => {
    if (mode === 'headband') {
      // Return a cleanup so teardown fires during the cleanup phase (before
      // the synthetic effect re-runs), not after it — which would kill the
      // freshly created synthetic intervals.
      return () => { void teardownHeadband(); };
    }
  }, [mode]);

  function switchMode(next: Mode) {
    setPowers(null); setCalmness(null); setAlphaBump(null); setAlphaPeak(null);
    waveformBuf.current = [];
    resetModels();
    setStatus(next === 'synthetic' ? 'Switching to synthetic…' : 'Ready to connect.');
    setMode(next);
  }

  async function connectHeadband() {
    await teardownHeadband();
    setPowers(null); setCalmness(null); setAlphaBump(null); setAlphaPeak(null);
    setSampleCount(0);
    waveformBuf.current = [];
    resetModels();
    try {
      setStatus('Requesting Bluetooth device…');
      const device = new MuseBleDevice();
      deviceRef.current = device;
      await device.prepareSession();
      const info = device.getBoardInfo();
      setDeviceName(info.device_name);
      setStatus(`Connected to ${info.device_name}. Streaming…`);
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

  // ── Derived display values ──────────────────────────────────────────────────

  const statusTone = getStatusTone(wasmReady, mode, deviceName, status);
  const statusDotClass =
    statusTone === 'error' ? 'status-dot error' : statusTone === 'warn' ? 'status-dot warn' : 'status-dot';
  const calmnessPct = calmness ? Math.round(calmness.score * 100) : null;
  const bandMax = powers
    ? Math.max(powers.delta, powers.theta, powers.alpha, powers.beta, powers.gamma) || 1
    : 1;

  const bands: { label: string; range: string; key: keyof BandPowers; cls: string }[] = [
    { label: 'Delta', range: '0.5–4 Hz',  key: 'delta', cls: 'meter-fill--delta' },
    { label: 'Theta', range: '4–8 Hz',    key: 'theta', cls: 'meter-fill--theta' },
    { label: 'Alpha', range: '8–13 Hz',   key: 'alpha', cls: 'meter-fill--alpha' },
    { label: 'Beta',  range: '13–30 Hz',  key: 'beta',  cls: 'meter-fill--beta'  },
    { label: 'Gamma', range: '30–100 Hz', key: 'gamma', cls: 'meter-fill--gamma' },
  ];

  return (
    <div className="app">
      <header className="topbar" aria-label="Application header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Elata</span>
        </div>
        <span className="topbar-sep" aria-hidden="true" />
        <span className="topbar-tagline">Brain wave analysis</span>
        <div className="topbar-spacer" />
        <div className={`session-chip session-chip--${statusTone}`}>
          <span className={statusDotClass} aria-hidden="true" />
          <span className="session-chip-text">{status}</span>
        </div>
      </header>

      <div className="mode-bar">
        <ModeToggle mode={mode} onChange={switchMode} />
        {mode === 'headband' && (
          <div className="connect-group">
            <button type="button" className="connect-btn" onClick={connectHeadband}>
              Connect Muse
            </button>
            {deviceName && (
              <span className="connect-device">{deviceName}</span>
            )}
            {sampleCount > 0 && (
              <span className="connect-samples">{sampleCount.toLocaleString()} samples</span>
            )}
          </div>
        )}
      </div>

      <main className="main">
        <section className="stage" aria-labelledby="stage-heading">
          <h1 id="stage-heading" className="visually-hidden">
            Live EEG readout and brain state
          </h1>

          {/* Left: waveform */}
          <div className="stage-video-wrap">
            <div className="waveform-chrome">
              <div className="video-chrome-corners" aria-hidden="true" />
              <WaveformGraph bufRef={waveformBuf} active={wasmReady} />
              <div className="video-label">
                <span className="video-label-dot" aria-hidden="true" />
                {mode === 'headband' ? 'TP9 · 256 Hz' : 'Synthetic · 256 Hz'}
              </div>
            </div>
            <p className="stage-hint">
              3-second rolling EEG window — alpha (8–13 Hz) dominance indicates a relaxed state.
            </p>
          </div>

          {/* Right: metrics */}
          <aside className="readouts" aria-label="Brain state metrics">

            {/* Calmness hero */}
            <div className="bpm-block">
              <p className="bpm-label">Calmness</p>
              <div className="bpm-value-row">
                <span className="bpm-number">{calmnessPct ?? '—'}</span>
                <span className="bpm-unit">%</span>
              </div>
              {calmness && (
                <div className="calm-scale">
                  <div className="meter-track">
                    <div
                      className="meter-fill"
                      style={{
                        width: `${calmnessPct}%`,
                        background: calmnessGradient(calmness.state),
                      }}
                    />
                  </div>
                  <div className="calm-scale-labels">
                    <span className="calm-label-alert">Alert</span>
                    <span className="calm-label-calm">Calm</span>
                  </div>
                </div>
              )}
              <p className="bpm-sub" style={{ color: calmness ? calmnessColor(calmness.state) : 'var(--muted)' }}>
                {calmness ? calmness.state : 'Warming up'}
              </p>
            </div>

            {/* Band powers */}
            {powers && (
              <div className="meter-group">
                {bands.map(({ label, range, key, cls }) => (
                  <div key={key} className="meter">
                    <div className="meter-head">
                      <span>
                        {label} <span className="band-range">{range}</span>
                      </span>
                      <span className="meter-pct">{powers[key].toFixed(3)}</span>
                    </div>
                    <div className="meter-track" role="presentation">
                      <div
                        className={`meter-fill ${cls}`}
                        style={{ width: `${(powers[key] / bandMax) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Alpha bump state chips */}
            {alphaBump && (
              <ul className="chip-row" aria-label="Alpha state">
                <li className="chip">
                  <span className="chip-key">Alpha State</span>
                  <span className="chip-val">{alphaBump.state}</span>
                </li>
                <li className="chip">
                  <span className="chip-key">Alpha Power</span>
                  <span className="chip-val">{alphaBump.alphaPower.toFixed(4)}</span>
                </li>
                <li className="chip">
                  <span className="chip-key">Baseline</span>
                  <span className="chip-val">{alphaBump.baseline.toFixed(4)}</span>
                </li>
              </ul>
            )}
          </aside>
        </section>

        <p className="deck">
          Built with <code>@elata-biosciences/eeg-web</code> — WASM EEG analysis, Muse BLE
          streaming, and a layout suited for demos and screen recordings.
        </p>

        {alphaPeak && (
          <details className="panel-disclosure">
            <summary>Alpha peak analysis</summary>
            <div className="panel-inner">
              <div className="stats-grid">
                <div className="stat-row">
                  <span className="stat-key">Peak Frequency</span>
                  <span className="stat-value">{fmt(alphaPeak.peakFrequency, 2)} Hz</span>
                </div>
                <div className="stat-row">
                  <span className="stat-key">Smoothed Peak</span>
                  <span className="stat-value">{fmt(alphaPeak.smoothedPeak, 2)} Hz</span>
                </div>
                <div className="stat-row">
                  <span className="stat-key">Long-Term Peak</span>
                  <span className="stat-value">{fmt(alphaPeak.longTermPeak, 2)} Hz</span>
                </div>
                <div className="stat-row">
                  <span className="stat-key">SNR</span>
                  <span className="stat-value">{fmt(alphaPeak.snr, 3)}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-key">Peak Power</span>
                  <span className="stat-value">{fmt(alphaPeak.peakPower, 4)}</span>
                </div>
                {calmness && (
                  <div className="stat-row">
                    <span className="stat-key">Alpha / Beta Ratio</span>
                    <span className="stat-value">{fmt(calmness.alphaBetaRatio, 2)}</span>
                  </div>
                )}
              </div>
            </div>
          </details>
        )}
      </main>

      <footer className="footer">
        <span>Elata SDK · EEG web template</span>
      </footer>
    </div>
  );
}
