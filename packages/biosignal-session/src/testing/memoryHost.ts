/**
 * A full in-memory biosignal host for protocol tests.
 *
 * Speaks the wire protocol over a `ProtocolPort`, validating exactly like a
 * real storage host — op allowlist, state machines, sequence contiguity,
 * checksum re-verification, payload/event limits, control-op rate limiting —
 * and committing to in-memory Maps ("durable" here means the Map write
 * happened before the ACK left). Fault-injection hooks cover lost ACKs,
 * commit failures, transit corruption, and paused (held) processing.
 *
 * No network, no IndexedDB, no OPFS: this is the protocol conformance
 * surface, not the storage plane.
 */

import { checksumOf, crc32cHex } from "../arrow/checksum";
import { isValidName } from "../contracts/ids";
import { isArrowSchemaId, isBiosignalModality } from "../contracts/modality";
import type {
	BiosignalSessionV1,
	ChunkDescriptorV1,
	SessionEventV1,
	SourceDescriptorV1,
	StreamDescriptorV1,
} from "../contracts/session";
import type { ClockAlignmentObservationV1 } from "../contracts/time";
import type { BiosignalErrorCode } from "../protocol/errors";
import { isRetryableError } from "../protocol/errors";
import {
	BIOSIGNAL_LIMITS,
	BIOSIGNAL_PROTOCOL_VERSION,
	isClientRequest,
} from "../protocol/messages";
import type {
	ChunkCommitResult,
	ClientToHost,
	HostNotice,
	HostToClient,
	QuotaUsage,
} from "../protocol/messages";
import { canCommitChunk, canTransitionSession } from "../protocol/stateMachine";
import type { ProtocolPort } from "../worker/workerMessages";

/** In-process port pair with microtask delivery (deterministic tests). */
export function createLoopbackPortPair(): [ProtocolPort, ProtocolPort] {
	const make = (getPeer: () => ProtocolPort): ProtocolPort => ({
		onmessage: null,
		postMessage(message: unknown) {
			queueMicrotask(() => {
				getPeer().onmessage?.({ data: message });
			});
		},
		start() {},
		close() {},
	});
	const a: ProtocolPort = make(() => b);
	const b: ProtocolPort = make(() => a);
	return [a, b];
}

/** Await enough microtask turns for loopback round trips to settle. */
export async function settleMicrotasks(turns = 16): Promise<void> {
	for (let i = 0; i < turns; i++) {
		await Promise.resolve();
	}
}

export interface StoredChunk {
	descriptor: ChunkDescriptorV1;
	/** Retained bytes (absent when `retainPayloads: false`). */
	payload?: Uint8Array;
	result: ChunkCommitResult;
}

export interface MemoryHostOptions {
	appId?: string;
	/** Deterministic id source for sessions/streams/sources/events. */
	idGenerator?: () => string;
	nowUtcMs?: () => number;
	/** Monotonic ms used for control-op rate limiting. */
	nowMs?: () => number;
	quotaBytes?: number;
	/** Keep chunk payload bytes (default true; disable for endurance runs). */
	retainPayloads?: boolean;
}

export interface MemoryHost {
	attach(port: ProtocolPort): void;
	/** Deliver one client request directly (bypasses the port). */
	deliver(message: unknown): void;

	// Fault injection
	dropNextAck(): void;
	failNextCommitWith(code: BiosignalErrorCode): void;
	corruptNextPayload(): void;
	/** Queue incoming messages instead of processing them. */
	pause(): void;
	/** Process everything queued while paused, in order. */
	resume(): void;
	/** Push a host notice to the client. */
	notify(notice: HostNotice, sessionId?: string, detail?: string): void;

	// State
	sessions: Map<string, BiosignalSessionV1>;
	sources: Map<string, SourceDescriptorV1>;
	streams: Map<string, StreamDescriptorV1>;
	/** Key: `${sessionId}/${streamId}/${sequence}`. */
	chunks: Map<string, StoredChunk>;
	events: SessionEventV1[];
	observations: ClockAlignmentObservationV1[];
	/** Every reply the host sent (including dropped ones are excluded). */
	sentReplies: HostToClient[];

	chunksForStream(streamId: string): StoredChunk[];
	committedBytes(): number;
	usage(): QuotaUsage;
}

const CONTROL_OPS_EXEMPT = new Set(["chunk/commit"]);

export function createMemoryHost(options: MemoryHostOptions = {}): MemoryHost {
	const appId = options.appId ?? "app-test";
	let idCounter = 0;
	const nextId = options.idGenerator ?? (() => `mh-${++idCounter}`);
	const nowUtcMs = options.nowUtcMs ?? (() => Date.now());
	const nowMs = options.nowMs ?? (() => 0);
	const quotaBytes = options.quotaBytes ?? 512 * 1024 * 1024;
	const retainPayloads = options.retainPayloads ?? true;

	let port: ProtocolPort | null = null;
	let dropAck = false;
	let failCommitWith: BiosignalErrorCode | null = null;
	let corruptPayload = false;
	let paused = false;
	const heldMessages: unknown[] = [];
	const controlTimestamps: number[] = [];

	const host: MemoryHost = {
		sessions: new Map(),
		sources: new Map(),
		streams: new Map(),
		chunks: new Map(),
		events: [],
		observations: [],
		sentReplies: [],

		attach(nextPort) {
			port = nextPort;
			nextPort.onmessage = (event) => host.deliver(event.data);
			nextPort.start?.();
		},

		deliver(message) {
			if (paused) {
				heldMessages.push(message);
				return;
			}
			handle(message);
		},

		dropNextAck() {
			dropAck = true;
		},
		failNextCommitWith(code) {
			failCommitWith = code;
		},
		corruptNextPayload() {
			corruptPayload = true;
		},
		pause() {
			paused = true;
		},
		resume() {
			paused = false;
			while (heldMessages.length > 0 && !paused) {
				handle(heldMessages.shift());
			}
		},
		notify(notice, sessionId, detail) {
			const message: HostToClient = {
				v: BIOSIGNAL_PROTOCOL_VERSION,
				kind: "host/notice",
				notice,
				sessionId,
				detail,
			};
			host.sentReplies.push(message);
			port?.postMessage(message);
		},

		chunksForStream(streamId) {
			return [...host.chunks.values()]
				.filter((chunk) => chunk.descriptor.streamId === streamId)
				.sort((a, b) => a.descriptor.sequence - b.descriptor.sequence);
		},
		committedBytes() {
			let total = 0;
			for (const chunk of host.chunks.values()) {
				total += chunk.descriptor.byteLength;
			}
			return total;
		},
		usage() {
			return { usageBytes: host.committedBytes(), quotaBytes };
		},
	};

	const reply = (message: HostToClient, dropped = false) => {
		if (dropped) return;
		host.sentReplies.push(message);
		port?.postMessage(message);
	};

	const ok = (id: string, result?: unknown) => {
		const shouldDrop = dropAck;
		dropAck = false;
		reply({ v: BIOSIGNAL_PROTOCOL_VERSION, id, ok: true, result }, shouldDrop);
	};

	const fail = (id: string, error: BiosignalErrorCode, detail?: string) => {
		reply({
			v: BIOSIGNAL_PROTOCOL_VERSION,
			id,
			ok: false,
			error,
			retryable: isRetryableError(error),
			detail,
		});
	};

	const rateLimited = (op: string): boolean => {
		if (CONTROL_OPS_EXEMPT.has(op)) return false;
		const now = nowMs();
		const windowStart = now - BIOSIGNAL_LIMITS.controlRate.windowMs;
		while (
			controlTimestamps.length > 0 &&
			controlTimestamps[0] <= windowStart
		) {
			controlTimestamps.shift();
		}
		if (controlTimestamps.length >= BIOSIGNAL_LIMITS.controlRate.count) {
			return true;
		}
		controlTimestamps.push(now);
		return false;
	};

	function handle(message: unknown): void {
		if (!isClientRequest(message)) {
			const id = (message as { id?: unknown } | null)?.id;
			if (typeof id === "string" && id.length > 0) {
				fail(id, "invalid_payload", "malformed request");
			}
			return;
		}
		const request = message as ClientToHost;
		if (rateLimited(request.op)) {
			fail(request.id, "rate_limited");
			return;
		}
		switch (request.op) {
			case "ping":
				ok(request.id);
				return;
			case "session/create":
				handleCreate(request);
				return;
			case "stream/open":
				handleStreamOpen(request);
				return;
			case "chunk/commit":
				handleCommit(request);
				return;
			case "event/append":
				handleEvents(request);
				return;
			case "clock/observe":
				handleClock(request);
				return;
			case "stream/close":
				handleStreamClose(request);
				return;
			case "session/finalize":
				handleFinalize(request);
				return;
			case "session/abort":
				handleAbort(request);
				return;
			case "session/list": {
				const filter = request.filter;
				let sessions = [...host.sessions.values()];
				if (filter?.state) {
					sessions = sessions.filter(
						(session) => session.state === filter.state,
					);
				}
				if (filter?.limit !== undefined)
					sessions = sessions.slice(0, filter.limit);
				ok(request.id, { sessions });
				return;
			}
			case "session/read": {
				const session = host.sessions.get(request.sessionId);
				if (!session) {
					fail(request.id, "unknown_session");
					return;
				}
				ok(request.id, {
					session,
					sources: [...host.sources.values()].filter(
						(source) => source.sessionId === session.sessionId,
					),
					streams: [...host.streams.values()].filter(
						(stream) => stream.sessionId === session.sessionId,
					),
				});
				return;
			}
			case "session/delete": {
				const session = host.sessions.get(request.sessionId);
				if (!session) {
					fail(request.id, "unknown_session");
					return;
				}
				if (!canTransitionSession(session.state, "deleting")) {
					fail(request.id, "bad_state", `state ${session.state}`);
					return;
				}
				host.sessions.delete(session.sessionId);
				for (const [key, chunk] of host.chunks) {
					if (chunk.descriptor.sessionId === session.sessionId) {
						host.chunks.delete(key);
					}
				}
				for (const [streamId, stream] of host.streams) {
					if (stream.sessionId === session.sessionId)
						host.streams.delete(streamId);
				}
				for (const [sourceId, source] of host.sources) {
					if (source.sessionId === session.sessionId)
						host.sources.delete(sourceId);
				}
				host.events = host.events.filter(
					(event) => event.sessionId !== session.sessionId,
				);
				ok(request.id, { deleted: true });
				return;
			}
			case "quota/estimate":
				ok(request.id, { usage: host.usage() });
				return;
		}
	}

	function handleCreate(
		request: Extract<ClientToHost, { op: "session/create" }>,
	): void {
		const spec = request.spec;
		if (
			typeof spec !== "object" ||
			spec === null ||
			typeof spec.startedAtUtcMs !== "number" ||
			typeof spec.startedAtMonotonicMs !== "number" ||
			!Array.isArray(spec.sources)
		) {
			fail(request.id, "invalid_payload", "bad session spec");
			return;
		}
		const sessionId = nextId();
		const session: BiosignalSessionV1 = {
			schemaVersion: 1,
			sessionId,
			appId,
			createdBy: "app",
			label: spec.label,
			protocolLabel: spec.protocolLabel,
			taskLabel: spec.taskLabel,
			startedAtUtcMs: spec.startedAtUtcMs,
			startedAtMonotonicMs: spec.startedAtMonotonicMs,
			state: "recording",
			timeModel: {
				epoch: "session-relative",
				unit: "microseconds",
				anchor: "client-monotonic",
			},
			storageProfile: "idb-only",
			provenance: spec.provenance,
			stats: { totalChunks: 0, totalBytes: 0, streamCount: 0, eventCount: 0 },
		};
		host.sessions.set(sessionId, session);
		const sources: SourceDescriptorV1[] = spec.sources.map((draft) => {
			const source: SourceDescriptorV1 = {
				schemaVersion: 1,
				sourceId: nextId(),
				sessionId,
				kind: draft.kind,
				name: draft.name,
				adapter: draft.adapter,
				device: draft.device,
				sdkPackages: draft.sdkPackages,
				attachedAtUs: draft.attachedAtUs ?? 0,
			};
			host.sources.set(source.sourceId, source);
			return source;
		});
		ok(request.id, { session, sources });
	}

	function handleStreamOpen(
		request: Extract<ClientToHost, { op: "stream/open" }>,
	): void {
		const session = host.sessions.get(request.sessionId);
		if (!session) {
			fail(request.id, "unknown_session");
			return;
		}
		if (session.state !== "recording") {
			fail(request.id, "bad_state", `session ${session.state}`);
			return;
		}
		const draft = request.stream;
		if (
			typeof draft !== "object" ||
			draft === null ||
			!isBiosignalModality(draft.modality) ||
			!Array.isArray(draft.channels)
		) {
			fail(request.id, "invalid_payload", "bad stream draft");
			return;
		}
		// Hosts assign source ids at `session/create`; a stream may only name
		// one this session declared. An app knows its own source *names*, so
		// `RecorderCore` translates name → assigned id before sending
		// `stream/open` (see sendStreamOpen). Checking the reference here is
		// what keeps this host from being more permissive than production —
		// a client that skips the translation must fail in tests, not only
		// against the App Store host.
		const source = host.sources.get(draft.sourceId);
		if (!source || source.sessionId !== session.sessionId) {
			fail(request.id, "invalid_payload", "unknown sourceId");
			return;
		}
		if (
			draft.sampling === "regular" &&
			!(draft.sampleRateHz && draft.sampleRateHz > 0)
		) {
			fail(
				request.id,
				"invalid_payload",
				"regular stream requires sampleRateHz",
			);
			return;
		}
		if (
			draft.encoding === "arrow-ipc" &&
			!isArrowSchemaId(draft.arrowSchemaId)
		) {
			fail(request.id, "invalid_payload", "unknown arrowSchemaId");
			return;
		}
		const stream: StreamDescriptorV1 = {
			schemaVersion: 1,
			streamId: nextId(),
			sessionId: session.sessionId,
			sourceId: draft.sourceId,
			modality: draft.modality,
			sampling: draft.sampling,
			sampleRateHz: draft.sampleRateHz,
			channels: draft.channels,
			encoding: draft.encoding,
			arrowSchemaId: draft.arrowSchemaId,
			layout: draft.layout,
			clockSource: draft.clockSource,
			processing: draft.processing,
			state: "open",
			createdAtUs: draft.createdAtUs ?? 0,
			expectedNextSequence: 0,
			stats: {
				chunkCount: 0,
				rowCount: 0,
				byteCount: 0,
				discontinuityCount: 0,
			},
		};
		host.streams.set(stream.streamId, stream);
		session.stats.streamCount += 1;
		ok(request.id, { stream });
	}

	function handleCommit(
		request: Extract<ClientToHost, { op: "chunk/commit" }>,
	): void {
		const session = host.sessions.get(request.sessionId);
		if (!session) {
			fail(request.id, "unknown_session");
			return;
		}
		const stream = host.streams.get(request.streamId);
		if (!stream || stream.sessionId !== session.sessionId) {
			fail(request.id, "unknown_stream");
			return;
		}
		if (!canCommitChunk(session.state, stream.state)) {
			fail(
				request.id,
				"bad_state",
				`session ${session.state}, stream ${stream.state}`,
			);
			return;
		}
		const { sequence, meta } = request;
		const key = `${session.sessionId}/${stream.streamId}/${sequence}`;
		if (sequence < stream.expectedNextSequence) {
			const stored = host.chunks.get(key);
			if (stored && stored.descriptor.checksum.value === meta.checksum.value) {
				// Idempotent replay of a chunk whose ACK was lost.
				ok(request.id, { ...stored.result, usage: host.usage() });
				return;
			}
			fail(request.id, "sequence_conflict", `duplicate sequence ${sequence}`);
			return;
		}
		if (sequence > stream.expectedNextSequence) {
			fail(
				request.id,
				"sequence_conflict",
				`expected ${stream.expectedNextSequence}, got ${sequence}`,
			);
			return;
		}
		if (!(request.payload instanceof ArrayBuffer)) {
			fail(request.id, "invalid_payload", "payload must be an ArrayBuffer");
			return;
		}
		// NaN/Infinity would poison the catalog's time ranges and every query
		// built on them, so timing is checked before anything is stored.
		for (const [field, value] of [
			["startUs", meta.startUs],
			["endUs", meta.endUs],
			["rowCount", meta.rowCount],
		] as const) {
			if (!Number.isFinite(value)) {
				fail(request.id, "invalid_payload", `${field} must be finite`);
				return;
			}
		}
		if (meta.endUs < meta.startUs) {
			fail(request.id, "invalid_payload", "endUs precedes startUs");
			return;
		}
		const payload = new Uint8Array(request.payload);
		if (corruptPayload) {
			corruptPayload = false;
			if (payload.length > 0) payload[0] ^= 0xff; // transit corruption
		}
		if (meta.byteLength !== payload.byteLength) {
			fail(request.id, "invalid_payload", "byteLength mismatch");
			return;
		}
		if (payload.byteLength > BIOSIGNAL_LIMITS.maxChunkBytes) {
			fail(request.id, "payload_too_large");
			return;
		}
		if (crc32cHex(payload) !== meta.checksum.value) {
			fail(request.id, "checksum_mismatch");
			return;
		}
		if (failCommitWith) {
			const code = failCommitWith;
			failCommitWith = null;
			fail(request.id, code, "injected commit failure");
			return;
		}
		if (host.committedBytes() + payload.byteLength > quotaBytes) {
			fail(request.id, "storage_full");
			return;
		}
		const descriptor: ChunkDescriptorV1 = {
			schemaVersion: 1,
			sessionId: session.sessionId,
			streamId: stream.streamId,
			sequence,
			encoding: "arrow-ipc",
			rowCount: meta.rowCount,
			byteLength: payload.byteLength,
			checksum: checksumOf(payload),
			startUs: meta.startUs,
			endUs: meta.endUs,
			sampleIndexStart: meta.sampleIndexStart,
			discontinuityBefore: meta.discontinuityBefore,
			opfsPath: "",
			committedAtUtcMs: nowUtcMs(),
			payloadState: "idb",
		};
		const result: ChunkCommitResult = {
			sequence,
			storedBytes: payload.byteLength,
			usage: {
				usageBytes: host.committedBytes() + payload.byteLength,
				quotaBytes,
			},
		};
		host.chunks.set(key, {
			descriptor,
			payload: retainPayloads ? payload : undefined,
			result,
		});
		stream.expectedNextSequence = sequence + 1;
		stream.stats.chunkCount += 1;
		stream.stats.rowCount += meta.rowCount;
		stream.stats.byteCount += payload.byteLength;
		stream.stats.firstTimestampUs ??= meta.startUs;
		stream.stats.lastTimestampUs = meta.endUs;
		if (meta.discontinuityBefore) stream.stats.discontinuityCount += 1;
		session.stats.totalChunks += 1;
		session.stats.totalBytes += payload.byteLength;
		ok(request.id, result);
	}

	function handleEvents(
		request: Extract<ClientToHost, { op: "event/append" }>,
	): void {
		const session = host.sessions.get(request.sessionId);
		if (!session) {
			fail(request.id, "unknown_session");
			return;
		}
		// Events belong to a live recording: a finalized or aborted session is
		// sealed, exactly as it is for chunk commits.
		if (session.state !== "recording") {
			fail(request.id, "bad_state", `session ${session.state}`);
			return;
		}
		if (!Array.isArray(request.events)) {
			fail(request.id, "invalid_payload");
			return;
		}
		if (request.events.length > BIOSIGNAL_LIMITS.maxEventBatch) {
			fail(request.id, "invalid_payload", "event batch too large");
			return;
		}
		for (const draft of request.events) {
			if (!isValidName(draft.name)) {
				fail(request.id, "invalid_payload", "bad event name");
				return;
			}
			if (
				draft.payload !== undefined &&
				JSON.stringify(draft.payload).length >
					BIOSIGNAL_LIMITS.maxEventPayloadBytes
			) {
				fail(request.id, "payload_too_large", "event payload too large");
				return;
			}
		}
		for (const draft of request.events) {
			host.events.push({
				schemaVersion: 1,
				eventId: nextId(),
				sessionId: session.sessionId,
				streamId: draft.streamId,
				timestampUs: draft.timestampUs,
				durationUs: draft.durationUs,
				kind: draft.kind,
				name: draft.name,
				payload: draft.payload,
				origin: "app",
			});
		}
		session.stats.eventCount += request.events.length;
		ok(request.id, { appended: request.events.length });
	}

	function handleClock(
		request: Extract<ClientToHost, { op: "clock/observe" }>,
	): void {
		const session = host.sessions.get(request.sessionId);
		if (!session) {
			fail(request.id, "unknown_session");
			return;
		}
		for (const draft of request.observations) {
			host.observations.push({
				schemaVersion: 1,
				sessionId: session.sessionId,
				...draft,
			});
		}
		ok(request.id, { recorded: request.observations.length });
	}

	function handleStreamClose(
		request: Extract<ClientToHost, { op: "stream/close" }>,
	): void {
		const session = host.sessions.get(request.sessionId);
		if (!session) {
			fail(request.id, "unknown_session");
			return;
		}
		const stream = host.streams.get(request.streamId);
		if (!stream || stream.sessionId !== session.sessionId) {
			fail(request.id, "unknown_stream");
			return;
		}
		if (stream.state !== "open") {
			fail(request.id, "bad_state", "stream already closed");
			return;
		}
		stream.state = "closed";
		stream.closedAtUs = request.endUs;
		ok(request.id, { stream });
	}

	function handleFinalize(
		request: Extract<ClientToHost, { op: "session/finalize" }>,
	): void {
		const session = host.sessions.get(request.sessionId);
		if (!session) {
			fail(request.id, "unknown_session");
			return;
		}
		if (!canTransitionSession(session.state, "finalizing")) {
			fail(request.id, "bad_state", `state ${session.state}`);
			return;
		}
		for (const stream of host.streams.values()) {
			if (stream.sessionId === session.sessionId && stream.state === "open") {
				stream.state = "closed";
				stream.closedAtUs = request.endUs;
			}
		}
		session.state = "complete";
		session.endReason = "finalized";
		session.endUs = request.endUs;
		session.endedAtUtcMs = nowUtcMs();
		ok(request.id, { session });
	}

	function handleAbort(
		request: Extract<ClientToHost, { op: "session/abort" }>,
	): void {
		const session = host.sessions.get(request.sessionId);
		if (!session) {
			fail(request.id, "unknown_session");
			return;
		}
		if (!canTransitionSession(session.state, "aborted")) {
			fail(request.id, "bad_state", `state ${session.state}`);
			return;
		}
		session.state = "aborted";
		session.endReason =
			request.reason === "storage_stalled"
				? "storage_stalled"
				: "aborted-by-app";
		session.endedAtUtcMs = nowUtcMs();
		ok(request.id, { session });
	}

	return host;
}
