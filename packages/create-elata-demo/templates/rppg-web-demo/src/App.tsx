import { useEffect, useRef, useState } from 'react';
import * as Rppg from '@elata-biosciences/rppg-web';
import type { Backend, Metrics } from '@elata-biosciences/rppg-web';

type DemoRunnerDiagnostics = {
  framesSeen: number;
  framesWithFaceRoi: number;
  framesWithFallbackRoi: number;
  framesWithMultiRoi: number;
  samplesPushed: number;
  droppedFrames: number;
  lastDropReason: string | null;
  lastTimestampMs: number | null;
  lastIntensity: number | null;
  lastSkinRatio: number | null;
  lastClipRatio: number | null;
  lastMotion: number | null;
  lastProcessorMethod: string | null;
  lastRoiSource: string | null;
};

type RppgDebugSnapshot = {
  windowSampleCount: number;
  windowDurationMs: number;
  issues: string[];
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const runnerRef = useRef<any>(null);
  const [status, setStatus] = useState('Starting...');
  const [backendMode, setBackendMode] = useState<'preview' | 'live'>('preview');
  const [metrics, setMetrics] = useState<Metrics>({
    bpm: null,
    confidence: 0,
    signal_quality: 0,
  });
  const [runnerDiagnostics, setRunnerDiagnostics] = useState<DemoRunnerDiagnostics>({
    framesSeen: 0,
    framesWithFaceRoi: 0,
    framesWithFallbackRoi: 0,
    framesWithMultiRoi: 0,
    samplesPushed: 0,
    droppedFrames: 0,
    lastDropReason: null,
    lastTimestampMs: null,
    lastIntensity: null,
    lastSkinRatio: null,
    lastClipRatio: null,
    lastMotion: null,
    lastProcessorMethod: null,
    lastRoiSource: null,
  });
  const [debugSnapshot, setDebugSnapshot] = useState<RppgDebugSnapshot | null>(null);

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

      video.srcObject = stream;
      const fps = stream.getVideoTracks()[0]?.getSettings().frameRate ?? 30;

      setStatus('Initializing...');

      const { DemoRunner, MediaPipeFaceFrameSource, MediaPipeFrameSource, RppgProcessor, loadFaceMesh } =
        Rppg as any;

      const faceMesh = await loadFaceMesh();
      if (cancelled) return;

      const source = faceMesh
        ? new MediaPipeFaceFrameSource(video, faceMesh, fps)
        : new MediaPipeFrameSource(video, { fps });

      const loadBackend = (): Backend => {
        return {
          newPipeline: () => ({
            push_sample: () => {},
            get_metrics: () => ({ bpm: null, confidence: 0, signal_quality: 0 }),
          }),
        };
      };

      const backend = await loadBackend();
      setBackendMode('preview');

      const processor = new RppgProcessor(backend, fps, 8);
      processor.enableTracker(55, 150, 200);

      const runner = new DemoRunner(source, processor, {
        useSkinMask: true,
        roiSmoothingAlpha: 0.2,
        onDiagnostics: (diagnostics: DemoRunnerDiagnostics) => setRunnerDiagnostics(diagnostics),
      });
      runnerRef.current = runner;
      await runner.start();
      if (cancelled) {
        await runner.stop();
        return;
      }

      setStatus('Preview mode running. Update to a newer rppg-web release to enable live metrics.');
      intervalId = setInterval(() => {
        setMetrics(processor.getMetrics());
        if (typeof processor.getDebugSnapshot === 'function') {
          setDebugSnapshot(processor.getDebugSnapshot());
        }
      }, 1000);
    }

    init();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      runnerRef.current?.stop();
    };
  }, []);

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 520, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Elata rPPG Demo</h1>
      <p>{status}</p>
      <p>Backend: {backendMode === 'live' ? 'Live WASM pipeline' : 'Preview fallback'}</p>
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
        <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>Diagnostics</h2>
        <div>Frames seen: {runnerDiagnostics.framesSeen}</div>
        <div>Face ROI frames: {runnerDiagnostics.framesWithFaceRoi}</div>
        <div>Multi-ROI frames: {runnerDiagnostics.framesWithMultiRoi}</div>
        <div>Fallback ROI frames: {runnerDiagnostics.framesWithFallbackRoi}</div>
        <div>Samples pushed: {runnerDiagnostics.samplesPushed}</div>
        <div>Dropped frames: {runnerDiagnostics.droppedFrames}</div>
        <div>Last drop reason: {runnerDiagnostics.lastDropReason ?? 'none'}</div>
        <div>Last ROI source: {runnerDiagnostics.lastRoiSource ?? 'none'}</div>
        <div>Last processor method: {runnerDiagnostics.lastProcessorMethod ?? 'none'}</div>
        <div>Last skin ratio: {runnerDiagnostics.lastSkinRatio != null ? runnerDiagnostics.lastSkinRatio.toFixed(2) : '--'}</div>
        <div>Last motion: {runnerDiagnostics.lastMotion != null ? runnerDiagnostics.lastMotion.toFixed(2) : '--'}</div>
        <div>Last clip ratio: {runnerDiagnostics.lastClipRatio != null ? runnerDiagnostics.lastClipRatio.toFixed(2) : '--'}</div>
        <div>Window samples: {debugSnapshot?.windowSampleCount ?? 0}</div>
        <div>Window duration ms: {debugSnapshot?.windowDurationMs ?? 0}</div>
        <div>Issues: {debugSnapshot?.issues.length ? debugSnapshot.issues.join(', ') : 'none'}</div>
      </section>
    </main>
  );
}
