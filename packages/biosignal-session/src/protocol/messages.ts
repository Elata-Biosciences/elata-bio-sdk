/**
 * Wire protocol between a sandboxed app (client) and the trusted host.
 *
 * Transport: a dedicated `MessageChannel`. The host posts
 * `{ kind: "__elata_biosignal_init", v: 1 }` with `port2` transferred to the
 * app iframe's `contentWindow`; the client captures the port one-shot and all
 * further traffic flows over it. Chunk payloads travel as transferred
 * `ArrayBuffer`s. An `ok` reply to `chunk/commit` is sent only after the
 * payload and its catalog row are durably committed locally
 * (ACK = durable local commit).
 */

import type {
	ClockObservationDraft,
	SessionEventDraft,
	SessionState,
	SourceDescriptorDraft,
	StreamDescriptorDraft,
} from "../contracts/session";
import type { SessionProvenanceV1 } from "../contracts/provenance";
import type { DiscontinuityV1, SessionUs } from "../contracts/time";
import type { BiosignalErrorCode } from "./errors";

export const BIOSIGNAL_PROTOCOL_VERSION = 1 as const;
export const BIOSIGNAL_INIT_MESSAGE_KIND = "__elata_biosignal_init" as const;

export interface BiosignalInitMessage {
	kind: typeof BIOSIGNAL_INIT_MESSAGE_KIND;
	v: typeof BIOSIGNAL_PROTOCOL_VERSION;
}

export function isBiosignalInitMessage(
	value: unknown,
): value is BiosignalInitMessage {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as { kind?: unknown; v?: unknown };
	return (
		candidate.kind === BIOSIGNAL_INIT_MESSAGE_KIND &&
		candidate.v === BIOSIGNAL_PROTOCOL_VERSION
	);
}

/** Protocol limits. Chunk sizing/windows are benchmark-tunable constants. */
export const BIOSIGNAL_LIMITS = {
	maxChunkBytes: 8 * 1024 * 1024,
	maxEventBatch: 100,
	maxEventPayloadBytes: 4096,
	/** Non-chunk ops, sliding window. */
	controlRate: { count: 100, windowMs: 60_000 },
	defaultInFlightWindow: 4,
	ackTimeoutMs: 15_000,
	softBufferBytes: 32 * 1024 * 1024,
	hardBufferBytes: 128 * 1024 * 1024,
	chunkTargetBytes: 256 * 1024,
	chunkMaxDurationUs: 30_000_000,
	handshakeTimeoutMs: 5_000,
	heartbeatIntervalMs: 10_000,
	heartbeatMissLimit: 3,
} as const;

export interface SessionCreateSpec {
	label?: string;
	protocolLabel?: string;
	taskLabel?: string;
	startedAtUtcMs: number;
	startedAtMonotonicMs: number;
	sources: SourceDescriptorDraft[];
	provenance: SessionProvenanceV1;
}

export interface ChunkCommitMeta {
	rowCount: number;
	byteLength: number;
	checksum: { algo: "crc32c"; value: string };
	startUs: SessionUs;
	endUs: SessionUs;
	sampleIndexStart?: number;
	discontinuityBefore?: DiscontinuityV1;
}

interface Req<Op extends string> {
	v: typeof BIOSIGNAL_PROTOCOL_VERSION;
	id: string;
	op: Op;
}

export type ClientToHost =
	| Req<"ping">
	| (Req<"session/create"> & { spec: SessionCreateSpec })
	| (Req<"stream/open"> & { sessionId: string; stream: StreamDescriptorDraft })
	| (Req<"chunk/commit"> & {
			sessionId: string;
			streamId: string;
			sequence: number;
			meta: ChunkCommitMeta;
			/** Transferred, never cloned. */
			payload: ArrayBuffer;
	  })
	| (Req<"event/append"> & { sessionId: string; events: SessionEventDraft[] })
	| (Req<"clock/observe"> & {
			sessionId: string;
			observations: ClockObservationDraft[];
	  })
	| (Req<"stream/close"> & {
			sessionId: string;
			streamId: string;
			endUs: SessionUs;
	  })
	| (Req<"session/finalize"> & { sessionId: string; endUs: SessionUs })
	| (Req<"session/abort"> & { sessionId: string; reason: string })
	| (Req<"session/list"> & {
			filter?: { state?: SessionState; limit?: number };
	  })
	| (Req<"session/read"> & { sessionId: string })
	| (Req<"session/delete"> & { sessionId: string })
	| Req<"quota/estimate">;

export type ClientOp = ClientToHost["op"];

export const CLIENT_OPS: readonly ClientOp[] = [
	"ping",
	"session/create",
	"stream/open",
	"chunk/commit",
	"event/append",
	"clock/observe",
	"stream/close",
	"session/finalize",
	"session/abort",
	"session/list",
	"session/read",
	"session/delete",
	"quota/estimate",
];

export interface QuotaUsage {
	usageBytes: number;
	quotaBytes: number;
}

export interface ChunkCommitResult {
	sequence: number;
	storedBytes: number;
	usage: QuotaUsage;
}

export type HostNotice =
	| "quota-warning"
	| "quota-critical"
	| "session-invalidated"
	| "shutting-down";

export type HostToClient =
	| {
			v: typeof BIOSIGNAL_PROTOCOL_VERSION;
			id: string;
			ok: true;
			result?: unknown;
	  }
	| {
			v: typeof BIOSIGNAL_PROTOCOL_VERSION;
			id: string;
			ok: false;
			error: BiosignalErrorCode;
			retryable: boolean;
			detail?: string;
	  }
	| {
			v: typeof BIOSIGNAL_PROTOCOL_VERSION;
			kind: "host/notice";
			notice: HostNotice;
			sessionId?: string;
			detail?: string;
	  };

export function isClientRequest(value: unknown): value is ClientToHost {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as { v?: unknown; id?: unknown; op?: unknown };
	return (
		candidate.v === BIOSIGNAL_PROTOCOL_VERSION &&
		typeof candidate.id === "string" &&
		candidate.id.length > 0 &&
		typeof candidate.op === "string" &&
		(CLIENT_OPS as readonly string[]).includes(candidate.op)
	);
}

export function isHostResponse(value: unknown): value is HostToClient {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as {
		v?: unknown;
		id?: unknown;
		ok?: unknown;
		kind?: unknown;
	};
	if (candidate.v !== BIOSIGNAL_PROTOCOL_VERSION) return false;
	if (candidate.kind === "host/notice") return true;
	return typeof candidate.id === "string" && typeof candidate.ok === "boolean";
}
