import { initEegWasm, initEegWasmSync, wasm, HEADBAND_FRAME_SCHEMA_VERSION, HeadbandTransportState } from '../index';

describe('packages/eeg-web — index.ts', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('initEegWasm calls underlying init and returns a promise', async () => {
    const result = await initEegWasm('a-path');
    expect(result).toBeDefined();
  });

  test('initEegWasmSync delegates to initSync', () => {
    const arg = { module: 'sync-mod' } as any;
    const result = initEegWasmSync(arg);
    expect(result).toBeDefined();
  });

  test('re-exports wasm namespace from the underlying module', () => {
    expect(wasm).toBeDefined();
    expect(typeof wasm).toBe('object');
  });

  test('re-exports headband types from headband.ts', () => {
    expect(HEADBAND_FRAME_SCHEMA_VERSION).toBe('v1');
    expect(HeadbandTransportState).toBeDefined();
    expect(HeadbandTransportState.Idle).toBe('idle');
    expect(HeadbandTransportState.Error).toBe('error');
  });

  // --- NEW TESTS ---

  test('initEegWasm returns a promise (thenable)', () => {
    const p = initEegWasm('test-path');
    expect(p).toBeInstanceOf(Promise);
  });

  test('initEegWasmSync with raw BufferSource input (not wrapped in {module})', () => {
    const rawInput = new ArrayBuffer(8);
    const result = initEegWasmSync(rawInput as any);
    expect(result).toBeDefined();
  });

  test('wasm namespace contains default and initSync exports from mock', () => {
    expect(wasm).toHaveProperty('default');
    expect(wasm).toHaveProperty('initSync');
    expect(typeof (wasm as any).default).toBe('function');
    expect(typeof (wasm as any).initSync).toBe('function');
  });

  test('re-exports all 8 HeadbandTransportState enum values', () => {
    expect(HeadbandTransportState.Idle).toBe('idle');
    expect(HeadbandTransportState.Connecting).toBe('connecting');
    expect(HeadbandTransportState.Connected).toBe('connected');
    expect(HeadbandTransportState.Streaming).toBe('streaming');
    expect(HeadbandTransportState.Degraded).toBe('degraded');
    expect(HeadbandTransportState.Reconnecting).toBe('reconnecting');
    expect(HeadbandTransportState.Disconnected).toBe('disconnected');
    expect(HeadbandTransportState.Error).toBe('error');
    expect(Object.keys(HeadbandTransportState)).toHaveLength(8);
  });

  test('HEADBAND_FRAME_SCHEMA_VERSION is the literal "v1"', () => {
    const version: 'v1' = HEADBAND_FRAME_SCHEMA_VERSION;
    expect(version).toBe('v1');
  });
});
