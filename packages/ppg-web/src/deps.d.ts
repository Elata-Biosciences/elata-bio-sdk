declare module "@elata-biosciences/eeg-web" {
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
		schemaVersion: "v1";
		source: string;
		sequenceId: number;
		emittedAtMs: number;
		eeg: HeadbandSignalBlock;
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
}

declare module "@elata-biosciences/eeg-web-ble" {
	import type { HeadbandTransport } from "@elata-biosciences/eeg-web";

	export interface MuseDeviceOptions {
		athenaDecoderFactory?: () => unknown;
	}

	export class BleTransport implements HeadbandTransport {
		onFrame?: HeadbandTransport["onFrame"];
		onStatus?: HeadbandTransport["onStatus"];

		constructor(options?: {
			deviceOptions?: MuseDeviceOptions;
			sourceName?: string;
		});

		connect(): Promise<void>;
		disconnect(): Promise<void>;
		start(): Promise<void>;
		stop(): Promise<void>;
	}
}

declare module "@elata-biosciences/rppg-web" {
	export interface PulsePeak {
		value: number;
		time: number;
	}

	export interface PulseEstimatorResult {
		bpm: number;
		confidence: number;
	}

	export interface PulseAcfResult extends PulseEstimatorResult {
		harmonicRelation?: "fundamental" | "half" | "double";
	}

	export interface PulseWindowAnalysis {
		spectral: PulseEstimatorResult | null;
		acf: PulseAcfResult | null;
		peaks: PulseEstimatorResult | null;
		waveformProfile: { confidence: number } | null;
		respiration: number | null;
		hrvRmssd: number | null;
		quality: number;
		snrDb: number;
		nowMs: number;
		motionMean: number;
	}

	export function analyzePulseWindow(
		samples: Array<{
			timestampMs: number;
			intensity: number;
			skinRatio: number;
			motion: number;
			clipRatio: number;
		}>,
	): PulseWindowAnalysis | null;

	export function detectPeaks(
		data: PulsePeak[],
		bpmHint: number | null,
	): PulsePeak[];

	export function temporalNormalize(data: number[]): number[];
}
