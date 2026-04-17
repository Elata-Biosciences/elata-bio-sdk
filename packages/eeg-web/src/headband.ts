export const HEADBAND_FRAME_SCHEMA_VERSION = "v1" as const;

export type HeadbandFrameSchemaVersion = typeof HEADBAND_FRAME_SCHEMA_VERSION;

export type HeadbandClockSource = "device" | "local";
export type HeadbandEegSignalKind = "raw" | "processed";
export type HeadbandEegSignalSource = "auto" | "raw" | "processed";
export type HeadbandEegReferenceMode =
	| "none"
	| "common-average"
	| "custom-average";
export type HeadbandEegDetrendMode = "off" | "highpass" | "linear";

export interface HeadbandSignalBlock {
	sampleRateHz: number;
	channelNames: string[];
	channelCount: number;
	/** Per-sample rows. Layout: samples[sampleIdx][channelIdx] */
	samples: number[][];
	timestampsMs?: number[];
	clockSource?: HeadbandClockSource;
}

export interface HeadbandBatteryBlock {
	samples: number[];
	timestampsMs?: number[];
	clockSource?: HeadbandClockSource;
}

export interface HeadbandEegProcessingDetails {
	applied: boolean;
	signalKind: HeadbandEegSignalKind;
	rawAvailable: boolean;
	referenceMode: HeadbandEegReferenceMode;
	detrendMode: HeadbandEegDetrendMode;
	notchFrequenciesHz: number[];
	stageOrder: string[];
}

export interface HeadbandFrameV1 {
	schemaVersion: HeadbandFrameSchemaVersion;
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

export enum HeadbandTransportState {
	Idle = "idle",
	Connecting = "connecting",
	Connected = "connected",
	Streaming = "streaming",
	Degraded = "degraded",
	Reconnecting = "reconnecting",
	Disconnected = "disconnected",
	Error = "error",
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

export function getEegSignalBlock(
	frame: HeadbandFrameV1,
	source: HeadbandEegSignalSource = "auto",
): HeadbandSignalBlock {
	if (source === "raw") {
		return frame.eegRaw ?? frame.eeg;
	}
	if (source === "processed") {
		return frame.eeg;
	}
	return frame.eeg;
}

export function getEegChannelSamples(
	frame: HeadbandFrameV1,
	channelIndex: number,
	source: HeadbandEegSignalSource = "auto",
): Float32Array {
	const signal = getEegSignalBlock(frame, source);
	const out = new Float32Array(signal.samples.length);
	for (let sampleIdx = 0; sampleIdx < signal.samples.length; sampleIdx++) {
		out[sampleIdx] = signal.samples[sampleIdx]?.[channelIndex] ?? 0;
	}
	return out;
}

export function getEegInterleavedSamples(
	frame: HeadbandFrameV1,
	source: HeadbandEegSignalSource = "auto",
): Float32Array {
	const signal = getEegSignalBlock(frame, source);
	const out = new Float32Array(signal.samples.length * signal.channelCount);
	for (let sampleIdx = 0; sampleIdx < signal.samples.length; sampleIdx++) {
		const row = signal.samples[sampleIdx] ?? [];
		for (let channelIdx = 0; channelIdx < signal.channelCount; channelIdx++) {
			out[sampleIdx * signal.channelCount + channelIdx] =
				row[channelIdx] ?? 0;
		}
	}
	return out;
}
