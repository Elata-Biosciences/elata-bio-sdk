export type WaveformModelStatus =
	| "research"
	| "diagnostic"
	| "experimental"
	| "production";

export interface WaveformModelManifestV1 {
	schema: "elata.rppg.waveform-model/v1";
	id: string;
	version: string;
	status: WaveformModelStatus;
	input: {
		profileId: string;
		channels: readonly string[];
		length: number;
		normalization: string;
	};
	output: { kind: "normalized-waveform"; length: number };
	hashes: { modelSha256: string; metadataSha256: string };
	runtime: { engine: string; opset?: number };
}

export interface WaveformFeatureWindowV1 {
	schema: "elata.rppg.waveform-window/v1";
	profileId: string;
	channels: readonly string[];
	length: number;
	startTimeMs: number;
	endTimeMs: number;
	sourceSampleRate: number;
	data: Float32Array;
}

export interface WaveformReconstructionV1 {
	schema: "elata.rppg.waveform-reconstruction/v1";
	modelId: string;
	startTimeMs: number;
	endTimeMs: number;
	sampleRate: number;
	values: Float32Array;
	reliability: number | null;
}

export interface WaveformReconstructor {
	readonly manifest: WaveformModelManifestV1;
	init(signal?: AbortSignal): Promise<void>;
	reconstruct(
		window: WaveformFeatureWindowV1,
		signal?: AbortSignal,
	): Promise<WaveformReconstructionV1 | null>;
	dispose(): Promise<void>;
}

export type RppgModelFallbackReason =
	| "insufficient_window"
	| "profile_mismatch"
	| "timestamp_mismatch"
	| "channel_mismatch"
	| "invalid_input"
	| "model_init_failed"
	| "inference_failed"
	| "invalid_output"
	| "reconstruction_unavailable";

export class WaveformModelError extends Error {
	constructor(
		public readonly code: "invalid_input" | "invalid_output",
		message: string,
	) {
		super(message);
		this.name = "WaveformModelError";
	}
}

export interface RppgModelDiagnosticsV1 {
	modelId: string;
	modelStatus:
		| "loading"
		| "ready"
		| "running"
		| "degraded"
		| "failed"
		| "disposed";
	inputProfileId: string;
	lastInferenceMs: number | null;
	lastInferenceAtMs: number | null;
	inputSampleCount: number;
	skippedInferenceCount: number;
	fallbackReason: RppgModelFallbackReason | null;
	reconstructionReliability: number | null;
}
