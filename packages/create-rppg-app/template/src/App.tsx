import { useEffect, useRef, useState } from 'react';
import {
  RppgProcessor,
  DemoRunner,
  loadFaceMesh,
  MediaPipeFaceFrameSource,
  MediaPipeFrameSource,
  loadWasmBackend,
} from '@elata-biosciences/rppg-web';
import type { Metrics } from '@elata-biosciences/rppg-web';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const runnerRef = useRef<DemoRunner | null>(null);
  const [status, setStatus] = useState('Starting...');
  const [metrics, setMetrics] = useState<Metrics>({ bpm: null, confidence: 0, signal_quality: 0 });

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function init() {
      const video = videoRef.current;
      if (!video) return;

      // 1. Request webcam
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
      } catch {
        setStatus('Camera access denied. Allow camera and reload.');
        return;
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;

      const fps = stream.getVideoTracks()[0]?.getSettings().frameRate ?? 30;

      setStatus('Initializing...');

      // 2. Load face mesh for ROI detection (falls back to centered box if unavailable)
      const faceMesh = await loadFaceMesh();
      if (cancelled) return;

      const source = faceMesh
        ? new MediaPipeFaceFrameSource(video, faceMesh, fps)
        : new MediaPipeFrameSource(video, { fps });

      // 3. Load WASM backend (falls back to JS-only mode if WASM not available)
      const backend = await loadWasmBackend().catch(() => null) ?? {
        newPipeline: () => ({ push_sample: () => {}, get_metrics: () => ({ bpm: null, confidence: 0, signal_quality: 0 }) }),
      };

      // 4. Wire up the processor and runner
      const proc = new RppgProcessor(backend, fps, 8);
      proc.enableTracker(55, 150, 200);

      const runner = new DemoRunner(source, proc, {
        useSkinMask: true,
        roiSmoothingAlpha: 0.2,
      });
      runnerRef.current = runner;
      await runner.start();
      if (cancelled) { await runner.stop(); return; }

      setStatus('Running — keep your face in frame');

      // 5. Poll metrics every second
      intervalId = setInterval(() => {
        setMetrics(proc.getMetrics());
      }, 1000);
    }

    init();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      runnerRef.current?.stop();
    };
  }, []);

  const bpm = metrics.bpm;
  const confidence = metrics.confidence ?? 0;
  const signalQuality = metrics.signal_quality ?? 0;

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 480, margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>rPPG Heart Rate Monitor</h1>

      <video
        ref={videoRef}
        width={320}
        height={240}
        autoPlay
        muted
        playsInline
        style={{ display: 'block', border: '1px solid #ccc', borderRadius: 4 }}
      />

      <div style={{ marginTop: 16, lineHeight: 2 }}>
        <div>
          <strong>BPM:</strong>{' '}
          <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {bpm != null ? bpm.toFixed(1) : '--'}
          </span>
        </div>
        <div><strong>Confidence:</strong> {confidence.toFixed(2)}</div>
        <div><strong>Signal quality:</strong> {signalQuality.toFixed(2)}</div>
        <div style={{ marginTop: 8, color: '#666', fontSize: '0.9rem' }}>{status}</div>
      </div>
    </div>
  );
}
