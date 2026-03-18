import { useEffect, useRef, useState } from 'react';
import {
  createRppgSession,
  type Metrics,
  type RppgSession,
  type RppgSessionDiagnostics,
} from '@elata-biosciences/rppg-web';

const EMPTY_METRICS: Metrics = {
  bpm: null,
  confidence: 0,
  signal_quality: 0,
};

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
    return 'Session running without the packaged WASM backend. Serve the /pkg assets to enable live metrics.';
  }

  if (
    diagnostics.issues.includes('no_samples_yet') ||
    diagnostics.issues.includes('insufficient_window')
  ) {
    return 'Collecting samples. Keep your face centered and still for a few seconds.';
  }

  return 'Live rPPG session running.';
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

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 520, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Elata rPPG Demo</h1>
      <p>{status}</p>
      <p>Backend mode: {diagnostics?.backendMode ?? 'starting'}</p>
      <video
        ref={videoRef}
        width={320}
        height={240}
        autoPlay
        muted
        playsInline
        style={{ display: 'block', borderRadius: 8, border: '1px solid #d0d7de' }}
      />
      <div style={{ marginTop: 16, lineHeight: 1.8 }}>
        <div>BPM: {metrics.bpm != null ? metrics.bpm.toFixed(1) : '--'}</div>
        <div>Confidence: {metrics.confidence.toFixed(2)}</div>
        <div>Signal quality: {metrics.signal_quality.toFixed(2)}</div>
      </div>
      <section style={{ marginTop: 24, padding: 16, borderRadius: 12, border: '1px solid #d0d7de', background: '#f6f8fa' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>Session diagnostics</h2>
        <div>Face tracking: {diagnostics?.faceTrackingMode ?? 'starting'}</div>
        <div>Estimation available: {diagnostics?.estimationAvailable ? 'yes' : 'no'}</div>
        <div>Frames seen: {diagnostics?.framesSeen ?? 0}</div>
        <div>Samples received: {diagnostics?.totalSamplesReceived ?? 0}</div>
        <div>Dropped frames: {diagnostics?.droppedFrames ?? 0}</div>
        <div>Last drop reason: {diagnostics?.lastDropReason ?? 'none'}</div>
        <div>ROI source: {diagnostics?.roiSource ?? 'none'}</div>
        <div>Processor method: {diagnostics?.processorMethod ?? 'none'}</div>
        <div>Window samples: {diagnostics?.windowSampleCount ?? 0}</div>
        <div>Window duration ms: {diagnostics?.windowDurationMs ?? 0}</div>
        <div>Processor issues: {formatIssueList(diagnostics?.processorIssues)}</div>
        <div>Session issues: {formatIssueList(diagnostics?.issues)}</div>
        <div>Last error: {diagnostics?.lastError ? `${diagnostics.lastError.code}: ${diagnostics.lastError.message}` : 'none'}</div>
      </section>
    </main>
  );
}
