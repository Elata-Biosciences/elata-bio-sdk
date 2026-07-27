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
	fallbackReason: string | null;
	reconstructionReliability: number | null;
}
