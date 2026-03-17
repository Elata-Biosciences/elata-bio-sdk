import { useEffect, useRef, useState } from 'react';
import * as Rppg from '@elata-biosciences/rppg-web';
import type { Backend, Metrics } from '@elata-biosciences/rppg-web';

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
    </main>
  );
}
