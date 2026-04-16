import { startTransition, useEffect, useRef, useState, useDeferredValue } from 'react';
import {
  createMusePpgSession,
  type PpgSession,
  type PpgSessionDiagnostics,
} from '@elata-biosciences/ppg-web';

function formatNumber(value: number | null | undefined, digits = 0, suffix = ''): string {
  if (value == null || Number.isNaN(value)) {
    return '--';
  }

  return `${value.toFixed(digits)}${suffix}`;
}

function drawWaveform(
  canvas: HTMLCanvasElement,
  trace: ReturnType<PpgSession['getTraceSnapshot']>,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(141, 182, 197, 0.22)';
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();

  if (trace.points.length < 2) return;

  const values = trace.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  ctx.strokeStyle = '#5eead4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  trace.points.forEach((point, index) => {
    const x = (index / (trace.points.length - 1)) * canvas.width;
    const y =
      canvas.height -
      ((point.value - min) / range) * canvas.height * 0.78 -
      canvas.height * 0.11;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function getStatusMessage(diagnostics: PpgSessionDiagnostics | null): string {
  if (!diagnostics) {
    return 'Ready to connect to Muse.';
  }

  if (diagnostics.transportStatus?.reason) {
    return diagnostics.transportStatus.reason;
  }

  if (diagnostics.issues.includes('insufficient_window')) {
    return 'Collecting enough pulse samples for BPM and HRV.';
  }

  if (diagnostics.issues.includes('low_signal_quality')) {
    return 'Signal is present, but quality is still low.';
  }

  if (diagnostics.metrics.bpm != null) {
    return 'Streaming Muse PPG and updating HRV metrics.';
  }

  return 'Connected. Waiting for stable PPG.';
}

export default function App() {
  const sessionRef = useRef<PpgSession | null>(null);
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const [diagnostics, setDiagnostics] = useState<PpgSessionDiagnostics | null>(null);
  const [status, setStatus] = useState('Ready to connect to Muse.');
  const [busy, setBusy] = useState(false);
  const deferredDiagnostics = useDeferredValue(diagnostics);

  useEffect(() => {
    let rafId = 0;

    const render = () => {
      const canvas = waveformRef.current;
      const session = sessionRef.current;
      if (canvas && session) {
        drawWaveform(canvas, session.getTraceSnapshot(280));
      }
      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        void sessionRef.current.dispose();
        sessionRef.current = null;
      }
    };
  }, []);

  async function handleConnect() {
    if (busy) return;

    if (!('bluetooth' in navigator)) {
      setStatus('Web Bluetooth is unavailable in this browser.');
      return;
    }

    setBusy(true);
    setStatus('Requesting Muse device...');

    try {
      if (sessionRef.current) {
        await sessionRef.current.dispose();
        sessionRef.current = null;
      }

      const session = await createMusePpgSession({
        windowSec: 16,
        onDiagnostics: (next) => {
          startTransition(() => {
            setDiagnostics(next);
            setStatus(getStatusMessage(next));
          });
        },
        onStatus: (transportStatus) => {
          setStatus(
            transportStatus.reason
              ? `${transportStatus.state}: ${transportStatus.reason}`
              : transportStatus.state,
          );
        },
      });

      sessionRef.current = session;
      const next = session.getDiagnostics();
      setDiagnostics(next);
      setStatus(getStatusMessage(next));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to connect to Muse.');
    } finally {
      setBusy(false);
    }
  }

  const metrics = deferredDiagnostics?.metrics ?? null;
  const live = metrics?.bpm != null;

  return (
    <div className="app">
      <section className="hero">
        <span className="eyebrow">Elata PPG Starter</span>
        <h1>Muse PPG and HRV in one React starter.</h1>
        <p>
          This template connects over Web Bluetooth, starts <code>createMusePpgSession()</code>,
          selects the best available PPG channel automatically, and renders BPM, RMSSD,
          SDNN, and the live waveform for fast developer iteration.
        </p>
        <div className="toolbar">
          <button type="button" onClick={() => void handleConnect()} disabled={busy}>
            {busy ? 'Connecting...' : sessionRef.current ? 'Reconnect Muse' : 'Connect Muse'}
          </button>
          <div className="status-pill">
            <span className={`status-dot${live ? ' live' : ''}`} aria-hidden="true" />
            <span>{status}</span>
          </div>
        </div>
      </section>

      <div className="grid">
        <div className="stack">
          <section className="panel pad metrics" aria-label="Metrics">
            <article className="metric-card">
              <div className="metric-label">BPM</div>
              <div className="metric-value">{formatNumber(metrics?.bpm, 0)}</div>
              <div className="metric-sub">
                Confidence {formatNumber((metrics?.confidence ?? null) != null ? (metrics?.confidence ?? 0) * 100 : null, 0, '%')}
              </div>
            </article>
            <article className="metric-card">
              <div className="metric-label">RMSSD</div>
              <div className="metric-value">{formatNumber(metrics?.rmssdMs, 0, ' ms')}</div>
              <div className="metric-sub">
                SDNN {formatNumber(metrics?.sdnnMs, 0, ' ms')}
              </div>
            </article>
            <article className="metric-card">
              <div className="metric-label">Signal</div>
              <div className="metric-value">
                {formatNumber(
                  (metrics?.signalQuality ?? null) != null ? (metrics?.signalQuality ?? 0) * 100 : null,
                  0,
                  '%',
                )}
              </div>
              <div className="metric-sub">
                {metrics?.source ?? '--'} / {metrics?.channel ?? '--'}
              </div>
            </article>
          </section>

          <section className="panel wave-panel">
            <div className="wave-header">
              <div>
                <h2>Live PPG trace</h2>
                <p>Selected channel waveform from the current processing window.</p>
              </div>
              <p>
                Window {formatNumber(metrics?.windowDurationMs, 0, ' ms')} / Sample rate{' '}
                {formatNumber(metrics?.sampleRateHz, 0, ' Hz')}
              </p>
            </div>
            <canvas ref={waveformRef} className="wave-canvas" width={880} height={320} />
          </section>
        </div>

        <div className="stack">
          <section className="panel pad meta-grid" aria-label="Diagnostics">
            <article className="meta-card">
              <strong>Transport</strong>
              <span>{deferredDiagnostics?.transportStatus?.state ?? '--'}</span>
            </article>
            <article className="meta-card">
              <strong>Reason Codes</strong>
              <span>
                {metrics?.reasonCodes?.length ? metrics.reasonCodes.join(', ') : 'none'}
              </span>
            </article>
            <article className="meta-card">
              <strong>Respiration</strong>
              <span>{formatNumber(metrics?.respirationBpm, 1, ' bpm')}</span>
            </article>
            <article className="meta-card">
              <strong>SNR</strong>
              <span>{formatNumber(metrics?.snrDb, 1, ' dB')}</span>
            </article>
            <article className="meta-card">
              <strong>Window Samples</strong>
              <span>{formatNumber(metrics?.windowSampleCount, 0)}</span>
            </article>
            <article className="meta-card">
              <strong>Sample Age</strong>
              <span>{formatNumber(deferredDiagnostics?.lastSampleAgeMs, 0, ' ms')}</span>
            </article>
          </section>

          <section className="panel pad tips">
            <h2>Capture tips</h2>
            <p>
              The starter keeps the BLE and DSP wiring high-level on purpose. It is built to be
              the shortest path from a Muse device to inspectable HRV metrics.
            </p>
            <ul>
              <li>
                <strong>Keep the band stable.</strong>
                Motion still affects channel selection and HRV confidence more than BPM.
              </li>
              <li>
                <strong>Prefer Athena optics when available.</strong>
                Those packets already carry device timestamps through the decoder path.
              </li>
              <li>
                <strong>Watch reason codes.</strong>
                They surface when the window is still warming up, signal quality is low, or the
                pulse estimators disagree.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
