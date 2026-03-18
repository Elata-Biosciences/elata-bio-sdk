import { RppgProcessor } from '../rppgProcessor';
import { RppgSession } from '../rppgSession';
import type { FrameSource } from '../frameSource';
import type { DemoRunnerDiagnostics } from '../demoRunner';

function createMockBackend(pipelineMethods: any = {}) {
  const fakePipeline = {
    push_sample: jest.fn(),
    push_sample_rgb_meta: jest.fn(),
    get_metrics: jest.fn(() => ({ bpm: 72, confidence: 0.8, signal_quality: 0.7 })),
    free: jest.fn(),
    ...pipelineMethods,
  };
  return {
    newPipeline: jest.fn(() => fakePipeline),
    pipeline: fakePipeline,
  };
}

function createRunnerStub(diagnostics: Partial<DemoRunnerDiagnostics> = {}) {
  const base: DemoRunnerDiagnostics = {
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
  };
  return {
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    getDiagnostics: jest.fn(() => ({ ...base, ...diagnostics })),
  };
}

function createSourceStub(): FrameSource {
  return {
    onFrame: null,
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
  };
}

describe('RppgSession', () => {
  test('does not treat intentional video-frame mode as a face-mesh failure', () => {
    const backend = createMockBackend();
    const processor = new RppgProcessor(backend as any, 30, 5);
    const runner = createRunnerStub();
    const session = new RppgSession(
      createSourceStub(),
      processor,
      runner as any,
      'wasm',
      'video_frame',
      {
        faceTrackingDegraded: false,
      },
    );

    const diagnostics = session.getDiagnostics();

    expect(diagnostics.faceTrackingMode).toBe('video_frame');
    expect(diagnostics.issues).not.toContain('face_mesh_unavailable');
    expect(diagnostics.state).toEqual({
      status: 'running',
      phase: 'none',
      terminal: false,
      reason: null,
      errorCode: null,
      errorStage: null,
    });
  });

  test('reports degraded startup state when the backend is unavailable', () => {
    const backend = createMockBackend({
      get_metrics: jest.fn(() => ({ bpm: null, confidence: 0, signal_quality: 0 })),
    });
    const processor = new RppgProcessor(backend as any, 30, 5);
    const runner = createRunnerStub();
    const session = new RppgSession(
      createSourceStub(),
      processor,
      runner as any,
      'unavailable',
      'video_frame',
      {
        backendDegraded: true,
      },
    );

    const diagnostics = session.getDiagnostics();

    expect(diagnostics.estimationAvailable).toBe(false);
    expect(diagnostics.issues).toContain('backend_unavailable');
    expect(diagnostics.state).toEqual({
      status: 'degraded',
      phase: 'startup',
      terminal: false,
      reason: 'backend_unavailable',
      errorCode: null,
      errorStage: null,
    });
  });

  test('surfaces terminal processor failure state and safe metrics', () => {
    const backend = createMockBackend({
      push_sample_rgb_meta: jest.fn(() => {
        throw new Error('unreachable');
      }),
    });
    const processor = new RppgProcessor(backend as any, 30, 5);
    const runner = createRunnerStub({
      lastProcessorMethod: 'rgb_meta',
    });
    const session = new RppgSession(
      createSourceStub(),
      processor,
      runner as any,
      'wasm',
      'face_mesh',
    );

    expect(() => {
      processor.pushSampleRgbMeta(1000, 0.4, 0.5, 0.4, 0.8, 0.1, 0.05);
    }).toThrow('unreachable');

    session.recordError({
      code: 'processor_error',
      stage: 'processor',
      message: 'unreachable',
      timestampMs: 1234,
    });

    const diagnostics = session.getDiagnostics();

    expect(diagnostics.estimationAvailable).toBe(false);
    expect(diagnostics.processorFailure).toEqual({
      operation: 'push_sample_rgb_meta',
      message: 'unreachable',
    });
    expect(diagnostics.issues).toContain('processor_failed');
    expect(diagnostics.state).toEqual({
      status: 'failed',
      phase: 'runtime',
      terminal: true,
      reason: 'processor_error',
      errorCode: 'processor_error',
      errorStage: 'processor',
    });
    expect(session.getMetrics()).toEqual(
      expect.objectContaining({
        bpm: null,
        confidence: 0,
        signal_quality: 0,
        reason_codes: ['backend_failed'],
        fused_source: 'none',
      }),
    );
    expect(backend.pipeline.get_metrics).not.toHaveBeenCalled();
  });

  test('getTraceSnapshot exposes processor trace data through the public session API', () => {
    const backend = createMockBackend();
    const processor = new RppgProcessor(backend as any, 30, 5);
    processor.pushSampleRgbMeta(1000, 0.4, 0.5, 0.4, 0.8, 0.1, 0.05);
    processor.pushSampleRgbMeta(1033, 0.5, 0.6, 0.5, 0.7, 0.2, 0.04);

    const runner = createRunnerStub();
    const session = new RppgSession(
      createSourceStub(),
      processor,
      runner as any,
      'wasm',
      'video_frame',
    );

    const trace = session.getTraceSnapshot(1);

    expect(trace.points).toHaveLength(1);
    expect(trace.points[0]).toMatchObject({
      timestampMs: 1033,
      skinRatio: 0.7,
      motion: 0.2,
      clipRatio: 0.04,
    });
    expect(trace.windowSampleCount).toBe(2);
  });

  test('dispose stops the runner and frees the processor pipeline', async () => {
    const backend = createMockBackend();
    const processor = new RppgProcessor(backend as any, 30, 5);
    const runner = createRunnerStub();
    const session = new RppgSession(
      createSourceStub(),
      processor,
      runner as any,
      'wasm',
      'video_frame',
    );

    await session.dispose();

    expect(runner.stop).toHaveBeenCalledTimes(1);
    expect(backend.pipeline.free).toHaveBeenCalledTimes(1);
  });
});
