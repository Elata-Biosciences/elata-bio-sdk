import {
  initEegWasm,
  initEegWasmSync,
  wasm,
  HEADBAND_FRAME_SCHEMA_VERSION,
  HeadbandTransportState,
} from '../index';

describe('@elata-biosciences/eeg-web exports', () => {
  test('exports initEegWasm as a function', () => {
    expect(initEegWasm).toBeDefined();
    expect(typeof initEegWasm).toBe('function');
  });

  test('exports initEegWasmSync as a function', () => {
    expect(initEegWasmSync).toBeDefined();
    expect(typeof initEegWasmSync).toBe('function');
  });

  test('exports wasm namespace object', () => {
    expect(wasm).toBeDefined();
    expect(typeof wasm).toBe('object');
  });

  test('exports HEADBAND_FRAME_SCHEMA_VERSION with value "v1"', () => {
    expect(HEADBAND_FRAME_SCHEMA_VERSION).toBe('v1');
  });

  test('exports HeadbandTransportState enum with expected values', () => {
    expect(HeadbandTransportState).toBeDefined();
    expect(HeadbandTransportState.Idle).toBe('idle');
    expect(HeadbandTransportState.Connecting).toBe('connecting');
    expect(HeadbandTransportState.Connected).toBe('connected');
    expect(HeadbandTransportState.Streaming).toBe('streaming');
    expect(HeadbandTransportState.Degraded).toBe('degraded');
    expect(HeadbandTransportState.Reconnecting).toBe('reconnecting');
    expect(HeadbandTransportState.Disconnected).toBe('disconnected');
    expect(HeadbandTransportState.Error).toBe('error');
  });
});
