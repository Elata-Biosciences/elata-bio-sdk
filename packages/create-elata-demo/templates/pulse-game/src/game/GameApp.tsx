import { useCallback, useEffect, useRef, useState } from 'react';
import { useRppg } from './useRppg';
import {
  useMetricsClient,
  type AppScore,
  type MetricsClient,
} from './useMetricsClient';
import {
  PHASE_DURATIONS,
  RECOVERY_MARGIN_BPM,
  RECOVERY_SUSTAIN_MS,
} from '../shared/handshake';

type Phase =
  | { kind: 'intro' }
  | { kind: 'calibrating'; startedAt: number }
  | { kind: 'ready'; baselineBpm: number }
  | { kind: 'anticipating'; baselineBpm: number; fireAt: number }
  | { kind: 'startle'; baselineBpm: number }
  | { kind: 'recovering'; baselineBpm: number; recoverFrom: number }
  | { kind: 'done'; result: RoundResult };

interface RoundResult {
  recoveryMs: number;
  baselineBpm: number;
  peakBpm: number;
  signalQualityPct: number;
  timedOut: boolean;
}

interface BaselineRecord {
  restingBpm: number;
  signalQualityFloor: number;
  calibratedAt: number;
}

export default function GameApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rppg = useRppg(videoRef);
  const metrics = useMetricsClient();
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [scores, setScores] = useState<AppScore[]>([]);
  const [savedBaseline, setSavedBaseline] = useState<BaselineRecord | null>(null);

  // Per-tick accumulators — refs so updates don't re-trigger effects.
  const calibrationSamplesRef = useRef<number[]>([]);
  const peakBpmRef = useRef<number>(0);
  const sustainedSinceRef = useRef<number | null>(null);

  // Load persisted baseline + leaderboard once the handshake completes.
  useEffect(() => {
    if (metrics.status !== 'ready') return;
    void hydrate(metrics.client).then(({ baseline, scores }) => {
      setSavedBaseline(baseline);
      setScores(scores);
    });
  }, [metrics]);

  const currentBpm = rppg.state.metrics.bpm;
  const currentSignalQuality = rppg.state.metrics.signal_quality;

  // --- finishRound is referenced by the recovery effect. ------------------
  const finishRound = useCallback(
    async (result: RoundResult) => {
      setPhase({ kind: 'done', result });
      if (metrics.status !== 'ready') return;
      try {
        // The API only supports value_desc ordering — lower-is-better metrics
        // have to be stored negated. See README for the full rationale.
        await metrics.client.saveScore({
          value: -result.recoveryMs,
          meta: {
            actualRecoveryMs: result.recoveryMs,
            baselineBpm: result.baselineBpm,
            peakBpm: result.peakBpm,
            signalQualityPct: result.signalQualityPct,
            timedOut: result.timedOut,
          },
        });
        const fresh = await metrics.client.loadScores({ limit: 10 });
        setScores(fresh);
      } catch (err) {
        console.error('saveScore failed', err);
      }
    },
    [metrics],
  );

  const triggerStartle = useCallback(
    (baselineBpm: number) => {
      setPhase({ kind: 'startle', baselineBpm });
      setFlashActive(true);
      peakBpmRef.current = baselineBpm;
      sustainedSinceRef.current = null;
      setTimeout(() => {
        setFlashActive(false);
        setPhase({
          kind: 'recovering',
          baselineBpm,
          recoverFrom: Date.now(),
        });
      }, PHASE_DURATIONS.startleMs);
    },
    [],
  );

  // --- Calibration: collect samples, then finalize. -----------------------
  useEffect(() => {
    if (phase.kind !== 'calibrating') return;
    if (currentBpm != null && Number.isFinite(currentBpm)) {
      calibrationSamplesRef.current.push(currentBpm);
    }
    const elapsed = Date.now() - phase.startedAt;
    if (elapsed < PHASE_DURATIONS.calibrateMs) return;

    const samples = calibrationSamplesRef.current;
    const tail = samples.slice(-Math.max(5, Math.floor(samples.length / 3)));
    if (tail.length === 0) {
      setPhase({ kind: 'intro' });
      return;
    }
    const baseline = avg(tail);
    if (metrics.status === 'ready') {
      void persistBaseline(metrics.client, baseline, currentSignalQuality);
    }
    setPhase({ kind: 'ready', baselineBpm: baseline });
  }, [currentBpm, currentSignalQuality, phase, metrics]);

  // --- Anticipation: fire the startle when fireAt is reached. -------------
  useEffect(() => {
    if (phase.kind !== 'anticipating') return;
    const delay = Math.max(0, phase.fireAt - Date.now());
    const id = setTimeout(() => triggerStartle(phase.baselineBpm), delay);
    return () => clearTimeout(id);
  }, [phase, triggerStartle]);

  // --- Recovery: watch BPM until it sustains back at baseline. ------------
  useEffect(() => {
    if (phase.kind !== 'recovering') return;
    const elapsed = Date.now() - phase.recoverFrom;
    if (elapsed >= PHASE_DURATIONS.recoveryTimeoutMs) {
      void finishRound({
        recoveryMs: PHASE_DURATIONS.recoveryTimeoutMs,
        baselineBpm: phase.baselineBpm,
        peakBpm: peakBpmRef.current,
        signalQualityPct: Math.round(currentSignalQuality * 100),
        timedOut: true,
      });
      return;
    }
    if (currentBpm == null || !Number.isFinite(currentBpm)) return;

    peakBpmRef.current = Math.max(peakBpmRef.current, currentBpm);
    const withinMargin = currentBpm <= phase.baselineBpm + RECOVERY_MARGIN_BPM;
    if (withinMargin) {
      if (sustainedSinceRef.current == null) {
        sustainedSinceRef.current = Date.now();
      }
      if (Date.now() - sustainedSinceRef.current >= RECOVERY_SUSTAIN_MS) {
        void finishRound({
          recoveryMs: sustainedSinceRef.current - phase.recoverFrom,
          baselineBpm: phase.baselineBpm,
          peakBpm: peakBpmRef.current,
          signalQualityPct: Math.round(currentSignalQuality * 100),
          timedOut: false,
        });
      }
    } else {
      sustainedSinceRef.current = null;
    }
  }, [currentBpm, currentSignalQuality, phase, finishRound]);

  // Recovery also needs to fire on the timeout even if BPM stops updating.
  useEffect(() => {
    if (phase.kind !== 'recovering') return;
    const id = setTimeout(() => {
      void finishRound({
        recoveryMs: PHASE_DURATIONS.recoveryTimeoutMs,
        baselineBpm: phase.baselineBpm,
        peakBpm: peakBpmRef.current,
        signalQualityPct: Math.round(currentSignalQuality * 100),
        timedOut: true,
      });
    }, PHASE_DURATIONS.recoveryTimeoutMs);
    return () => clearTimeout(id);
  }, [phase, currentSignalQuality, finishRound]);

  // --- Calibration phase needs a ticking re-render so progress advances. --
  useEffect(() => {
    if (phase.kind !== 'calibrating') return;
    const id = setInterval(() => {
      // Force re-render — the effect above checks elapsed time and transitions.
      setPhase((p) => (p.kind === 'calibrating' ? { ...p } : p));
    }, 200);
    return () => clearInterval(id);
  }, [phase.kind]);

  // --- Phase actions invoked from UI. -------------------------------------
  const startCalibration = useCallback(async () => {
    calibrationSamplesRef.current = [];
    await rppg.start();
    setPhase({ kind: 'calibrating', startedAt: Date.now() });
  }, [rppg]);

  const startRound = useCallback(() => {
    if (phase.kind !== 'ready') return;
    const delay =
      PHASE_DURATIONS.anticipationMinMs +
      Math.random() *
        (PHASE_DURATIONS.anticipationMaxMs - PHASE_DURATIONS.anticipationMinMs);
    setPhase({
      kind: 'anticipating',
      baselineBpm: phase.baselineBpm,
      fireAt: Date.now() + delay,
    });
  }, [phase]);

  const reset = useCallback(() => {
    if (savedBaseline) {
      setPhase({ kind: 'ready', baselineBpm: savedBaseline.restingBpm });
    } else {
      setPhase({ kind: 'intro' });
    }
  }, [savedBaseline]);

  // --- Render. ------------------------------------------------------------
  const metricsFallback =
    metrics.status === 'connecting'
      ? 'Connecting to host…'
      : metrics.status === 'error'
        ? `Host error: ${metrics.message}`
        : null;

  return (
    <div className="game">
      {flashActive && (
        <div
          className={reducedMotion ? 'flash flash-reduced' : 'flash flash-bright'}
          aria-hidden
        />
      )}

      <header className="game-header">
        <h1>Pulse recovery</h1>
        <label className="reduced-motion">
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => setReducedMotion(e.target.checked)}
          />
          Reduced motion (no bright flash)
        </label>
      </header>

      <video ref={videoRef} muted playsInline className="game-video" />

      <div className="bpm-readout">
        <span className="bpm-label">BPM</span>
        <span className="bpm-value">
          {currentBpm != null ? Math.round(currentBpm) : '—'}
        </span>
        <span className="bpm-quality">
          signal {Math.round(currentSignalQuality * 100)}%
        </span>
      </div>

      <PhaseView
        phase={phase}
        rppgMessage={rppg.state.message}
        metricsFallback={metricsFallback}
        savedBaseline={savedBaseline}
        onCalibrate={startCalibration}
        onStartRound={startRound}
        onReset={reset}
      />

      <Leaderboard scores={scores} />
    </div>
  );
}

function PhaseView(props: {
  phase: Phase;
  rppgMessage: string;
  metricsFallback: string | null;
  savedBaseline: BaselineRecord | null;
  onCalibrate: () => void;
  onStartRound: () => void;
  onReset: () => void;
}) {
  const {
    phase,
    rppgMessage,
    metricsFallback,
    savedBaseline,
    onCalibrate,
    onStartRound,
    onReset,
  } = props;

  if (metricsFallback) {
    return <div className="phase phase-info">{metricsFallback}</div>;
  }

  switch (phase.kind) {
    case 'intro':
      return (
        <div className="phase">
          <h2>How this works</h2>
          <ol>
            <li>Calibrate: 15s of resting pulse to set your baseline.</li>
            <li>Wait: a random 5–15s anticipation.</li>
            <li>Brief visual burst on screen (toggle reduced-motion above if photosensitive).</li>
            <li>Recover: how fast does your pulse return to baseline?</li>
          </ol>
          {savedBaseline && (
            <p className="hint">
              Saved baseline: {Math.round(savedBaseline.restingBpm)} BPM. Calibrating again replaces it.
            </p>
          )}
          <button className="btn btn-primary" onClick={onCalibrate}>
            Calibrate
          </button>
        </div>
      );
    case 'calibrating': {
      const progress = Math.min(
        1,
        (Date.now() - phase.startedAt) / PHASE_DURATIONS.calibrateMs,
      );
      return (
        <div className="phase">
          <h2>Calibrating baseline…</h2>
          <p>Sit still. Face the camera. {rppgMessage}</p>
          <progress value={progress} max={1} />
        </div>
      );
    }
    case 'ready':
      return (
        <div className="phase">
          <h2>Baseline: {Math.round(phase.baselineBpm)} BPM</h2>
          <p>
            When you press start, a random 5–15s wait will pass, then a brief visual burst.
            Stay seated; we’ll measure how fast your pulse returns.
          </p>
          <button className="btn btn-primary" onClick={onStartRound}>
            Start round
          </button>
        </div>
      );
    case 'anticipating':
      return (
        <div className="phase phase-quiet">
          <h2>Any moment now…</h2>
          <p>Eyes on the screen.</p>
        </div>
      );
    case 'startle':
      return <div className="phase phase-quiet" aria-live="polite" />;
    case 'recovering':
      return (
        <div className="phase">
          <h2>Recovering…</h2>
          <p>
            Back to baseline + {RECOVERY_MARGIN_BPM} BPM for{' '}
            {Math.round(RECOVERY_SUSTAIN_MS / 1000)}s to finish (60s timeout).
          </p>
        </div>
      );
    case 'done':
      return (
        <div className="phase">
          <h2>
            {phase.result.timedOut
              ? 'Timed out at 60s'
              : `Recovery: ${(phase.result.recoveryMs / 1000).toFixed(1)}s`}
          </h2>
          <ul className="result-list">
            <li>Baseline: {Math.round(phase.result.baselineBpm)} BPM</li>
            <li>Peak: {Math.round(phase.result.peakBpm)} BPM</li>
            <li>Signal quality: {phase.result.signalQualityPct}%</li>
          </ul>
          <button className="btn" onClick={onReset}>
            Run another round
          </button>
        </div>
      );
  }
}

function Leaderboard({ scores }: { scores: AppScore[] }) {
  if (scores.length === 0) {
    return (
      <section className="leaderboard">
        <h3>Best recoveries</h3>
        <p className="muted">No rounds yet. Finish one and it shows up here.</p>
      </section>
    );
  }
  return (
    <section className="leaderboard">
      <h3>Best recoveries</h3>
      <ol>
        {scores.map((s) => (
          <li key={s.id}>
            {(Math.abs(s.value) / 1000).toFixed(1)}s
            <span className="muted">
              {' · '}
              {new Date(s.timestamp).toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

async function hydrate(client: MetricsClient): Promise<{
  baseline: BaselineRecord | null;
  scores: AppScore[];
}> {
  const [baselines, scores] = await Promise.all([
    client.query({ type: 'baseline', limit: 1 }),
    client.loadScores({ limit: 10 }),
  ]);
  const baseline = (baselines[0]?.data as BaselineRecord | undefined) ?? null;
  return { baseline, scores };
}

async function persistBaseline(
  client: MetricsClient,
  bpm: number,
  signalQuality: number,
): Promise<void> {
  const record: BaselineRecord = {
    restingBpm: bpm,
    signalQualityFloor: signalQuality,
    calibratedAt: Date.now(),
  };
  try {
    await client.record({ type: 'baseline', data: record });
  } catch (err) {
    console.error('baseline persist failed', err);
  }
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
