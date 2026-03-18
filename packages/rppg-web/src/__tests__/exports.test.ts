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

  test('exports computeWaveformPeriodicityProfile as a function', () => {
    expect(rppgWeb.computeWaveformPeriodicityProfile).toBeDefined();
    expect(typeof rppgWeb.computeWaveformPeriodicityProfile).toBe('function');
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
      'computeWaveformPeriodicityProfile',
      'replayBayesSession',
    ];
    for (const key of expectedKeys) {
      expect((rppgWeb as Record<string, unknown>)[key]).toBeDefined();
    }
  });
});
