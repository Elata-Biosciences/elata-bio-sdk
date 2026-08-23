export const SESSION_FORMAT = "elata.biosignal-session" as const;
export const SESSION_FORMAT_VERSION = 1 as const;
export const SESSION_PROTOCOL_VERSION = 1 as const;
export const ARROW_STREAM_ENCODING = "arrow-ipc-stream" as const;

export type SessionStatus =
	| "recording"
	| "interrupted"
	| "complete"
	| "aborted";

export type BiosignalModality =
	| "eeg"
	| "ppg"
	| "rppg"
	| "ecg"
	| "eda"
	| "fnirs"
	| "imu"
	| "battery"
	| "quality"
	| "derived"
	| `custom:${string}`;

export type SourceKind =
	| "wearable"
	| "camera"
	| "bridge"
	| "synthetic"
	| "replay"
	| "custom";

export type StreamValueType =
	| "float32"
	| "float64"
	| "int16"
	| "int32"
	| "int64"
	| "boolean"
	| "utf8";

export interface SessionClockV1 {
	timeUnit: "microsecond";
	wallClockStartIso: string;
	monotonicOriginMs?: number;
}

export interface SessionAppContextV1 {
	appId: string;
	activity?: string;
	metadata?: Record<string, unknown>;
}

export interface SessionConsentV1 {
	recording: "granted";
	portableExport?: "not_requested" | "granted" | "denied";
	federatedContribution?: "not_requested" | "granted" | "denied";
}

export interface SessionSourceV1 {
	sourceId: string;
	name: string;
	kind: SourceKind;
	manufacturer?: string;
	model?: string;
	transport?: string;
	metadata?: Record<string, unknown>;
}

export interface StreamFieldV1 {
	name: string;
	valueType: StreamValueType;
	unit?: string;
	nullable?: boolean;
	scale?: number;
	offset?: number;
}

export type StreamTimingV1 =
	| {
			kind: "regular";
			sampleRateHz: number;
			clockSource: "device" | "local" | "derived";
	  }
	| {
			kind: "irregular";
			offsetField: string;
			clockSource: "device" | "local" | "derived";
	  };

export interface SessionStreamV1 {
	streamId: string;
	sourceId: string;
	name: string;
	modality: BiosignalModality;
	kind: "raw" | "processed" | "derived";
	schemaVersion: string;
	timing: StreamTimingV1;
	fields: StreamFieldV1[];
	provenance?: ProcessingProvenanceV1;
	metadata?: Record<string, unknown>;
}

export interface ProcessingProvenanceV1 {
	algorithmId: string;
	algorithmVersion: string;
	modelId?: string;
	modelVersion?: string;
	modelSha256?: string;
	featureSchemaId?: string;
	featureSchemaVersion?: string;
}

export interface SessionChunkV1 {
	sessionId: string;
	streamId: string;
	sequence: number;
	startOffsetUs: number;
	endOffsetUs: number;
	sampleCount: number;
	encoding: typeof ARROW_STREAM_ENCODING;
	schemaSha256: string;
	byteLength: number;
	sha256: string;
}

export interface SessionEventV1 {
	eventId: string;
	sessionId: string;
	offsetUs: number;
	type: string;
	schemaVersion: string;
	data: unknown;
}

export type MetricEvidenceTier =
	| "beta-default"
	| "beta-advanced"
	| "experimental"
	| "hidden";

export interface MetricDefinitionV1 {
	metricId: string;
	version: string;
	label: string;
	unit: string;
	inputStreamSchemas: string[];
	minimumWindowUs: number;
	qualityGateId?: string;
	aggregation: "mean" | "median" | "sum" | "count" | "custom";
	evidenceTier: MetricEvidenceTier;
	displayEligible: boolean;
	provenance: ProcessingProvenanceV1;
}

export interface SessionMetricSummaryV1 {
	metricId: string;
	metricVersion: string;
	unit: string;
	validDurationUs: number;
	coverage: number;
	count: number;
	mean?: number;
	median?: number;
	min?: number;
	max?: number;
	standardDeviation?: number;
	percentiles?: Record<string, number>;
	slopePerHour?: number;
	baselineRelativeChange?: number;
	quality?: number;
	inputStreamIds: string[];
	provenance: ProcessingProvenanceV1;
}

export interface SessionSummaryV1 {
	schema: "elata.biosignal-session-summary/v1";
	sessionId: string;
	definitionVersion: string;
	computedAt: string;
	metrics: SessionMetricSummaryV1[];
}

export interface SessionManifestV1 {
	format: typeof SESSION_FORMAT;
	formatVersion: typeof SESSION_FORMAT_VERSION;
	sessionId: string;
	status: SessionStatus;
	startedAt: string;
	endedAt?: string;
	durationUs?: number;
	clock: SessionClockV1;
	app: SessionAppContextV1;
	consent: SessionConsentV1;
	sources: SessionSourceV1[];
	streams: SessionStreamV1[];
	chunks: SessionChunkV1[];
	models: ProcessingProvenanceV1[];
	extensions?: Record<string, unknown>;
}

export interface BeginSessionInputV1 {
	activity?: string;
	startedAt?: string;
	metadata?: Record<string, unknown>;
	consent?: Omit<SessionConsentV1, "recording">;
	sources?: SessionSourceV1[];
}

export interface ArrowChunkV1 {
	descriptor: SessionChunkV1;
	payload: Uint8Array;
}

export type ArrowScalar = string | number | bigint | boolean | null;
export type ArrowColumnInput =
	| Float32Array
	| Float64Array
	| Int16Array
	| Int32Array
	| BigInt64Array
	| Uint8Array
	| readonly ArrowScalar[];

export interface ArrowRecordBatchInputV1 {
	columns: Readonly<Record<string, ArrowColumnInput>>;
}
