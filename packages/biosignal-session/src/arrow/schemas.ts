/**
 * Arrow schema builders.
 *
 * Every persisted chunk is a complete Arrow IPC *file* — self-describing and
 * independently decodable. These builders define the canonical column sets
 * per `ArrowSchemaId`; chunk-level field metadata carries the Elata identity
 * keys so a chunk found loose is self-identifying.
 */

import {
	Bool,
	Dictionary,
	Field,
	Float32,
	Float64,
	Int8,
	Int32,
	Int64,
	List,
	Schema,
	Utf8,
} from "apache-arrow";
import type { ArrowSchemaId } from "../contracts/modality";

export const ELATA_META_KEYS = {
	sessionId: "elata:sessionId",
	streamId: "elata:streamId",
	arrowSchemaId: "elata:arrowSchemaId",
} as const;

export interface ChunkIdentity {
	sessionId: string;
	streamId: string;
	arrowSchemaId: ArrowSchemaId;
}

export function identityMetadata(identity: ChunkIdentity): Map<string, string> {
	return new Map([
		[ELATA_META_KEYS.sessionId, identity.sessionId],
		[ELATA_META_KEYS.streamId, identity.streamId],
		[ELATA_META_KEYS.arrowSchemaId, identity.arrowSchemaId],
	]);
}

function f32(name: string): Field {
	return new Field(name, new Float32(), true);
}

function f64(name: string): Field {
	return new Field(name, new Float64(), true);
}

function i32(name: string): Field {
	return new Field(name, new Int32(), true);
}

function timeUs(): Field {
	// Session-relative integer microseconds — deliberately Int64, not a
	// Timestamp type (which would imply an epoch).
	return new Field("time_us", new Int64(), false);
}

function bool(name: string): Field {
	return new Field(name, new Bool(), true);
}

function dict(name: string): Field {
	return new Field(name, new Dictionary(new Utf8(), new Int8()), true);
}

function utf8List(name: string): Field {
	return new Field(name, new List(new Field("item", new Utf8(), true)), true);
}

/** One Float32 column per channel; no time column (derived from descriptor). */
export function regularWideF32Schema(
	channelNames: readonly string[],
	identity: ChunkIdentity,
): Schema {
	return new Schema(
		channelNames.map((name) => f32(name)),
		identityMetadata(identity),
	);
}

export function batterySchema(
	identity: ChunkIdentity,
	extraChannels: readonly string[] = [],
): Schema {
	return new Schema(
		[timeUs(), f32("battery_pct"), ...extraChannels.map((name) => f32(name))],
		identityMetadata(identity),
	);
}

export function rppgTraceSchema(identity: ChunkIdentity): Schema {
	return new Schema(
		[timeUs(), f32("value"), f32("raw")],
		identityMetadata(identity),
	);
}

/**
 * Derived rPPG metric rows — the full `@elata-biosciences/rppg-web` 0.14
 * `Metrics` surface, persisted (never recomputed) with provenance.
 */
export const RPPG_METRICS_FLOAT_FIELDS = [
	"bpm",
	"confidence",
	"signal_quality",
	"agreement",
	"snr",
	"skin_ratio_mean",
	"motion_mean",
	"clip_mean",
	"spectral_bpm",
	"acf_bpm",
	"peaks_bpm",
	"resolved_bpm",
	"resolved_confidence",
	"bayes_bpm",
	"bayes_confidence",
	"bayes_ambiguity",
	"calibrated_bpm",
	"fused_bpm",
	"baseline_bpm",
	"baseline_delta",
	"hrv_rmssd",
	"respiration_rate",
	"respiration_confidence",
	"capture_confidence",
	"capture_motion",
	"capture_lighting",
] as const;

export const RPPG_METRICS_BOOL_FIELDS = [
	"alias_flag",
	"calibration_trained",
] as const;

export const RPPG_METRICS_DICT_FIELDS = [
	"fused_source",
	"capture_limiting",
	"bayes_tracker_config_id",
	"bayes_quality_provider_id",
] as const;

export const RPPG_METRICS_LIST_FIELDS = [
	"reason_codes",
	"winning_sources",
	"capture_reasons",
] as const;

export function rppgMetricsSchema(identity: ChunkIdentity): Schema {
	return new Schema(
		[
			timeUs(),
			...RPPG_METRICS_FLOAT_FIELDS.map((name) => f32(name)),
			...RPPG_METRICS_BOOL_FIELDS.map((name) => bool(name)),
			...RPPG_METRICS_DICT_FIELDS.map((name) => dict(name)),
			...RPPG_METRICS_LIST_FIELDS.map((name) => utf8List(name)),
		],
		identityMetadata(identity),
	);
}

/**
 * Derived contact-PPG metric rows — the `@elata-biosciences/ppg-web` 0.12
 * `PpgMetrics` surface.
 */
export const PPG_METRICS_FLOAT_FIELDS = [
	"bpm",
	"rmssd_ms",
	"sdnn_ms",
	"mean_nn_ms",
	"confidence",
	"signal_quality",
	"spectral_bpm",
	"acf_bpm",
	"peaks_bpm",
	"respiration_bpm",
	"snr_db",
	"waveform_confidence",
	"window_duration_ms",
	"sample_rate_hz",
] as const;

export const PPG_METRICS_INT_FIELDS = [
	"ibi_count",
	"window_sample_count",
] as const;

export const PPG_METRICS_F64_FIELDS = [
	"last_sample_timestamp_ms",
	"emitted_at_ms",
] as const;

export const PPG_METRICS_DICT_FIELDS = ["source", "channel"] as const;

export const PPG_METRICS_LIST_FIELDS = ["reason_codes"] as const;

export function ppgMetricsSchema(identity: ChunkIdentity): Schema {
	return new Schema(
		[
			timeUs(),
			...PPG_METRICS_FLOAT_FIELDS.map((name) => f32(name)),
			...PPG_METRICS_INT_FIELDS.map((name) => i32(name)),
			...PPG_METRICS_F64_FIELDS.map((name) => f64(name)),
			...PPG_METRICS_DICT_FIELDS.map((name) => dict(name)),
			...PPG_METRICS_LIST_FIELDS.map((name) => utf8List(name)),
		],
		identityMetadata(identity),
	);
}

export function schemaForId(
	id: ArrowSchemaId,
	identity: ChunkIdentity,
	channelNames: readonly string[],
): Schema {
	switch (id) {
		case "regular-wide-f32@1":
			return regularWideF32Schema(channelNames, identity);
		case "battery@1":
			return batterySchema(identity);
		case "rppg-trace@1":
			return rppgTraceSchema(identity);
		case "rppg-metrics@1":
			return rppgMetricsSchema(identity);
		case "ppg-metrics@1":
			return ppgMetricsSchema(identity);
	}
}
