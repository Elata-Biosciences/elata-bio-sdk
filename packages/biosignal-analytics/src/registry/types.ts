/**
 * Metric-registry contract types (v1). Time is session-relative integer
 * microseconds everywhere; wall-clock appears only in provenance.
 */

export type EvidenceTier =
	| "beta-default"
	| "advanced"
	| "experimental"
	| "rejected";
export type MeasurementClass =
	| "measured"
	| "derived-deterministic"
	| "model-inferred"
	| "product-composite";
export type MetricDomain =
	| "session"
	| "stream"
	| "eeg"
	| "pulse"
	| "rppg"
	| "multimodal"
	| "headline";
export type ComputeProfile = "live" | "post-session" | "idle" | "on-demand";
export type EngineKind =
	| "wasm"
	| "ts"
	| "onnx"
	| "duckdb"
	| "session-recorder"
	| "sdk-persisted";

/** `name@version` identity of a concrete algorithm implementation. */
export type AlgorithmId = `${string}@${number}`;

export interface QualityGate {
	metricId: string;
	min?: number;
	max?: number;
}

export interface InputRequirement {
	kind: "stream" | "metric" | "events";
	modality?: "eeg" | "ppg" | "rppg" | "imu" | "events";
	metricId?: string;
	minSampleRateHz?: number;
	minChannels?: number;
	optional?: boolean;
}

export interface WindowPolicy {
	/** Integer microseconds. */
	minWindowUs: number;
	preferredWindowUs?: number;
	/** Absent -> session-level (single window). */
	stepUs?: number;
	alignment: "sliding" | "session" | "event";
}

export interface MetricDefinitionV1 {
	schema: "elata.metric-definition/v1";
	/** e.g. "eeg.band_power.alpha.relative" */
	id: string;
	/** Semver of the DEFINITION (not the algorithm). */
	version: string;
	displayName: string;
	description: string;
	/** "uV^2" | "ratio" | "Hz" | "ms" | "bpm" | "score" | "s" | "count" | null */
	unit: string | null;
	domain: MetricDomain;
	measurementClass: MeasurementClass;
	evidenceTier: EvidenceTier;
	inputs: readonly InputRequirement[];
	window: WindowPolicy;
	channelPolicy: "per-channel" | "channel-mean" | "single";
	qualityGates: readonly QualityGate[];
	/** Must exist in ALGORITHM_VERSIONS. */
	algorithm: AlgorithmId;
	/** rppg-models-web manifest pattern. */
	model?: { id: string; version: string; sha256: string };
	aggregation: {
		session:
			| "mean"
			| "median"
			| "quality-weighted-mean"
			| "last"
			| "sum"
			| "max"
			| "none";
		daily: "mean" | "median" | "best-session" | "none";
	};
	baseline: {
		eligible: boolean;
		minSessions?: number;
		contextBucketing?: "none" | "time-of-day" | "app";
	};
	displayEligibility: "product" | "advanced-panel" | "debug-only" | "none";
	computeProfile: ComputeProfile;
	costClass: "trivial" | "light" | "moderate" | "heavy";
	implementedIn: EngineKind | "registered-only";
	references?: readonly string[];
}

export interface ProvenanceV1 {
	schema: "elata.provenance/v1";
	engine: EngineKind;
	algorithm: AlgorithmId;
	/** Hash from WASM config_id() or TS config hash. */
	configId: string;
	/** biosignal-analytics package version. */
	packageVersion: string;
	/** elata-biosignal-features crate version. */
	wasmVersion?: string;
	modelSha256?: string;
	inputStreamIds: readonly string[];
	inputMetricVersions?: Readonly<Record<string, string>>;
	/** Wall clock, provenance-only (session time stays µs-relative). */
	computedAtEpochMs: number;
}

export type ExclusionReason =
	| "insufficient_window"
	| "quality_gate_failed"
	| "insufficient_baseline"
	| "no_activation_detected"
	| "inputs_missing"
	| "algorithm_error";

export interface MetricObservationV1 {
	schema: "elata.metric-observation/v1";
	observationId: string;
	sessionId: string;
	metricId: string;
	metricVersion: string;
	streamId?: string;
	/** Channel name when channelPolicy = per-channel. */
	channel?: string;
	/** Session-relative integer µs. */
	windowStartUs: number;
	windowEndUs: number;
	/** null = withheld. */
	value: number | null;
	unit: string | null;
	/** 0..1 */
	quality: number;
	/** 0..1 valid-input fraction of window. */
	coverage: number;
	/** 0..1 */
	confidence?: number;
	provenance: ProvenanceV1;
	exclusionReason?: ExclusionReason;
}

export interface EnrichmentDefinitionV1 {
	schema: "elata.enrichment-definition/v1";
	/** e.g. "enrich.eeg.window-features" */
	id: string;
	version: string;
	inputs: readonly InputRequirement[];
	window: WindowPolicy;
	qualityGates: readonly QualityGate[];
	engine:
		| { kind: "wasm"; entry: "analyze_eeg_window"; configId: string }
		| { kind: "ts"; fn: string }
		| { kind: "onnx"; modelId: string; modelVersion: string }
		| { kind: "duckdb"; view: string }
		| { kind: "sdk-persisted"; streamKind: string };
	outputs: readonly { metricId: string; metricVersion: string }[];
	computeProfile: ComputeProfile;
	/** Enrichment ids (DAG edges). */
	dependencies: readonly string[];
	/** Default 32. */
	checkpointEveryWindows?: number;
}
