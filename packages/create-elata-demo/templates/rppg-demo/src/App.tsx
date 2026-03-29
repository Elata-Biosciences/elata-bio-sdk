import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createRppgSession,
  type Metrics,
  type RppgSession,
  type RppgSessionDiagnostics,
} from '@elata-biosciences/rppg-web';
import rppgWasmJsUrl from '@elata-biosciences/rppg-web/pkg/rppg_wasm.js?url';
import rppgWasmBinaryUrl from '@elata-biosciences/rppg-web/pkg/rppg_wasm_bg.wasm?url';

const EMPTY_METRICS: Metrics = {
  bpm: null,
  confidence: 0,
  signal_quality: 0,
};

function formatMetric(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }

  return value.toFixed(digits);
}

function formatInteger(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }

  return `${Math.round(value)}`;
}

function formatIssueList(issues: string[] | undefined): string {
  if (!issues || issues.length === 0) {
    return 'none';
  }

  return issues.join(', ');
}

function getStatusMessage(diagnostics: RppgSessionDiagnostics | null): string {
  if (!diagnostics) {
    return 'Starting session…';
  }

  if (diagnostics.lastError) {
    return diagnostics.lastError.message;
  }

  if (diagnostics.backendMode !== 'wasm') {
    return 'WASM backend not active — check bundled asset URLs.';
  }

  if (
    diagnostics.issues.includes('no_samples_yet') ||
    diagnostics.issues.includes('insufficient_window')
  ) {
    return 'Warming up — hold still, face the camera.';
  }

  return 'Estimating pulse from the live feed.';
}

function getStatusTone(diagnostics: RppgSessionDiagnostics | null): 'live' | 'warn' | 'error' {
  if (diagnostics?.lastError) {
    return 'error';
  }

  if (!diagnostics || diagnostics.backendMode !== 'wasm' || !diagnostics.estimationAvailable) {
    return 'warn';
  }

  return 'live';
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<RppgSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState('Requesting camera…');
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS);
  const [diagnostics, setDiagnostics] = useState<RppgSessionDiagnostics | null>(null);

  const syncFromSession = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const nextDiagnostics = session.getDiagnostics();
    setMetrics(session.getMetrics());
    setDiagnostics(nextDiagnostics);
    setStatus(getStatusMessage(nextDiagnostics));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function init() {
      const video = videoRef.current;
      if (!video) return;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch {
        setStatus('Camera unavailable — allow access and reload.');
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      const sampleRate = stream.getVideoTracks()[0]?.getSettings().frameRate ?? 30;
      setStatus('Starting rPPG…');

      try {
        const session = await createRppgSession({
          video,
          sampleRate,
          backend: 'auto',
          faceMesh: 'auto',
          wasmJsUrl: rppgWasmJsUrl,
          wasmBinaryUrl: rppgWasmBinaryUrl,
          enableTracker: { minBpm: 55, maxBpm: 150, numParticles: 200 },
          roiSmoothingAlpha: 0.25,
          useSkinMask: true,
          onDiagnostics: () => {
            syncFromSession();
          },
          onError: (error) => {
            setStatus(error.message);
          },
        });

        if (cancelled) {
          await session.dispose();
          return;
        }

        sessionRef.current = session;
        syncFromSession();
        intervalId = setInterval(syncFromSession, 400);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not start the rPPG session.';
        setStatus(message);
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (sessionRef.current) {
        void sessionRef.current.dispose();
        sessionRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [syncFromSession]);

  const statusTone = getStatusTone(diagnostics);
  const statusDotClass =
    statusTone === 'error' ? 'status-dot error' : statusTone === 'warn' ? 'status-dot warn' : 'status-dot';
  const readinessLabel =
    diagnostics?.estimationAvailable && metrics.bpm != null ? 'Ready' : 'Warm-up';

  const confidencePct = Math.round(clamp01(metrics.confidence) * 100);
  const qualityPct = Math.round(clamp01(metrics.signal_quality) * 100);

  return (
    <div className="app">
      <header className="topbar" aria-label="Application header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Elata</span>
        </div>
        <span className="topbar-sep" aria-hidden="true" />
        <span className="topbar-tagline">Camera-based pulse estimation</span>
        <div className="topbar-spacer" />
        <div className={`session-chip session-chip--${statusTone}`}>
          <span className={statusDotClass} aria-hidden="true" />
          <span className="session-chip-text">{status}</span>
        </div>
      </header>

      <main className="main">
        <section className="stage" aria-labelledby="stage-heading">
          <h1 id="stage-heading" className="visually-hidden">
            Live pulse readout and camera
          </h1>

          <div className="stage-video-wrap">
            <div className="video-chrome">
              <div className="video-chrome-corners" aria-hidden="true" />
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="stage-video"
              />
              <div className="video-label">
                <span className="video-label-dot" aria-hidden="true" />
                Live input
              </div>
            </div>
            <p className="stage-hint">
              Face the light, fill the frame, and stay steady for the first few seconds.
            </p>
          </div>

          <aside className="readouts" aria-label="Pulse metrics">
            <div className="bpm-block">
              <p className="bpm-label">Estimated heart rate</p>
              <div className="bpm-value-row">
                <span className="bpm-number">
                  {metrics.bpm != null ? formatMetric(metrics.bpm, 0) : '—'}
                </span>
                <span className="bpm-unit">BPM</span>
              </div>
              <p className="bpm-sub">{readinessLabel}</p>
            </div>

            <div className="meter-group">
              <div className="meter">
                <div className="meter-head">
                  <span>Confidence</span>
                  <span className="meter-pct">{confidencePct}%</span>
                </div>
                <div className="meter-track" role="presentation">
                  <div
                    className="meter-fill meter-fill--confidence"
                    style={{ width: `${confidencePct}%` }}
                  />
                </div>
              </div>
              <div className="meter">
                <div className="meter-head">
                  <span>Signal quality</span>
                  <span className="meter-pct">{qualityPct}%</span>
                </div>
                <div className="meter-track" role="presentation">
                  <div
                    className="meter-fill meter-fill--quality"
                    style={{ width: `${qualityPct}%` }}
                  />
                </div>
              </div>
            </div>

            <ul className="chip-row" aria-label="Session state">
              <li className="chip">
                <span className="chip-key">Backend</span>
                <span className="chip-val">{diagnostics?.backendMode ?? '…'}</span>
              </li>
              <li className="chip">
                <span className="chip-key">Tracking</span>
                <span className="chip-val">{diagnostics?.faceTrackingMode ?? '…'}</span>
              </li>
              <li className="chip">
                <span className="chip-key">ROI</span>
                <span className="chip-val">{diagnostics?.roiSource ?? '—'}</span>
              </li>
            </ul>
          </aside>
        </section>

        <p className="deck">
          Built with <code>createRppgSession()</code> — packaged WASM, live diagnostics, and a layout
          suited for demos and screen recordings.
        </p>

        <details className="panel-disclosure">
          <summary>Technical diagnostics</summary>
          <div className="panel-inner">
            <div className="stats-grid">
              <div className="stat-row">
                <span className="stat-key">Estimation available</span>
                <span className="stat-value">
                  {diagnostics?.estimationAvailable ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-key">Frames seen</span>
                <span className="stat-value">{formatInteger(diagnostics?.framesSeen ?? 0)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-key">Samples received</span>
                <span className="stat-value">
                  {formatInteger(diagnostics?.totalSamplesReceived ?? 0)}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-key">Dropped frames</span>
                <span className="stat-value">{formatInteger(diagnostics?.droppedFrames ?? 0)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-key">Window samples</span>
                <span className="stat-value">
                  {formatInteger(diagnostics?.windowSampleCount ?? 0)}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-key">Window duration (ms)</span>
                <span className="stat-value">
                  {formatInteger(diagnostics?.windowDurationMs ?? 0)}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-key">Processor method</span>
                <span className="stat-value">{diagnostics?.processorMethod ?? '—'}</span>
              </div>
              <div className="stat-row">
                <span className="stat-key">Last drop reason</span>
                <span className="stat-value">{diagnostics?.lastDropReason ?? 'none'}</span>
              </div>
              <div className="stat-row stat-row--wide">
                <span className="stat-key">Session issues</span>
                <span className="stat-value">{formatIssueList(diagnostics?.issues)}</span>
              </div>
              <div className="stat-row stat-row--wide">
                <span className="stat-key">Processor issues</span>
                <span className="stat-value">{formatIssueList(diagnostics?.processorIssues)}</span>
              </div>
              <div className="stat-row stat-row--wide">
                <span className="stat-key">Last error</span>
                <span className="stat-value">
                  {diagnostics?.lastError
                    ? `${diagnostics.lastError.code}: ${diagnostics.lastError.message}`
                    : 'none'}
                </span>
              </div>
            </div>
          </div>
        </details>

        <details className="panel-disclosure">
          <summary>Capture tips</summary>
          <div className="panel-inner">
            <ol className="guidance-list">
              <li className="guidance-item">
                <span className="guidance-index">1</span>
                <div>
                  <strong>Use soft, frontal light</strong>
                  <span>Even lighting beats resolution for a stable trace.</span>
                </div>
              </li>
              <li className="guidance-item">
                <span className="guidance-index">2</span>
                <div>
                  <strong>Minimize motion during warm-up</strong>
                  <span>Give the estimator a few calm seconds before reading BPM.</span>
                </div>
              </li>
              <li className="guidance-item">
                <span className="guidance-index">3</span>
                <div>
                  <strong>Confirm WASM is active</strong>
                  <span>
                    Backend should read <code>wasm</code>. If not, verify Vite URLs for the packaged{' '}
                    <code>.wasm</code> assets.
                  </span>
                </div>
              </li>
            </ol>
          </div>
        </details>
      </main>

      <footer className="footer">
        <span>Elata SDK · rPPG web template</span>
      </footer>
    </div>
  );
}
