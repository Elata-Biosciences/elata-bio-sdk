import { MuseBleDevice } from '../museDevice';
import type { MuseBoardInfo, MuseCharacteristicInfo } from '../museDevice';

const CHAR_UUIDS = {
  command: '273e0001-4c4d-454d-96be-f03bac821358',
  tp9: '273e0003-4c4d-454d-96be-f03bac821358',
  af7: '273e0004-4c4d-454d-96be-f03bac821358',
  af8: '273e0005-4c4d-454d-96be-f03bac821358',
  tp10: '273e0006-4c4d-454d-96be-f03bac821358',
  ppg1: '273e000f-4c4d-454d-96be-f03bac821358',
  ppg2: '273e0010-4c4d-454d-96be-f03bac821358',
  ppg3: '273e0011-4c4d-454d-96be-f03bac821358',
  athenaEeg: '273e0013-4c4d-454d-96be-f03bac821358',
  athenaOther: '273e0014-4c4d-454d-96be-f03bac821358',
};

function createFakeCharacteristic(uuid: string) {
  const listeners: Record<string, Function[]> = {};
  return {
    uuid,
    value: null as DataView | null,
    startNotifications: jest.fn(async function (this: any) { return this; }),
    stopNotifications: jest.fn(async function (this: any) { return this; }),
    addEventListener: jest.fn((type: string, fn: Function) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    }),
    writeValue: jest.fn(async () => {}),
    writeValueWithoutResponse: jest.fn(async () => {}),
    _emit(type: string, data: Uint8Array) {
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      this.value = dv;
      for (const fn of (listeners[type] || [])) {
        fn({ target: this });
      }
    },
    _removeWriteWithoutResponse() {
      (this as any).writeValueWithoutResponse = undefined;
    },
  };
}

function createFakeBluetoothEnv(opts: {
  isAthena?: boolean;
  ppgCharCount?: number;
  deviceName?: string;
} = {}) {
  const { isAthena = false, ppgCharCount = 0, deviceName = 'Muse-Test' } = opts;

  const chars: Record<string, ReturnType<typeof createFakeCharacteristic>> = {};
  chars[CHAR_UUIDS.command] = createFakeCharacteristic(CHAR_UUIDS.command);

  if (isAthena) {
    chars[CHAR_UUIDS.athenaEeg] = createFakeCharacteristic(CHAR_UUIDS.athenaEeg);
    chars[CHAR_UUIDS.athenaOther] = createFakeCharacteristic(CHAR_UUIDS.athenaOther);
  } else {
    chars[CHAR_UUIDS.tp9] = createFakeCharacteristic(CHAR_UUIDS.tp9);
    chars[CHAR_UUIDS.af7] = createFakeCharacteristic(CHAR_UUIDS.af7);
    chars[CHAR_UUIDS.af8] = createFakeCharacteristic(CHAR_UUIDS.af8);
    chars[CHAR_UUIDS.tp10] = createFakeCharacteristic(CHAR_UUIDS.tp10);
    if (ppgCharCount >= 1) chars[CHAR_UUIDS.ppg1] = createFakeCharacteristic(CHAR_UUIDS.ppg1);
    if (ppgCharCount >= 2) chars[CHAR_UUIDS.ppg2] = createFakeCharacteristic(CHAR_UUIDS.ppg2);
    if (ppgCharCount >= 3) chars[CHAR_UUIDS.ppg3] = createFakeCharacteristic(CHAR_UUIDS.ppg3);
  }

  const allCharsList = Object.values(chars);

  const fakeService = {
    getCharacteristics: jest.fn(async () => allCharsList),
    getCharacteristic: jest.fn(async (uuid: string) => {
      const c = chars[uuid];
      if (!c) throw new Error(`Characteristic ${uuid} not found`);
      return c;
    }),
  };

  const disconnectListeners: Function[] = [];
  const fakeDevice = {
    name: deviceName,
    gatt: {
      connected: true,
      connect: jest.fn(async function (this: any) { return this; }),
      disconnect: jest.fn(() => {
        fakeDevice.gatt.connected = false;
        for (const fn of disconnectListeners) fn({});
      }),
      getPrimaryService: jest.fn(async () => fakeService),
    },
    addEventListener: jest.fn((type: string, fn: Function) => {
      if (type === 'gattserverdisconnected') disconnectListeners.push(fn);
    }),
  };

  const fakeBluetooth = {
    requestDevice: jest.fn(async () => fakeDevice),
  };

  return { chars, fakeDevice, fakeService, fakeBluetooth, disconnectListeners };
}

function setNavigatorBluetooth(bt: any) {
  Object.defineProperty(navigator, 'bluetooth', {
    value: bt,
    writable: true,
    configurable: true,
  });
}

function clearNavigatorBluetooth() {
  Object.defineProperty(navigator, 'bluetooth', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

describe('MuseBleDevice', () => {
  afterEach(() => {
    clearNavigatorBluetooth();
  });

  describe('construction defaults', () => {
    test('has correct default state', () => {
      const device = new MuseBleDevice();
      expect(device.isAthena).toBe(false);
      expect(device.protocol).toBe('classic');
      expect(device.samplingRate).toBe(256);
      expect(device.numEegChannels).toBe(4);
      expect(device.eegNames).toEqual(['TP9', 'AF7', 'AF8', 'TP10']);
      expect(device.ppgMode).toBe('none');
      expect(device.opticsChannelCount).toBe(0);
    });

    test('constructor accepts logger and onDisconnected callbacks', () => {
      const logger = jest.fn();
      const onDisconnected = jest.fn();
      const device = new MuseBleDevice({ logger, onDisconnected });
      expect(device).toBeDefined();
    });
  });

  describe('getBoardInfo()', () => {
    test('returns valid MuseBoardInfo before connection', () => {
      const device = new MuseBleDevice();
      const info: MuseBoardInfo = device.getBoardInfo();
      expect(info.sample_rate_hz).toBe(256);
      expect(info.channel_count).toBe(4);
      expect(info.eeg_channel_names).toEqual(['TP9', 'AF7', 'AF8', 'TP10']);
      expect(info.protocol).toBe('classic');
    });

    test('reports synthetic board_id for Muse-Synthetic devices', async () => {
      const env = createFakeBluetoothEnv({ deviceName: 'Muse-Synthetic' });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();

      const info = device.getBoardInfo();
      expect(info.board_id).toBe(-1);
      expect(info.device_name).toContain('Muse-Synthetic');
      await device.releaseSession();
    });

    test('reports board_id 21 for classic non-synthetic device', async () => {
      const env = createFakeBluetoothEnv({ deviceName: 'Muse-S' });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();

      const info = device.getBoardInfo();
      expect(info.board_id).toBe(21);
      expect(info.device_name).toContain('Muse-S');
      await device.releaseSession();
    });
  });

  describe('getCharacteristicInfo()', () => {
    test('returns empty characteristics before connection', () => {
      const device = new MuseBleDevice();
      const info: MuseCharacteristicInfo = device.getCharacteristicInfo();
      expect(info.characteristics).toEqual([]);
      expect(info.protocol).toBe('classic');
    });
  });

  describe('prepareSession()', () => {
    test('throws when navigator.bluetooth is unavailable', async () => {
      clearNavigatorBluetooth();
      const device = new MuseBleDevice();
      await expect(device.prepareSession()).rejects.toThrow('Web Bluetooth not available');
    });

    test('classic path sets protocol and detects no PPG', async () => {
      const env = createFakeBluetoothEnv({ isAthena: false, ppgCharCount: 0 });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();

      expect(device.protocol).toBe('classic');
      expect(device.isAthena).toBe(false);
      expect(device.numEegChannels).toBe(4);
      expect(device.ppgMode).toBe('none');
      expect(device.availableCharacteristics.length).toBeGreaterThan(0);

      await device.releaseSession();
    });

    test('classic path detects interleaved PPG with 1 char', async () => {
      const env = createFakeBluetoothEnv({ isAthena: false, ppgCharCount: 1 });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();

      expect(device.ppgMode).toBe('interleaved');

      await device.releaseSession();
    });

    test('classic path detects per-channel PPG with 3 chars', async () => {
      const env = createFakeBluetoothEnv({ isAthena: false, ppgCharCount: 3 });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();

      expect(device.ppgMode).toBe('per-channel');

      await device.releaseSession();
    });

    test('athena path sets protocol and channels correctly', async () => {
      const env = createFakeBluetoothEnv({ isAthena: true });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();

      expect(device.protocol).toBe('athena');
      expect(device.isAthena).toBe(true);
      expect(device.numEegChannels).toBe(8);
      expect(device.opticsChannelCount).toBe(8);
      expect(device.ppgMode).toBe('athena');
      expect(device.eegNames).toEqual(['TP9', 'AF7', 'AF8', 'TP10', 'AUX1', 'AUX2', 'AUX3', 'AUX4']);

      await device.releaseSession();
    });
  });

  describe('releaseSession()', () => {
    test('resets state after release', async () => {
      const env = createFakeBluetoothEnv({ isAthena: true });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();
      expect(device.isAthena).toBe(true);

      await device.releaseSession();
      expect(device.isAthena).toBe(false);
      expect(device.protocol).toBe('classic');
      expect(device.opticsChannelCount).toBe(0);
    });
  });

  describe('EEG decoding via classic startStream', () => {
    test('decodes EEG packet bytes into sample values', async () => {
      const env = createFakeBluetoothEnv({ isAthena: false });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();

      const received: number[][] = [];
      await device.startStream((samples) => {
        received.push(...samples);
      });

      const packet = new Uint8Array(20);
      packet[0] = 0;
      packet[1] = 0;
      for (let i = 2; i < 20; i += 3) {
        packet[i] = 0x80;
        packet[i + 1] = 0x08;
        packet[i + 2] = 0x00;
      }

      for (const uuid of [CHAR_UUIDS.tp9, CHAR_UUIDS.af7, CHAR_UUIDS.af8, CHAR_UUIDS.tp10]) {
        env.chars[uuid]._emit('characteristicvaluechanged', packet);
      }

      expect(received.length).toBeGreaterThan(0);
      for (const row of received) {
        for (const val of row) {
          expect(val).toBeCloseTo(0, 5);
        }
      }

      await device.stopStream();
      await device.releaseSession();
    });
  });

  describe('startStream guards', () => {
    test('startStream when already streaming is a no-op', async () => {
      const env = createFakeBluetoothEnv({ isAthena: false });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();

      const cb = jest.fn();
      await device.startStream(cb);
      await device.startStream(cb);

      // Only the first call should set up notifications
      const tp9 = env.chars[CHAR_UUIDS.tp9];
      expect(tp9.startNotifications).toHaveBeenCalledTimes(1);

      await device.stopStream();
      await device.releaseSession();
    });

    test('startStream when not connected throws', async () => {
      const env = createFakeBluetoothEnv({ isAthena: false });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      // Do NOT call prepareSession → commandChar is null
      await expect(device.startStream(jest.fn())).rejects.toThrow('Muse not connected');
    });
  });

  describe('stopStream', () => {
    test('stops notifications on all characteristics', async () => {
      const env = createFakeBluetoothEnv({ isAthena: false, ppgCharCount: 1 });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();
      await device.startStream(jest.fn());

      await device.stopStream();

      for (const uuid of [CHAR_UUIDS.tp9, CHAR_UUIDS.af7, CHAR_UUIDS.af8, CHAR_UUIDS.tp10]) {
        expect(env.chars[uuid].stopNotifications).toHaveBeenCalled();
      }
      expect(env.chars[CHAR_UUIDS.ppg1].stopNotifications).toHaveBeenCalled();

      await device.releaseSession();
    });

    test('stopStream when not streaming is a no-op', async () => {
      const env = createFakeBluetoothEnv({ isAthena: false });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();
      // Don't start stream
      await device.stopStream();
      // Should not throw
      expect(true).toBe(true);
      await device.releaseSession();
    });
  });

  describe('PPG interleaved streaming', () => {
    test('delivers PPG packets through ppgCallback in interleaved mode', async () => {
      const env = createFakeBluetoothEnv({ isAthena: false, ppgCharCount: 1 });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();

      const ppgPackets: any[] = [];
      await device.startStream(jest.fn(), (channelName, packet) => {
        ppgPackets.push({ channelName, packet });
      });

      // Build a valid 20-byte PPG packet
      const ppgData = new Uint8Array(20);
      ppgData[0] = 0; ppgData[1] = 5; // sequence=5
      for (let i = 2; i < 20; i += 3) {
        ppgData[i] = 0x01;
        ppgData[i + 1] = 0x00;
        ppgData[i + 2] = 0x64;
      }
      env.chars[CHAR_UUIDS.ppg1]._emit('characteristicvaluechanged', ppgData);

      expect(ppgPackets.length).toBeGreaterThan(0);
      expect(ppgPackets[0].channelName).toBe('interleaved');
      expect(ppgPackets[0].packet).toHaveProperty('ir');
      expect(ppgPackets[0].packet).toHaveProperty('nearIr');
      expect(ppgPackets[0].packet).toHaveProperty('red');

      await device.stopStream();
      await device.releaseSession();
    });
  });

  describe('PPG per-channel streaming', () => {
    test('delivers PPG packets per channel with 3 chars', async () => {
      const env = createFakeBluetoothEnv({ isAthena: false, ppgCharCount: 3 });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();

      const ppgPackets: any[] = [];
      await device.startStream(jest.fn(), (channelName, packet) => {
        ppgPackets.push({ channelName, packet });
      });

      const ppgData = new Uint8Array(20);
      ppgData[0] = 0; ppgData[1] = 1;
      for (let i = 2; i < 20; i += 3) {
        ppgData[i] = 0x00;
        ppgData[i + 1] = 0x01;
        ppgData[i + 2] = 0x00;
      }
      env.chars[CHAR_UUIDS.ppg1]._emit('characteristicvaluechanged', ppgData);
      env.chars[CHAR_UUIDS.ppg2]._emit('characteristicvaluechanged', ppgData);
      env.chars[CHAR_UUIDS.ppg3]._emit('characteristicvaluechanged', ppgData);

      expect(ppgPackets.length).toBe(3);
      expect(ppgPackets[0].channelName).toBe('PPG1');
      expect(ppgPackets[1].channelName).toBe('PPG2');
      expect(ppgPackets[2].channelName).toBe('PPG3');

      await device.stopStream();
      await device.releaseSession();
    });
  });

  describe('PPG short packet', () => {
    test('decodePpgPacket handles packet shorter than 20 bytes gracefully', async () => {
      const env = createFakeBluetoothEnv({ isAthena: false, ppgCharCount: 1 });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();

      const ppgPackets: any[] = [];
      await device.startStream(jest.fn(), (channelName, packet) => {
        ppgPackets.push({ channelName, packet });
      });

      // Emit a short packet (< 20 bytes)
      const shortPacket = new Uint8Array(10);
      env.chars[CHAR_UUIDS.ppg1]._emit('characteristicvaluechanged', shortPacket);

      // Should not crash, and should produce an empty-samples packet (which is filtered out)
      expect(ppgPackets.length).toBe(0);

      await device.stopStream();
      await device.releaseSession();
    });
  });

  describe('sendCommand fallback', () => {
    test('falls back to writeValue when writeValueWithoutResponse is undefined', async () => {
      const env = createFakeBluetoothEnv({ isAthena: false });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();

      // Remove writeValueWithoutResponse from the command characteristic
      env.chars[CHAR_UUIDS.command]._removeWriteWithoutResponse();

      await device.startStream(jest.fn());

      // After startStream, sendCommand("v1"), sendCommand("p21"), sendCommand("d") are called
      expect(env.chars[CHAR_UUIDS.command].writeValue).toHaveBeenCalled();

      await device.stopStream();
      await device.releaseSession();
    });
  });

  describe('GATT disconnect handler', () => {
    test('fires onDisconnected and logger on GATT disconnect', async () => {
      const env = createFakeBluetoothEnv({ isAthena: false });
      setNavigatorBluetooth(env.fakeBluetooth);

      const logger = jest.fn();
      const onDisconnected = jest.fn();
      const device = new MuseBleDevice({ sleepMs: async () => {}, logger, onDisconnected });
      await device.prepareSession();

      // Trigger GATT disconnect
      env.fakeDevice.gatt.disconnect();

      expect(logger).toHaveBeenCalledWith('gatt disconnected');
      expect(onDisconnected).toHaveBeenCalled();
    });
  });

  describe('Athena startStream', () => {
    test('athena startStream requires decoder factory', async () => {
      const env = createFakeBluetoothEnv({ isAthena: true });
      setNavigatorBluetooth(env.fakeBluetooth);

      const device = new MuseBleDevice({ sleepMs: async () => {} });
      await device.prepareSession();

      await expect(device.startStream(jest.fn())).rejects.toThrow('Athena support requires an Athena decoder factory');

      await device.releaseSession();
    });

    test('athena startStream with decoder factory delivers EEG', async () => {
      const env = createFakeBluetoothEnv({ isAthena: true });
      setNavigatorBluetooth(env.fakeBluetooth);

      const fakeDecoder = {
        reset: jest.fn(),
        decode: jest.fn((data: Uint8Array) => ({
          eeg_samples: () => [1, 2, 3, 4, 5, 6, 7, 8],
          eeg_channel_count: () => 8,
          optics_samples: () => [],
          optics_channel_count: () => 0,
          accgyro_samples: () => [],
          battery_samples: () => [],
        })),
        set_use_device_timestamps: jest.fn(),
        set_clock_kind: jest.fn(),
        set_reorder_window_ms: jest.fn(),
      };

      const device = new MuseBleDevice({
        sleepMs: async () => {},
        athenaDecoderFactory: () => fakeDecoder,
      });
      await device.prepareSession();

      const received: number[][] = [];
      await device.startStream((samples) => {
        received.push(...samples);
      });

      // Emit data on athena EEG characteristic
      const packet = new Uint8Array(20);
      env.chars[CHAR_UUIDS.athenaEeg]._emit('characteristicvaluechanged', packet);

      expect(fakeDecoder.decode).toHaveBeenCalled();
      expect(received.length).toBeGreaterThan(0);
      expect(received[0]).toHaveLength(8);

      await device.stopStream();
      await device.releaseSession();
    });

    test('athena startStream delivers aux packets (optics, accgyro, battery)', async () => {
      const env = createFakeBluetoothEnv({ isAthena: true });
      setNavigatorBluetooth(env.fakeBluetooth);

      const fakeDecoder = {
        reset: jest.fn(),
        decode: jest.fn(() => ({
          eeg_samples: () => [],
          eeg_channel_count: () => 0,
          optics_samples: () => [10, 20, 30, 40],
          optics_channel_count: () => 2,
          optics_timestamps_ms: () => [100, 110],
          accgyro_samples: () => [1, 2, 3, 4, 5, 6],
          accgyro_timestamps_ms: () => [120],
          battery_samples: () => [95],
          battery_timestamps_ms: () => [130],
        })),
        set_use_device_timestamps: jest.fn(),
        set_clock_kind: jest.fn(),
        set_reorder_window_ms: jest.fn(),
      };

      const device = new MuseBleDevice({
        sleepMs: async () => {},
        athenaDecoderFactory: () => fakeDecoder,
      });
      await device.prepareSession();

      const auxPackets: any[] = [];
      await device.startStream(jest.fn(), (channelName, packet) => {
        auxPackets.push({ channelName, packet });
      });

      env.chars[CHAR_UUIDS.athenaOther]._emit('characteristicvaluechanged', new Uint8Array(20));

      expect(auxPackets.length).toBe(1);
      expect(auxPackets[0].channelName).toBe('athena');
      const aux = auxPackets[0].packet;
      expect(aux.optics.samples).toEqual([10, 20, 30, 40]);
      expect(aux.optics.channel_count).toBe(2);
      expect(aux.accgyro.samples).toEqual([1, 2, 3, 4, 5, 6]);
      expect(aux.battery.samples).toEqual([95]);

      await device.stopStream();
      await device.releaseSession();
    });
  });

  describe('Athena decoder error handling', () => {
    test('decode error is logged and does not crash', async () => {
      const env = createFakeBluetoothEnv({ isAthena: true });
      setNavigatorBluetooth(env.fakeBluetooth);

      const logger = jest.fn();
      const fakeDecoder = {
        reset: jest.fn(),
        decode: jest.fn(() => { throw new Error('decode failure'); }),
        set_use_device_timestamps: jest.fn(),
        set_clock_kind: jest.fn(),
        set_reorder_window_ms: jest.fn(),
      };

      const device = new MuseBleDevice({
        sleepMs: async () => {},
        logger,
        athenaDecoderFactory: () => fakeDecoder,
      });
      await device.prepareSession();
      await device.startStream(jest.fn());

      env.chars[CHAR_UUIDS.athenaEeg]._emit('characteristicvaluechanged', new Uint8Array(20));

      expect(logger).toHaveBeenCalledWith(expect.stringContaining('athena decode error'));

      await device.stopStream();
      await device.releaseSession();
    });
  });
});
