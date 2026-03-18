import { normalizeRppgError } from '../rppgErrors';

describe('normalizeRppgError', () => {
  test('normalizes backend init failures into wasm_init_failed guidance', () => {
    expect(
      normalizeRppgError({
        code: 'backend_init_failed',
        stage: 'backend',
        message: 'wasm import failed',
        timestampMs: 1,
      }),
    ).toEqual(
      expect.objectContaining({
        code: 'wasm_init_failed',
        phase: 'startup',
        retryable: false,
        terminal: false,
      }),
    );
  });

  test('normalizes processor failures into processor_failed guidance', () => {
    expect(
      normalizeRppgError({
        code: 'processor_error',
        stage: 'processor',
        message: 'unreachable',
        timestampMs: 1,
      }),
    ).toEqual(
      expect.objectContaining({
        code: 'processor_failed',
        phase: 'runtime',
        retryable: true,
        terminal: true,
      }),
    );
  });

  test('normalizes capture errors into camera_not_playing when playback never started', () => {
    expect(
      normalizeRppgError({
        code: 'capture_error',
        stage: 'capture',
        message: 'Camera video did not start playing',
        timestampMs: 1,
      }),
    ).toEqual(
      expect.objectContaining({
        code: 'camera_not_playing',
        phase: 'runtime',
      }),
    );
  });

  test('normalizes canvas context failures', () => {
    expect(
      normalizeRppgError({
        code: 'capture_error',
        stage: 'capture',
        message: '2D context unavailable',
        timestampMs: 1,
      }),
    ).toEqual(
      expect.objectContaining({
        code: 'canvas_unavailable',
      }),
    );
  });

  test('normalizes backend unavailable diagnostics even without an explicit error', () => {
    expect(
      normalizeRppgError(undefined, {
        backendMode: 'unavailable',
        state: {
          status: 'degraded',
          phase: 'startup',
          terminal: false,
          reason: 'backend_unavailable',
          errorCode: null,
          errorStage: null,
        },
      }),
    ).toEqual(
      expect.objectContaining({
        code: 'backend_unavailable',
        phase: 'startup',
        terminal: false,
      }),
    );
  });

  test('returns null when no error or degraded diagnostics are present', () => {
    expect(normalizeRppgError()).toBeNull();
  });
});
