import {
  ManagedRppgSession,
} from '../managedRppgSession';
import type {
  CreateRppgSessionOptions,
  RppgSessionDiagnostics,
  RppgSessionError,
} from '../rppgSession';

function createDiagnostics(overrides: Partial<RppgSessionDiagnostics> = {}): RppgSessionDiagnostics {
  const { lastFaceMeshAlignment, ...rest } = overrides;
  return {
    backendMode: 'wasm',
    estimationAvailable: true,
    faceTrackingMode: 'video_frame',
    roiSource: 'fallback_roi',
    processorMethod: 'rgb_meta',
    totalSamplesReceived: 1,
    windowSampleCount: 1,
    windowDurationMs: 33,
    lastSampleTimestampMs: 1000,
    lastSampleAgeMs: 10,
    lastSample: null,
    processorIssues: [],
    issues: [],
    processorFailure: null,
    state: {
      status: 'running',
      phase: 'none',
      terminal: false,
      reason: null,
      errorCode: null,
      errorStage: null,
    },
    lastError: null,
    framesSeen: 1,
    framesWithFaceRoi: 0,
    framesWithFallbackRoi: 1,
    framesWithMultiRoi: 0,
    samplesPushed: 1,
    droppedFrames: 0,
    lastDropReason: null,
    lastTimestampMs: 1000,
    lastIntensity: 0.5,
    lastSkinRatio: 0.5,
    lastClipRatio: 0.05,
    lastMotion: 0.02,
    lastProcessorMethod: 'rgb_meta',
    lastRoiSource: 'fallback_roi',
    ...rest,
    lastFaceMeshAlignment: lastFaceMeshAlignment ?? null,
  };
}

function createSessionStub(overrides: Partial<any> = {}) {
  let diagnostics = createDiagnostics();
  let onError: ((error: RppgSessionError) => void) | undefined;
  let onDiagnostics: ((diagnostics: RppgSessionDiagnostics) => void) | undefined;

  return {
    attach(options: CreateRppgSessionOptions) {
      onError = options.onError;
      onDiagnostics = options.onDiagnostics;
      onDiagnostics?.(diagnostics);
    },
    emitError(error: RppgSessionError) {
      diagnostics = {
        ...diagnostics,
        lastError: error,
        state: {
          status: 'failed',
          phase: 'runtime',
          terminal: true,
          reason: error.code,
          errorCode: error.code,
          errorStage: error.stage,
        },
      };
      onError?.(error);
    },
    getDiagnostics: jest.fn(() => diagnostics),
    getMetrics: jest.fn(() => ({ bpm: 72, confidence: 0.8, signal_quality: 0.7 })),
    getDebugSnapshot: jest.fn(() => ({
      totalSamplesReceived: diagnostics.totalSamplesReceived,
      windowSampleCount: diagnostics.windowSampleCount,
      windowDurationMs: diagnostics.windowDurationMs,
      lastSampleTimestampMs: diagnostics.lastSampleTimestampMs,
      lastSampleAgeMs: diagnostics.lastSampleAgeMs,
      lastSample: diagnostics.lastSample,
      backendMetrics: { bpm: 72, confidence: 0.8, signal_quality: 0.7 },
      issues: diagnostics.processorIssues,
    })),
    dispose: jest.fn(async () => {}),
    ...overrides,
  };
}

describe('ManagedRppgSession', () => {
  test('createManagedRppgSession auto-starts and exposes running state', async () => {
    const session = createSessionStub();
    const sessionFactory = jest.fn(async (options: CreateRppgSessionOptions) => {
      session.attach(options);
      return session as any;
    });

    const managed = new ManagedRppgSession(
      {
        video: document.createElement('video'),
        faceMesh: 'off',
      },
      { sessionFactory },
    );
    await managed.start();

    expect(sessionFactory).toHaveBeenCalledTimes(1);
    expect(managed.state.status).toBe('running');
    expect(managed.getDiagnostics()).toMatchObject({
      faceTrackingMode: 'video_frame',
    });
  });

  test('restarts after a processor error until the retry budget is exhausted', async () => {
    jest.useFakeTimers();
    try {
      const firstSession = createSessionStub();
      const secondSession = createSessionStub();
      const sessions = [firstSession, secondSession];
      const stateChanges: string[] = [];
      const sessionFactory = jest.fn(async (options: CreateRppgSessionOptions) => {
        const next = sessions.shift();
        if (!next) throw new Error('no session available');
        next.attach(options);
        return next as any;
      });

      const managed = new ManagedRppgSession(
        {
          video: document.createElement('video'),
          faceMesh: 'off',
          maxRetries: 1,
          retryDelayMs: 250,
          onStateChange: (state) => stateChanges.push(state.status),
        },
        { sessionFactory },
      );

      await managed.start();
      expect(managed.state.status).toBe('running');

      firstSession.emitError({
        code: 'processor_error',
        stage: 'processor',
        message: 'unreachable',
        timestampMs: 1000,
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(managed.state.status).toBe('retrying');
      expect(firstSession.dispose).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();

      expect(sessionFactory).toHaveBeenCalledTimes(2);
      expect(managed.state.status).toBe('running');
      expect(managed.state.retryCount).toBe(1);
      expect(stateChanges).toEqual(
        expect.arrayContaining(['starting', 'running', 'retrying']),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('fails instead of retrying after the retry budget is exhausted', async () => {
    const session = createSessionStub();
    const sessionFactory = jest.fn(async (options: CreateRppgSessionOptions) => {
      session.attach(options);
      return session as any;
    });

    const managed = new ManagedRppgSession(
      {
        video: document.createElement('video'),
        faceMesh: 'off',
        maxRetries: 0,
      },
      { sessionFactory },
    );

    await managed.start();
    session.emitError({
      code: 'processor_error',
      stage: 'processor',
      message: 'unreachable',
      timestampMs: 1000,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(managed.state.status).toBe('failed');
    expect(managed.lastError).toMatchObject({
      code: 'processor_error',
    });
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  test('returns an empty public trace snapshot when no active session is attached', () => {
    const managed = new ManagedRppgSession({
      video: document.createElement('video'),
      faceMesh: 'off',
      autoStart: false,
    });

    expect(managed.getTraceSnapshot()).toEqual({
      sampleRate: 0,
      windowSec: 0,
      totalSamplesReceived: 0,
      windowSampleCount: 0,
      windowDurationMs: 0,
      durationSec: 0,
      points: [],
      lastSample: null,
      backendFailure: null,
    });
  });
});
