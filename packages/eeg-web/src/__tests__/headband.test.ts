import {
  HEADBAND_FRAME_SCHEMA_VERSION,
  HeadbandTransportState,
  getEegChannelSamples,
  getEegInterleavedSamples,
} from '../headband';
import type {
  HeadbandFrameV1,
  HeadbandTransportStatus,
  HeadbandSignalBlock,
  HeadbandBatteryBlock,
  HeadbandTransport,
} from '../headband';

describe('headband.ts runtime values', () => {
  test('HEADBAND_FRAME_SCHEMA_VERSION equals "v1"', () => {
    expect(HEADBAND_FRAME_SCHEMA_VERSION).toBe('v1');
  });

  test('HeadbandTransportState enum has all expected values', () => {
    expect(HeadbandTransportState.Idle).toBe('idle');
    expect(HeadbandTransportState.Connecting).toBe('connecting');
    expect(HeadbandTransportState.Connected).toBe('connected');
    expect(HeadbandTransportState.Streaming).toBe('streaming');
    expect(HeadbandTransportState.Degraded).toBe('degraded');
    expect(HeadbandTransportState.Reconnecting).toBe('reconnecting');
    expect(HeadbandTransportState.Disconnected).toBe('disconnected');
    expect(HeadbandTransportState.Error).toBe('error');
  });

  test('HeadbandTransportState enum has exactly 8 members', () => {
    const values = Object.values(HeadbandTransportState);
    expect(values).toHaveLength(8);
  });
});

describe('headband.ts interface conformance (compile-time contracts)', () => {
  test('HeadbandSignalBlock shape is valid', () => {
    const block: HeadbandSignalBlock = {
      sampleRateHz: 256,
      channelNames: ['TP9', 'AF7', 'AF8', 'TP10'],
      channelCount: 4,
      samples: [[1, 2, 3, 4], [5, 6, 7, 8]],
      timestampsMs: [1000],
      clockSource: 'device',
    };
    expect(block.sampleRateHz).toBe(256);
    expect(block.channelCount).toBe(4);
  });

  test('HeadbandBatteryBlock shape is valid', () => {
    const block: HeadbandBatteryBlock = {
      samples: [95],
      timestampsMs: [2000],
      clockSource: 'local',
    };
    expect(block.samples).toEqual([95]);
  });

  test('HeadbandFrameV1 shape is valid with required and optional fields', () => {
    const frame: HeadbandFrameV1 = {
      schemaVersion: HEADBAND_FRAME_SCHEMA_VERSION,
      source: 'test-device',
      sequenceId: 1,
      emittedAtMs: Date.now(),
      eeg: {
        sampleRateHz: 256,
        channelNames: ['TP9', 'AF7', 'AF8', 'TP10'],
        channelCount: 4,
        samples: [[1, 2, 3, 4]],
      },
    };
    expect(frame.schemaVersion).toBe('v1');
    expect(frame.ppgRaw).toBeUndefined();
    expect(frame.optics).toBeUndefined();
    expect(frame.accgyro).toBeUndefined();
    expect(frame.battery).toBeUndefined();
  });

  test('HeadbandFrameV1 can expose processed and raw eeg views together', () => {
    const frame: HeadbandFrameV1 = {
      schemaVersion: HEADBAND_FRAME_SCHEMA_VERSION,
      source: 'test-device',
      sequenceId: 2,
      emittedAtMs: Date.now(),
      eeg: {
        sampleRateHz: 256,
        channelNames: ['TP9', 'AF7'],
        channelCount: 2,
        samples: [[-0.5, 0.5]],
      },
      eegRaw: {
        sampleRateHz: 256,
        channelNames: ['TP9', 'AF7'],
        channelCount: 2,
        samples: [[1, 2]],
      },
      eegProcessing: {
        applied: true,
        signalKind: 'processed',
        rawAvailable: true,
        referenceMode: 'common-average',
        detrendMode: 'highpass',
        notchFrequenciesHz: [60, 120],
        stageOrder: ['notch', 'detrend', 'rereference'],
      },
    };
    expect(frame.eegRaw?.samples).toEqual([[1, 2]]);
    expect(frame.eegProcessing?.signalKind).toBe('processed');
  });

  test('HeadbandTransportStatus shape is valid', () => {
    const status: HeadbandTransportStatus = {
      state: HeadbandTransportState.Connected,
      atMs: Date.now(),
      reason: 'test',
      errorCode: undefined,
      recoverable: true,
    };
    expect(status.state).toBe('connected');
  });

  test('HeadbandTransport interface is satisfiable', () => {
    const transport: HeadbandTransport = {
      connect: async () => {},
      disconnect: async () => {},
      start: async () => {},
      stop: async () => {},
    };
    expect(typeof transport.connect).toBe('function');
    expect(typeof transport.disconnect).toBe('function');
    expect(typeof transport.start).toBe('function');
    expect(typeof transport.stop).toBe('function');
  });

  test('getEegChannelSamples returns a single channel from sample-major rows', () => {
    const frame: HeadbandFrameV1 = {
      schemaVersion: HEADBAND_FRAME_SCHEMA_VERSION,
      source: 'test-device',
      sequenceId: 3,
      emittedAtMs: Date.now(),
      eeg: {
        sampleRateHz: 256,
        channelNames: ['TP9', 'AF7'],
        channelCount: 2,
        samples: [[1, 2], [3, 4], [5, 6]],
      },
    };
    expect(Array.from(getEegChannelSamples(frame, 1))).toEqual([2, 4, 6]);
  });

  test('getEegInterleavedSamples flattens sample-major rows', () => {
    const frame: HeadbandFrameV1 = {
      schemaVersion: HEADBAND_FRAME_SCHEMA_VERSION,
      source: 'test-device',
      sequenceId: 4,
      emittedAtMs: Date.now(),
      eeg: {
        sampleRateHz: 256,
        channelNames: ['TP9', 'AF7'],
        channelCount: 2,
        samples: [[1, 2], [3, 4]],
      },
    };
    expect(Array.from(getEegInterleavedSamples(frame))).toEqual([1, 2, 3, 4]);
  });
});
