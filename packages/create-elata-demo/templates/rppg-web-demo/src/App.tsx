import { useEffect, useRef, useState } from 'react';
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
    return '--';
  }

  return value.toFixed(digits);
}

function formatInteger(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return '--';
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
    return 'Starting...';
  }

  if (diagnostics.lastError) {
    return `Last error: ${diagnostics.lastError.message}`;
  }

  if (diagnostics.backendMode !== 'wasm') {
    return 'Session running without the packaged WASM backend. Check that the bundled WASM asset URLs are loading correctly.';
  }

  if (
    diagnostics.issues.includes('no_samples_yet') ||
    diagnostics.issues.includes('insufficient_window')
  ) {
    return 'Collecting samples. Keep your face centered and still for a few seconds.';
  }

  return 'Live rPPG session running.';
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

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<RppgSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState('Requesting camera access...');
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS);
  const [diagnostics, setDiagnostics] = useState<RppgSessionDiagnostics | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function init() {
      const video = videoRef.current;
      if (!video) return;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
          audio: false,
        });
      } catch {
        setStatus('Camera access denied. Allow camera and reload.');
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
      setStatus('Starting rPPG session...');

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
        });

        if (cancelled) {
          await session.dispose();
          return;
        }

        sessionRef.current = session;

        const syncSessionState = () => {
          const nextDiagnostics = session.getDiagnostics();
          setMetrics(session.getMetrics());
          setDiagnostics(nextDiagnostics);
          setStatus(getStatusMessage(nextDiagnostics));
        };

        syncSessionState();
        intervalId = setInterval(syncSessionState, 1000);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to start the rPPG session.';
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
  }, []);

  const statusTone = getStatusTone(diagnostics);
  const statusDotClass =
    statusTone === 'error' ? 'status-dot error' : statusTone === 'warn' ? 'status-dot warn' : 'status-dot';
  const readinessLabel =
    diagnostics?.estimationAvailable && metrics.bpm != null ? 'Locked' : 'Warming up';

  return (
    <main className="app-shell">
      <div className="app-grid">
        <section className="hero-card">
          <div className="hero-content">
            <div className="hero-topline">
              <div className="eyebrow">Elata rPPG Studio</div>
              <div className="status-pill">
                <span className={statusDotClass} />
                <span>{status}</span>
              </div>
            </div>

            <div className="hero-main">
              <h1 className="hero-title">Camera pulse, surfaced like a product.</h1>
              <p className="hero-copy">
                This starter app uses <code>createRppgSession()</code> with the packaged
                WASM backend, live diagnostics, and a calmer dashboard treatment so a new
                integration feels immediately inspectable instead of purely utilitarian.
              </p>
            </div>

            <div className="hero-summary">
              <article className="signal-card">
                <p className="signal-label">Session mode</p>
                <p className="signal-value">{diagnostics?.backendMode ?? 'starting'}</p>
              </article>
              <article className="signal-card">
                <p className="signal-label">Tracking state</p>
                <p className="signal-value">{diagnostics?.faceTrackingMode ?? 'starting'}</p>
              </article>
              <article className="signal-card">
                <p className="signal-label">Readiness</p>
                <p className="signal-value">{readinessLabel}</p>
              </article>
            </div>
          </div>
        </section>

        <section className="content-grid">
          <div className="left-column">
            <article className="panel-card">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Live camera feed</h2>
                  <p className="panel-subtitle">
                    Keep your face centered, evenly lit, and as still as possible while the
                    warm-up window fills.
                  </p>
                </div>
              </div>

              <div className="camera-frame">
                <video
                  ref={videoRef}
                  width={320}
                  height={240}
                  autoPlay
                  muted
                  playsInline
                  className="camera-video"
                />
                <div className="camera-overlay">
                  <div className="overlay-badge">Session diagnostics enabled</div>
                  <div className="overlay-grid">
                    <span>ROI: {diagnostics?.roiSource ?? 'none'}</span>
                    <span>Method: {diagnostics?.processorMethod ?? 'none'}</span>
                  </div>
                </div>
              </div>
            </article>

            <section className="metric-grid">
              <article className="metric-card">
                <p className="metric-label">Heart rate</p>
                <p className="metric-value">
                  {metrics.bpm != null ? formatMetric(metrics.bpm, 1) : '--'}
                </p>
                <p className="metric-note">BPM</p>
              </article>

              <article className="metric-card">
                <p className="metric-label">Confidence</p>
                <p className="metric-value">{formatMetric(metrics.confidence)}</p>
                <p className="metric-note">estimator trust</p>
              </article>

              <article className="metric-card">
                <p className="metric-label">Signal quality</p>
                <p className="metric-value">{formatMetric(metrics.signal_quality)}</p>
                <p className="metric-note">lighting + motion</p>
              </article>
            </section>
          </div>

          <div className="right-column">
            <section className="diagnostic-panel">
              <article className="diagnostic-card">
                <header>
                  <div>
                    <h2 className="section-title">Session diagnostics</h2>
                    <p>All the live hooks you need while wiring the SDK into a real app.</p>
                  </div>
                </header>
                <div className="stats-grid">
                  <div className="stat-row">
                    <span className="stat-key">Estimation available</span>
                    <span className="stat-value">
                      {diagnostics?.estimationAvailable ? 'yes' : 'no'}
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
                    <span className="stat-value">
                      {formatInteger(diagnostics?.droppedFrames ?? 0)}
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-key">Window samples</span>
                    <span className="stat-value">
                      {formatInteger(diagnostics?.windowSampleCount ?? 0)}
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-key">Window duration ms</span>
                    <span className="stat-value">
                      {formatInteger(diagnostics?.windowDurationMs ?? 0)}
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-key">Last drop reason</span>
                    <span className="stat-value">{diagnostics?.lastDropReason ?? 'none'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-key">Session issues</span>
                    <span className="stat-value">{formatIssueList(diagnostics?.issues)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-key">Processor issues</span>
                    <span className="stat-value">
                      {formatIssueList(diagnostics?.processorIssues)}
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-key">Last error</span>
                    <span className="stat-value">
                      {diagnostics?.lastError
                        ? `${diagnostics.lastError.code}: ${diagnostics.lastError.message}`
                        : 'none'}
                    </span>
                  </div>
                </div>
              </article>

              <article className="diagnostic-card">
                <header>
                  <div>
                    <h3>Capture guidance</h3>
                    <p>Quick practical checks that improve the first few readings.</p>
                  </div>
                </header>
                <ol className="guidance-list">
                  <li className="guidance-item">
                    <span className="guidance-index">1</span>
                    <div>
                      <strong>Face the light</strong>
                      <span>Soft frontal lighting helps signal quality far more than raw resolution.</span>
                    </div>
                  </li>
                  <li className="guidance-item">
                    <span className="guidance-index">2</span>
                    <div>
                      <strong>Stay still for the warm-up</strong>
                      <span>Give the tracker a few steady seconds before judging the BPM output.</span>
                    </div>
                  </li>
                  <li className="guidance-item">
                    <span className="guidance-index">3</span>
                    <div>
                      <strong>Watch the diagnostics</strong>
                      <span>
                        If the backend is not <code>wasm</code>, confirm the bundled WASM
                        asset URLs are loading correctly in the browser.
                      </span>
                    </div>
                  </li>
                </ol>
              </article>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
