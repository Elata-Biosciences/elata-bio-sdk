import { BleTransport } from '../bleTransport';
import { MuseBleDevice } from '../museDevice';

describe('@elata-biosciences/eeg-web-ble exports', () => {
  test('exports BleTransport as a constructor', () => {
    expect(BleTransport).toBeDefined();
    expect(typeof BleTransport).toBe('function');
  });

  test('exports MuseBleDevice as a constructor', () => {
    expect(MuseBleDevice).toBeDefined();
    expect(typeof MuseBleDevice).toBe('function');
  });

  test('BleTransport is instantiable with a mock device', () => {
    const fakeDevice = {
      isAthena: false,
      samplingRate: 256,
      eegNames: ['TP9', 'AF7', 'AF8', 'TP10'],
      numEegChannels: 4,
      opticsChannelCount: 0,
      prepareSession: jest.fn(async () => {}),
      releaseSession: jest.fn(async () => {}),
      startStream: jest.fn(async () => {}),
      stopStream: jest.fn(async () => {}),
      getBoardInfo: jest.fn(() => ({ device_name: 'test' })),
      getCharacteristicInfo: jest.fn(() => ({ characteristics: [] })),
    };
    const transport = new BleTransport({ device: fakeDevice as any });
    expect(transport).toBeInstanceOf(BleTransport);
  });
});
