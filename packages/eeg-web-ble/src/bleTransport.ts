import {
  HEADBAND_FRAME_SCHEMA_VERSION,
  HeadbandTransportState
} from "@elata/eeg-web";
import type {
  HeadbandFrameV1,
  HeadbandBatteryBlock,
  HeadbandSignalBlock,
  HeadbandTransport,
  HeadbandTransportStatus
} from "@elata/eeg-web";
import type { AthenaAuxPacket, MuseDeviceOptions } from "./museDevice";
import { MuseBleDevice } from "./museDevice";

interface PpgPacket {
  sequence: number;
  samples: number[];
}

interface InterleavedPpgPacket {
  sequence: number;
  ir: number[];
  nearIr: number[];
  red: number[];
}

type PpgInput = PpgPacket | InterleavedPpgPacket | AthenaAuxPacket;

export interface BleTransportOptions {
  deviceOptions?: MuseDeviceOptions;
  sourceName?: string;
  device?: BleDeviceLike;
}

interface BleDeviceLike {
  isAthena: boolean;
  samplingRate: number;
  eegNames: string[];
  numEegChannels: number;
  opticsChannelCount: number;
  getBoardInfo(): unknown;
  getCharacteristicInfo(): unknown;
  prepareSession(): Promise<void>;
  releaseSession(): Promise<void>;
  startStream(
    callback: (samples: number[][]) => void,
    ppgCallback: (channelName: string, packet: unknown) => void
  ): Promise<void>;
  stopStream(): Promise<void>;
}

export class BleTransport implements HeadbandTransport {
  public onFrame?: HeadbandTransport["onFrame"];
  public onStatus?: (status: HeadbandTransportStatus) => void;

  private readonly device: BleDeviceLike;
  private readonly sourceName: string;
  private sequenceId = 0;
  private pendingPpgRows: number[][] = [];
  private pendingOptics: HeadbandSignalBlock | null = null;
  private pendingAccgyro: HeadbandSignalBlock | null = null;
  private pendingBattery: HeadbandBatteryBlock | null = null;
  private ppgPerChannel: Record<"PPG1" | "PPG2" | "PPG3", number[]> = {
    PPG1: [],
    PPG2: [],
    PPG3: []
  };

  constructor(options: BleTransportOptions = {}) {
    this.sourceName = options.sourceName || "muse-ble";
    this.device = options.device || new MuseBleDevice({
      ...(options.deviceOptions || {}),
      onDisconnected: () => {
        this.emitStatus(HeadbandTransportState.Disconnected, "gatt disconnected", "BLE_GATT_DISCONNECTED", true);
      }
    });
  }

  getBoardInfo() {
    return this.device.getBoardInfo();
  }

  getCharacteristicInfo() {
    return this.device.getCharacteristicInfo();
  }

  getIsAthena(): boolean {
    return this.device.isAthena;
  }

  getEegNames(): string[] {
    return this.device.eegNames.slice();
  }

  getOpticsChannelCount(): number {
    return this.device.opticsChannelCount;
  }

  private emitStatus(
    state: HeadbandTransportState,
    reason?: string,
    errorCode?: string,
    recoverable?: boolean
  ): void {
    if (!this.onStatus) return;
    this.onStatus({
      state,
      atMs: performance.now(),
      reason,
      errorCode,
      recoverable
    });
  }

  private rowsFromFlat(samples: number[], channelCount: number): number[][] {
    if (!samples || !channelCount || channelCount <= 0) return [];
    const out: number[][] = [];
    const sampleCount = Math.floor(samples.length / channelCount);
    for (let i = 0; i < sampleCount; i++) {
      const row = new Array(channelCount);
      const base = i * channelCount;
      for (let ch = 0; ch < channelCount; ch++) row[ch] = samples[base + ch];
      out.push(row);
    }
    return out;
  }

  private collectPerChannelPpg(): void {
    const minLen = Math.min(
      this.ppgPerChannel.PPG1.length,
      this.ppgPerChannel.PPG2.length,
      this.ppgPerChannel.PPG3.length
    );
    if (minLen <= 0) return;
    const rows: number[][] = [];
    for (let i = 0; i < minLen; i++) {
      rows.push([
        this.ppgPerChannel.PPG1.shift() as number,
        this.ppgPerChannel.PPG2.shift() as number,
        this.ppgPerChannel.PPG3.shift() as number
      ]);
    }
    this.pendingPpgRows.push(...rows);
  }

  private handlePpg(channelName: string, packet: PpgInput): void {
    if (!packet) return;
    if (channelName === "athena") {
      const athena = packet as AthenaAuxPacket;
      const optics = athena.optics;
      if (optics && optics.samples.length > 0) {
        const channelCount = optics.channel_count || this.device.opticsChannelCount || 0;
        const rows = this.rowsFromFlat(optics.samples, channelCount);
        if (rows.length > 0) {
          this.pendingOptics = {
            sampleRateHz: 64,
            channelNames: Array.from({ length: channelCount }, (_, i) => `OPTICS${i + 1}`),
            channelCount,
            samples: rows,
            timestampsMs: optics.timestamps_ms || [],
            clockSource: "device"
          };
        }
      }
      const accgyro = athena.accgyro;
      if (accgyro && accgyro.samples.length > 0) {
        const rows = this.rowsFromFlat(accgyro.samples, 6);
        if (rows.length > 0) {
          this.pendingAccgyro = {
            sampleRateHz: 52,
            channelNames: ["ACC_X", "ACC_Y", "ACC_Z", "GYRO_X", "GYRO_Y", "GYRO_Z"],
            channelCount: 6,
            samples: rows,
            timestampsMs: accgyro.timestamps_ms || [],
            clockSource: "device"
          };
        }
      }
      const battery = athena.battery;
      if (battery && battery.samples.length > 0) {
        this.pendingBattery = {
          samples: battery.samples.slice(),
          timestampsMs: battery.timestamps_ms || [],
          clockSource: "device"
        };
      }
      return;
    }

    if (channelName === "interleaved") {
      const interleaved = packet as InterleavedPpgPacket;
      const count = Math.min(interleaved.ir.length, interleaved.nearIr.length, interleaved.red.length);
      for (let i = 0; i < count; i++) {
        this.pendingPpgRows.push([interleaved.ir[i], interleaved.nearIr[i], interleaved.red[i]]);
      }
      return;
    }

    if (channelName !== "PPG1" && channelName !== "PPG2" && channelName !== "PPG3") return;
    const ppg = packet as PpgPacket;
    if (!ppg.samples || ppg.samples.length === 0) return;
    this.ppgPerChannel[channelName].push(...ppg.samples);
    this.collectPerChannelPpg();
  }

  async connect(): Promise<void> {
    this.emitStatus(HeadbandTransportState.Connecting);
    await this.device.prepareSession();
    this.emitStatus(HeadbandTransportState.Connected);
  }

  async disconnect(): Promise<void> {
    await this.device.releaseSession();
    this.emitStatus(HeadbandTransportState.Disconnected);
  }

  async start(): Promise<void> {
    this.emitStatus(HeadbandTransportState.Streaming);
    await this.device.startStream((samples) => {
      this.sequenceId += 1;
      const frame: HeadbandFrameV1 = {
        schemaVersion: HEADBAND_FRAME_SCHEMA_VERSION,
        source: this.sourceName,
        sequenceId: this.sequenceId,
        emittedAtMs: performance.now(),
        eeg: {
          sampleRateHz: this.device.samplingRate,
          channelNames: this.device.eegNames.slice(),
          channelCount: this.device.numEegChannels,
          samples: samples.map((row) => row.slice()),
          clockSource: this.device.isAthena ? "device" : "local"
        }
      };

      if (this.pendingPpgRows.length > 0) {
        frame.ppgRaw = {
          sampleRateHz: 64,
          channelNames: ["PPG1", "PPG2", "PPG3"],
          channelCount: 3,
          samples: this.pendingPpgRows.splice(0, this.pendingPpgRows.length),
          clockSource: "local"
        };
      }
      if (this.pendingOptics) {
        frame.optics = this.pendingOptics;
        this.pendingOptics = null;
      }
      if (this.pendingAccgyro) {
        frame.accgyro = this.pendingAccgyro;
        this.pendingAccgyro = null;
      }
      if (this.pendingBattery) {
        frame.battery = this.pendingBattery;
        this.pendingBattery = null;
      }

      if (this.onFrame && frame.eeg.samples.length > 0) this.onFrame(frame);
    }, (channelName, packet) => {
      this.handlePpg(channelName, packet as PpgInput);
    });
  }

  async stop(): Promise<void> {
    await this.device.stopStream();
    this.emitStatus(HeadbandTransportState.Connected);
  }
}
