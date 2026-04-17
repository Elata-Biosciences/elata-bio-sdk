export const HEADBAND_FRAME_SCHEMA_VERSION = "v1" as const;

export class ElataError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  public readonly recoverable?: boolean;
  constructor(
    code: string,
    message: string,
    options?: { recoverable?: boolean; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "ElataError";
    this.code = code;
    this.details = options?.details;
    this.recoverable = options?.recoverable;
  }
}

export function asElataError(
  value: unknown,
  fallback: { code: string; message: string } = { code: "UNKNOWN", message: "Unknown error" },
): ElataError {
  if (value instanceof ElataError) return value;
  if (value instanceof Error) {
    return new ElataError(fallback.code, fallback.message, {
      details: { originalMessage: value.message },
    });
  }
  return new ElataError(fallback.code, fallback.message);
}

export enum HeadbandTransportState {
  Idle = "idle",
  Connecting = "connecting",
  Connected = "connected",
  Streaming = "streaming",
  Degraded = "degraded",
  Reconnecting = "reconnecting",
  Disconnected = "disconnected",
  Error = "error"
}

export interface HeadbandSignalBlock {
  sampleRateHz: number;
  channelNames: string[];
  channelCount: number;
  samples: number[][];
  timestampsMs?: number[];
  clockSource?: "device" | "local";
}

export interface HeadbandEegProcessingDetails {
  applied: boolean;
  signalKind: "raw" | "processed";
  rawAvailable: boolean;
  referenceMode: "none" | "common-average" | "custom-average";
  detrendMode: "off" | "highpass" | "linear";
  notchFrequenciesHz: number[];
  stageOrder: string[];
}

export interface HeadbandBatteryBlock {
  samples: number[];
  timestampsMs?: number[];
  clockSource?: "device" | "local";
}

export interface HeadbandFrameV1 {
  schemaVersion: "v1";
  source: string;
  sequenceId: number;
  emittedAtMs: number;
  eeg: HeadbandSignalBlock;
  eegRaw?: HeadbandSignalBlock;
  eegProcessing?: HeadbandEegProcessingDetails;
  ppgRaw?: HeadbandSignalBlock;
  optics?: HeadbandSignalBlock;
  accgyro?: HeadbandSignalBlock;
  battery?: HeadbandBatteryBlock;
}

export interface HeadbandTransportStatus {
  state: HeadbandTransportState;
  atMs: number;
  reason?: string;
  errorCode?: string;
  recoverable?: boolean;
}

export interface HeadbandTransport {
  onFrame?: (frame: HeadbandFrameV1) => void;
  onStatus?: (status: HeadbandTransportStatus) => void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type EegProcessingOptions = {
  enabled?: boolean;
  preserveRaw?: boolean;
};

export class EegPreprocessor {
  constructor(private readonly options: EegProcessingOptions = {}) {}

  reset() {}
  dispose() {}

  processFrame(frame: HeadbandFrameV1): HeadbandFrameV1 {
    if (this.options.enabled === false) {
      return {
        ...frame,
        eegProcessing: {
          applied: false,
          signalKind: "raw",
          rawAvailable: false,
          referenceMode: "none",
          detrendMode: "off",
          notchFrequenciesHz: [],
          stageOrder: [],
        },
      };
    }

    const raw = {
      ...frame.eeg,
      channelNames: frame.eeg.channelNames.slice(),
      samples: frame.eeg.samples.map((row) => row.slice()),
    };
    const processed = raw.samples.map((row) => {
      const mean = row.reduce((sum, value) => sum + value, 0) / row.length;
      return row.map((value) => value - mean);
    });

    return {
      ...frame,
      eeg: {
        ...raw,
        samples: processed,
      },
      eegRaw: this.options.preserveRaw === false ? undefined : raw,
      eegProcessing: {
        applied: true,
        signalKind: "processed",
        rawAvailable: this.options.preserveRaw !== false,
        referenceMode: "common-average",
        detrendMode: "highpass",
        notchFrequenciesHz: [60, 120],
        stageOrder: ["notch", "detrend", "rereference"],
      },
    };
  }
}

export async function createEegPreprocessor(
  options: EegProcessingOptions = {},
): Promise<EegPreprocessor> {
  return new EegPreprocessor(options);
}

