export declare const HEADBAND_FRAME_SCHEMA_VERSION: "v1";
export type HeadbandFrameSchemaVersion = typeof HEADBAND_FRAME_SCHEMA_VERSION;
export type HeadbandClockSource = "device" | "local";
export interface HeadbandSignalBlock {
    sampleRateHz: number;
    channelNames: string[];
    channelCount: number;
    samples: number[][];
    timestampsMs?: number[];
    clockSource?: HeadbandClockSource;
}
export interface HeadbandBatteryBlock {
    samples: number[];
    timestampsMs?: number[];
    clockSource?: HeadbandClockSource;
}
export interface HeadbandFrameV1 {
    schemaVersion: HeadbandFrameSchemaVersion;
    source: string;
    sequenceId: number;
    emittedAtMs: number;
    eeg: HeadbandSignalBlock;
    ppgRaw?: HeadbandSignalBlock;
    optics?: HeadbandSignalBlock;
    accgyro?: HeadbandSignalBlock;
    battery?: HeadbandBatteryBlock;
}
export declare enum HeadbandTransportState {
    Idle = "idle",
    Connecting = "connecting",
    Connected = "connected",
    Streaming = "streaming",
    Degraded = "degraded",
    Reconnecting = "reconnecting",
    Disconnected = "disconnected",
    Error = "error"
}
export interface HeadbandTransportStatus {
    state: HeadbandTransportState;
    atMs: number;
    reason?: string;
    errorCode?: string;
    recoverable?: boolean;
    details?: Record<string, unknown>;
}
export interface HeadbandTransport {
    onFrame?: (frame: HeadbandFrameV1) => void;
    onStatus?: (status: HeadbandTransportStatus) => void;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=headband.d.ts.map