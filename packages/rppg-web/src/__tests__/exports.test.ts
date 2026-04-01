import * as rppgWeb from '../index';

describe('@elata-biosciences/rppg-web exports', () => {
  test('exports RppgProcessor as a constructor', () => {
    expect(rppgWeb.RppgProcessor).toBeDefined();
    expect(typeof rppgWeb.RppgProcessor).toBe('function');
  });

  test('exports MuseCalibrationModel as a constructor', () => {
    expect(rppgWeb.MuseCalibrationModel).toBeDefined();
    expect(typeof rppgWeb.MuseCalibrationModel).toBe('function');
  });

  test('exports MuseFusionCalibrator as a constructor', () => {
    expect(rppgWeb.MuseFusionCalibrator).toBeDefined();
    expect(typeof rppgWeb.MuseFusionCalibrator).toBe('function');
  });

  test('exports BpmBayesTracker as a constructor', () => {
    expect(rppgWeb.BpmBayesTracker).toBeDefined();
    expect(typeof rppgWeb.BpmBayesTracker).toBe('function');
  });

  test('exports museStyleFilter as a function', () => {
    expect(rppgWeb.museStyleFilter).toBeDefined();
    expect(typeof rppgWeb.museStyleFilter).toBe('function');
  });

  test('exports DemoRunner as a constructor', () => {
    expect(rppgWeb.DemoRunner).toBeDefined();
    expect(typeof rppgWeb.DemoRunner).toBe('function');
  });

  test('exports MediaPipeFrameSource as a constructor', () => {
    expect(rppgWeb.MediaPipeFrameSource).toBeDefined();
    expect(typeof rppgWeb.MediaPipeFrameSource).toBe('function');
  });

  test('exports MediaPipeFaceFrameSource as a constructor', () => {
    expect(rppgWeb.MediaPipeFaceFrameSource).toBeDefined();
    expect(typeof rppgWeb.MediaPipeFaceFrameSource).toBe('function');
  });

  test('exports loadFaceMesh as a function', () => {
    expect(rppgWeb.loadFaceMesh).toBeDefined();
    expect(typeof rppgWeb.loadFaceMesh).toBe('function');
  });

  test('exports averageGreenInROI as a function', () => {
    expect(rppgWeb.averageGreenInROI).toBeDefined();
    expect(typeof rppgWeb.averageGreenInROI).toBe('function');
  });

  test('exports loadWasmBackend as a function', () => {
    expect(rppgWeb.loadWasmBackend).toBeDefined();
    expect(typeof rppgWeb.loadWasmBackend).toBe('function');
  });

  test('exports createRppgSession as a function', () => {
    expect(rppgWeb.createRppgSession).toBeDefined();
    expect(typeof rppgWeb.createRppgSession).toBe('function');
  });

  test('exports createManagedRppgSession as a function', () => {
    expect(rppgWeb.createManagedRppgSession).toBeDefined();
    expect(typeof rppgWeb.createManagedRppgSession).toBe('function');
  });

  test('exports computeWaveformPeriodicityProfile as a function', () => {
    expect(rppgWeb.computeWaveformPeriodicityProfile).toBeDefined();
    expect(typeof rppgWeb.computeWaveformPeriodicityProfile).toBe('function');
  });

  test('exports analyzePulseWindow as a function', () => {
    expect(rppgWeb.analyzePulseWindow).toBeDefined();
    expect(typeof rppgWeb.analyzePulseWindow).toBe('function');
  });

  test('exports normalizeRppgError as a function', () => {
    expect(rppgWeb.normalizeRppgError).toBeDefined();
    expect(typeof rppgWeb.normalizeRppgError).toBe('function');
  });

  test('exports createRppgAppAdapter as a function', () => {
    expect(rppgWeb.createRppgAppAdapter).toBeDefined();
    expect(typeof rppgWeb.createRppgAppAdapter).toBe('function');
  });

  test('exports createRppgAppMonitor as a function', () => {
    expect(rppgWeb.createRppgAppMonitor).toBeDefined();
    expect(typeof rppgWeb.createRppgAppMonitor).toBe('function');
  });

  test('exports computeTraceWaveformDebug as a function', () => {
    expect(rppgWeb.computeTraceWaveformDebug).toBeDefined();
    expect(typeof rppgWeb.computeTraceWaveformDebug).toBe('function');
  });

  test('exports ensureVideoPlaying as a function', () => {
    expect(rppgWeb.ensureVideoPlaying).toBeDefined();
    expect(typeof rppgWeb.ensureVideoPlaying).toBe('function');
  });

  test('exports replayBayesSession as a function', () => {
    expect(rppgWeb.replayBayesSession).toBeDefined();
    expect(typeof rppgWeb.replayBayesSession).toBe('function');
  });

  test('has no unexpected undefined exports', () => {
    const expectedKeys = [
      'RppgProcessor',
      'MuseCalibrationModel',
      'MuseFusionCalibrator',
      'BpmBayesTracker',
      'museStyleFilter',
      'DemoRunner',
      'MediaPipeFrameSource',
      'MediaPipeFaceFrameSource',
      'loadFaceMesh',
      'averageGreenInROI',
      'loadWasmBackend',
      'createRppgSession',
      'createManagedRppgSession',
      'computeWaveformPeriodicityProfile',
      'computeTraceWaveformDebug',
      'analyzePulseWindow',
      'normalizeRppgError',
      'createRppgAppAdapter',
      'createRppgAppMonitor',
      'ensureVideoPlaying',
      'replayBayesSession',
    ];
    for (const key of expectedKeys) {
      expect((rppgWeb as Record<string, unknown>)[key]).toBeDefined();
    }
  });
});
