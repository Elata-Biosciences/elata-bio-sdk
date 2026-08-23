import {
	ARROW_STREAM_ENCODING,
	SESSION_FORMAT,
	SESSION_FORMAT_VERSION,
	type SessionChunkV1,
	type SessionEventV1,
	type SessionManifestV1,
	type SessionSourceV1,
	type SessionStreamV1,
	type SessionSummaryV1,
} from "./contracts";
import { SessionError } from "./errors";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const VALUE_TYPES = new Set([
	"float32",
	"float64",
	"int16",
	"int32",
	"int64",
	"boolean",
	"utf8",
]);

function object(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object"
		? (value as Record<string, unknown>)
		: null;
}

function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function nonNegativeInteger(value: unknown): value is number {
	return finite(value) && Number.isSafeInteger(value) && value >= 0;
}

export function isSessionId(value: unknown): value is string {
	return typeof value === "string" && ID_PATTERN.test(value);
}

export function validateSource(
	value: unknown,
): asserts value is SessionSourceV1 {
	const v = object(value);
	if (!v || !isSessionId(v.sourceId) || typeof v.name !== "string" || !v.name) {
		throw new SessionError("invalid_source", "Invalid source identity");
	}
	if (
		v.kind !== "wearable" &&
		v.kind !== "camera" &&
		v.kind !== "bridge" &&
		v.kind !== "synthetic" &&
		v.kind !== "replay" &&
		v.kind !== "custom"
	) {
		throw new SessionError("invalid_source", "Invalid source kind");
	}
}

export function validateStream(
	value: unknown,
): asserts value is SessionStreamV1 {
	const v = object(value);
	if (
		!v ||
		!isSessionId(v.streamId) ||
		!isSessionId(v.sourceId) ||
		typeof v.name !== "string" ||
		!v.name ||
		typeof v.modality !== "string" ||
		(v.kind !== "raw" && v.kind !== "processed" && v.kind !== "derived") ||
		typeof v.schemaVersion !== "string" ||
		!v.schemaVersion ||
		!Array.isArray(v.fields) ||
		v.fields.length === 0
	) {
		throw new SessionError(
			"invalid_stream",
			"Invalid stream identity or fields",
		);
	}
	const names = new Set<string>();
	for (const rawField of v.fields) {
		const field = object(rawField);
		if (
			!field ||
			typeof field.name !== "string" ||
			!isSessionId(field.name) ||
			typeof field.valueType !== "string" ||
			!VALUE_TYPES.has(field.valueType) ||
			names.has(field.name)
		) {
			throw new SessionError(
				"invalid_stream",
				"Invalid or duplicate stream field",
			);
		}
		names.add(field.name);
	}
	const timing = object(v.timing);
	if (!timing || (timing.kind !== "regular" && timing.kind !== "irregular")) {
		throw new SessionError("invalid_stream", "Invalid stream timing");
	}
	if (
		timing.clockSource !== "device" &&
		timing.clockSource !== "local" &&
		timing.clockSource !== "derived"
	) {
		throw new SessionError("invalid_stream", "Invalid stream clock source");
	}
	if (
		timing.kind === "regular" &&
		(!finite(timing.sampleRateHz) || timing.sampleRateHz <= 0)
	) {
		throw new SessionError(
			"invalid_stream",
			"Regular stream needs a positive sample rate",
		);
	}
	if (
		timing.kind === "irregular" &&
		(typeof timing.offsetField !== "string" || !names.has(timing.offsetField))
	) {
		throw new SessionError(
			"invalid_stream",
			"Irregular stream needs an offset field",
		);
	}
}

export function validateChunk(value: unknown): asserts value is SessionChunkV1 {
	const v = object(value);
	if (
		!v ||
		!isSessionId(v.sessionId) ||
		!isSessionId(v.streamId) ||
		!nonNegativeInteger(v.sequence) ||
		!nonNegativeInteger(v.startOffsetUs) ||
		!nonNegativeInteger(v.endOffsetUs) ||
		v.endOffsetUs < v.startOffsetUs ||
		!nonNegativeInteger(v.sampleCount) ||
		v.sampleCount === 0 ||
		v.encoding !== ARROW_STREAM_ENCODING ||
		typeof v.schemaSha256 !== "string" ||
		!SHA256_PATTERN.test(v.schemaSha256) ||
		!nonNegativeInteger(v.byteLength) ||
		v.byteLength === 0 ||
		typeof v.sha256 !== "string" ||
		!SHA256_PATTERN.test(v.sha256)
	) {
		throw new SessionError("invalid_chunk", "Invalid chunk descriptor");
	}
}

export function validateEvent(value: unknown): asserts value is SessionEventV1 {
	const v = object(value);
	if (
		!v ||
		!isSessionId(v.eventId) ||
		!isSessionId(v.sessionId) ||
		!nonNegativeInteger(v.offsetUs) ||
		typeof v.type !== "string" ||
		!ID_PATTERN.test(v.type) ||
		typeof v.schemaVersion !== "string" ||
		!v.schemaVersion ||
		!("data" in v)
	) {
		throw new SessionError("invalid_event", "Invalid session event");
	}
}

export function validateSummary(
	value: unknown,
): asserts value is SessionSummaryV1 {
	const v = object(value);
	if (
		!v ||
		v.schema !== "elata.biosignal-session-summary/v1" ||
		!isSessionId(v.sessionId) ||
		typeof v.definitionVersion !== "string" ||
		!v.definitionVersion ||
		typeof v.computedAt !== "string" ||
		!Number.isFinite(Date.parse(v.computedAt)) ||
		!Array.isArray(v.metrics)
	) {
		throw new SessionError("invalid_manifest", "Invalid session summary");
	}
	for (const rawMetric of v.metrics) {
		const metric = object(rawMetric);
		if (
			!metric ||
			!isSessionId(metric.metricId) ||
			typeof metric.metricVersion !== "string" ||
			typeof metric.unit !== "string" ||
			!nonNegativeInteger(metric.validDurationUs) ||
			!finite(metric.coverage) ||
			metric.coverage < 0 ||
			metric.coverage > 1 ||
			!nonNegativeInteger(metric.count) ||
			!Array.isArray(metric.inputStreamIds) ||
			!object(metric.provenance)
		) {
			throw new SessionError(
				"invalid_manifest",
				"Invalid session summary metric",
			);
		}
	}
}

export function validateManifest(
	value: unknown,
): asserts value is SessionManifestV1 {
	const v = object(value);
	if (
		!v ||
		v.format !== SESSION_FORMAT ||
		v.formatVersion !== SESSION_FORMAT_VERSION ||
		!isSessionId(v.sessionId) ||
		typeof v.startedAt !== "string" ||
		!Number.isFinite(Date.parse(v.startedAt)) ||
		!Array.isArray(v.sources) ||
		!Array.isArray(v.streams) ||
		!Array.isArray(v.chunks) ||
		!Array.isArray(v.models)
	) {
		throw new SessionError("invalid_manifest", "Invalid Session v1 manifest");
	}
	if (
		v.status !== "recording" &&
		v.status !== "interrupted" &&
		v.status !== "complete" &&
		v.status !== "aborted"
	) {
		throw new SessionError("invalid_manifest", "Invalid session status");
	}
	if (
		v.endedAt !== undefined &&
		(typeof v.endedAt !== "string" || !Number.isFinite(Date.parse(v.endedAt)))
	) {
		throw new SessionError("invalid_manifest", "Invalid session end time");
	}
	if (v.durationUs !== undefined && !nonNegativeInteger(v.durationUs)) {
		throw new SessionError("invalid_manifest", "Invalid session duration");
	}
	const clock = object(v.clock);
	const app = object(v.app);
	const consent = object(v.consent);
	if (
		!clock ||
		clock.timeUnit !== "microsecond" ||
		typeof clock.wallClockStartIso !== "string" ||
		!app ||
		typeof app.appId !== "string" ||
		!app.appId ||
		!consent ||
		consent.recording !== "granted"
	) {
		throw new SessionError(
			"invalid_manifest",
			"Invalid manifest clock, app, or consent",
		);
	}
	const sourceIds = new Set<string>();
	for (const source of v.sources) {
		validateSource(source);
		if (sourceIds.has(source.sourceId)) {
			throw new SessionError("invalid_manifest", "Duplicate source ID");
		}
		sourceIds.add(source.sourceId);
	}
	const streamIds = new Set<string>();
	for (const stream of v.streams) {
		validateStream(stream);
		if (!sourceIds.has(stream.sourceId) || streamIds.has(stream.streamId)) {
			throw new SessionError(
				"invalid_manifest",
				"Invalid stream source or duplicate ID",
			);
		}
		streamIds.add(stream.streamId);
	}
	const sequences = new Map<string, Set<number>>();
	for (const chunk of v.chunks) {
		validateChunk(chunk);
		if (chunk.sessionId !== v.sessionId || !streamIds.has(chunk.streamId)) {
			throw new SessionError(
				"invalid_manifest",
				"Chunk does not belong to manifest",
			);
		}
		const seen = sequences.get(chunk.streamId) ?? new Set<number>();
		if (seen.has(chunk.sequence))
			throw new SessionError("invalid_manifest", "Duplicate chunk sequence");
		seen.add(chunk.sequence);
		sequences.set(chunk.streamId, seen);
	}
	for (const seen of sequences.values()) {
		for (let sequence = 0; sequence < seen.size; sequence++) {
			if (!seen.has(sequence))
				throw new SessionError("invalid_manifest", "Chunk sequence has a gap");
		}
	}
}
