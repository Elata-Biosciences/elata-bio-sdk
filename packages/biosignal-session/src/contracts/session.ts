/**
 * Session V1 logical model: Session → Source → Stream → Chunk → Event.
 *
 * A session is one recording episode. Sources are runtime producers
 * (headset, camera, synthetic). Streams are independently sampled, typed
 * sequences. Chunks are immutable, independently decodable Arrow IPC file
 * payloads with a `(sessionId, streamId, sequence)` idempotency identity.
 * Events are sparse rows kept out of the Arrow plane.
 */

import type {
	ArrowSchemaId,
	BiosignalModality,
	ClockSource,
	SamplingKind,
} from "./modality";
import type {
	SessionProvenanceV1,
	StreamProcessingProvenanceV1,
} from "./provenance";
import type {
	ClockAlignmentObservationV1,
	DiscontinuityV1,
	SessionUs,
} from "./time";

export type SessionState =
	| "pending"
	| "recording"
	| "finalizing"
	| "complete"
	| "aborted"
	| "deleting";

export type SessionEndReason =
	| "finalized"
	| "aborted-by-app"
	| "client-gone"
	| "storage_full"
	| "storage_stalled"
	| "interrupted";

/** Durability profile the host storage plane probed at session start. */
export type StorageProfile = "opfs-sync" | "opfs-async" | "idb-only";

export interface BiosignalSessionV1 {
	schemaVersion: 1;
	/** Host-assigned UUID. */
	sessionId: string;
	/** Host-supplied app identity — never client-controlled. */
	appId: string;
	createdBy: "app" | "platform";
	label?: string;
	/** Experimental-protocol label (athena-recording-spec `protocol`). */
	protocolLabel?: string;
	/** Task label (athena-recording-spec `task_label`). */
	taskLabel?: string;
	/** Wall-clock anchor. */
	startedAtUtcMs: number;
	/** `performance.now()` at the same instant on the client UI thread. */
	startedAtMonotonicMs: number;
	endedAtUtcMs?: number;
	/** Session-relative µs of the last committed sample. */
	endUs?: SessionUs;
	state: SessionState;
	endReason?: SessionEndReason;
	timeModel: {
		epoch: "session-relative";
		unit: "microseconds";
		anchor: "client-monotonic";
	};
	storageProfile: StorageProfile;
	provenance: SessionProvenanceV1;
	stats: {
		totalChunks: number;
		totalBytes: number;
		streamCount: number;
		eventCount: number;
	};
}

export interface SourceDescriptorV1 {
	schemaVersion: 1;
	sourceId: string;
	sessionId: string;
	kind: "wearable" | "camera" | "synthetic" | "bridge" | "custom";
	/** e.g. "muse-ble", "rppg-camera", "synthetic". */
	name: string;
	/** Adapter identity, e.g. "headband-transport@1", "rppg-web@1". */
	adapter: string;
	device?: {
		isAthena?: boolean;
		samplingRateHz?: number;
		eegChannelNames?: string[];
		opticsChannelCount?: number;
		boardInfo?: Record<string, unknown>;
	};
	sdkPackages: { name: string; version: string }[];
	attachedAtUs: SessionUs;
	detachedAtUs?: SessionUs;
}

export interface StreamChannelV1 {
	name: string;
	unit?: string;
}

export interface StreamDescriptorV1 {
	schemaVersion: 1;
	streamId: string;
	sessionId: string;
	sourceId: string;
	modality: BiosignalModality;
	sampling: SamplingKind;
	/** Required when `sampling === "regular"`. */
	sampleRateHz?: number;
	channels: StreamChannelV1[];
	/** `events` streams use "ndjson" (rows live in the catalog, not Arrow). */
	encoding: "arrow-ipc" | "ndjson";
	arrowSchemaId?: ArrowSchemaId;
	/** "wide" is the default layout; "interleaved" exists for benchmarking. */
	layout: "wide" | "interleaved";
	clockSource: ClockSource;
	processing?: StreamProcessingProvenanceV1;
	state: "open" | "closed";
	createdAtUs: SessionUs;
	closedAtUs?: SessionUs;
	/** Host-maintained idempotency anchor: next expected chunk sequence. */
	expectedNextSequence: number;
	stats: {
		chunkCount: number;
		rowCount: number;
		byteCount: number;
		firstTimestampUs?: SessionUs;
		lastTimestampUs?: SessionUs;
		discontinuityCount: number;
	};
}

export interface ChunkChecksumV1 {
	algo: "crc32c";
	/** 8 lowercase hex chars. */
	value: string;
}

export interface ChunkDescriptorV1 {
	schemaVersion: 1;
	sessionId: string;
	streamId: string;
	/** 0-based, strictly contiguous per stream. */
	sequence: number;
	encoding: "arrow-ipc";
	rowCount: number;
	byteLength: number;
	checksum: ChunkChecksumV1;
	/** Session-relative µs bounds of the rows in this chunk. */
	startUs: SessionUs;
	endUs: SessionUs;
	/** Regular streams: absolute sample counter of row 0. */
	sampleIndexStart?: number;
	discontinuityBefore?: DiscontinuityV1;
	/** Empty string when `storageProfile === "idb-only"`. */
	opfsPath: string;
	committedAtUtcMs: number;
	/** "missing" is set by recovery when a payload file is lost. */
	payloadState: "opfs" | "idb" | "missing";
}

export type SessionEventKind =
	| "annotation"
	| "marker"
	| "lifecycle"
	| "quality"
	| "discontinuity"
	| "device-status"
	| "user";

export interface SessionEventV1 {
	schemaVersion: 1;
	eventId: string;
	sessionId: string;
	streamId?: string;
	timestampUs: SessionUs;
	durationUs?: SessionUs;
	kind: SessionEventKind;
	/** Must match `NAME_PATTERN` (`^[a-z][a-z0-9_.-]{0,63}$`). */
	name: string;
	/** JSON-serializable; ≤ 4096 bytes serialized (host-enforced). */
	payload?: Record<string, unknown>;
	/** Who produced the event; hosts reject client rows claiming "host". */
	origin: "host" | "sdk" | "app" | "user";
}

/** Draft shapes clients send; the host assigns identities and state. */
export type SourceDescriptorDraft = Omit<
	SourceDescriptorV1,
	"schemaVersion" | "sourceId" | "sessionId" | "attachedAtUs" | "detachedAtUs"
> & { attachedAtUs?: SessionUs };

export type StreamDescriptorDraft = Omit<
	StreamDescriptorV1,
	| "schemaVersion"
	| "streamId"
	| "sessionId"
	| "state"
	| "createdAtUs"
	| "closedAtUs"
	| "expectedNextSequence"
	| "stats"
> & { sourceId: string; createdAtUs?: SessionUs };

export type SessionEventDraft = Omit<
	SessionEventV1,
	"schemaVersion" | "eventId" | "sessionId" | "origin"
>;

export type ClockObservationDraft = Omit<
	ClockAlignmentObservationV1,
	"schemaVersion" | "sessionId"
>;
