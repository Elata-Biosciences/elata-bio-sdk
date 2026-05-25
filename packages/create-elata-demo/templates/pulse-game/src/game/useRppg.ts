import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createRppgSession,
  type Metrics,
  type RppgSession,
} from '@elata-biosciences/rppg-web';
import rppgWasmJsUrl from '@elata-biosciences/rppg-web/pkg/rppg_wasm.js?url';
import rppgWasmBinaryUrl from '@elata-biosciences/rppg-web/pkg/rppg_wasm_bg.wasm?url';

export type RppgStatus = 'idle' | 'starting' | 'running' | 'failed';

export interface RppgState {
  status: RppgStatus;
  metrics: Metrics;
  message: string;
}

const EMPTY_METRICS: Metrics = {
  bpm: null,
  confidence: 0,
  signal_quality: 0,
};

export function useRppg(videoRef: React.RefObject<HTMLVideoElement>) {
  const [state, setState] = useState<RppgState>({
    status: 'idle',
    metrics: EMPTY_METRICS,
    message: 'Camera not started',
  });
  const sessionRef = useRef<RppgSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    setState((s) => ({ ...s, status: 'starting', message: 'Requesting camera…' }));

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
      setState({
        status: 'failed',
        metrics: EMPTY_METRICS,
        message: 'Camera access denied. Allow camera and reload.',
      });
      return;
    }

    streamRef.current = stream;
    video.srcObject = stream;
    await video.play().catch(() => undefined);

    const sampleRate = stream.getVideoTracks()[0]?.getSettings().frameRate ?? 30;

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
      sessionRef.current = session;

      const tick = () => {
        const metrics = session.getMetrics();
        setState({ status: 'running', metrics, message: 'Estimating pulse…' });
      };
      tick();
      pollRef.current = setInterval(tick, 400);
    } catch (err) {
      setState({
        status: 'failed',
        metrics: EMPTY_METRICS,
        message: err instanceof Error ? err.message : 'rPPG session failed to start.',
      });
    }
  }, [videoRef]);

  const stop = useCallback(async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (sessionRef.current) {
      await sessionRef.current.dispose();
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setState({ status: 'idle', metrics: EMPTY_METRICS, message: 'Stopped.' });
  }, []);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return { state, start, stop };
}
