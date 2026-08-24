/**
 * The recording engine — a plain class with no Worker APIs.
 *
 * Consumes the internal control/sample messages (`worker/workerMessages`),
 * drives the per-stream accumulators (`worker/sampleBuffer`), encodes closed
 * chunks to Arrow IPC file payloads with CRC32C checksums, and speaks the
 * wire protocol to a host over an injected `ProtocolPort`. Handles ACKs,
 * retries with backoff, the in-flight window, buffer-pressure degradation,
 * and the session lifecycle. `recordingWorker.ts` is the thin shell that
 * hosts this class inside a real dedicated worker.
 *
 * Time discipline: the engine never reads wall clocks for data — all sample
 * times arrive pre-assigned from the UI thread. The injected `now()` is a
 * worker-local monotonic clock used only for retry/backoff/heartbeat.
 */

import { checksumOf } from "../arrow/checksum";
import { encodeRowsChunk, encodeWideF32Chunk } from "../arrow/encode";
import { schemaForId } from "../arrow/schemas";
import type { ChunkIdentity } from "../arrow/schemas";
import type {
	SessionEventDraft,
	StreamDescriptorDraft,
} from "../contracts/session";
import type { SessionUs } from "../contracts/time";
import { isRetryableError } from "../protocol/errors";
import type { BiosignalErrorCode } from "../protocol/errors";
import {
	BIOSIGNAL_LIMITS,
	BIOSIGNAL_PROTOCOL_VERSION,
	isHostResponse,
} from "../protocol/messages";
import type {
	ChunkCommitMeta,
	ChunkCommitResult,
	HostToClient,
	QuotaUsage,
	SessionCreateSpec,
} from "../protocol/messages";
import { canTransitionClient } from "../protocol/stateMachine";
import type { ClientSessionState } from "../protocol/stateMachine";
import { createInFlightWindow } from "../protocol/window";
import { createChunkQueue } from "./chunkQueue";
import { createRowBuffer, createSampleBuffer } from "../worker/sampleBuffer";
import type { RowChunk, SampleChunk } from "../worker/sampleBuffer";
import type {
	ClientToRecorderWorker,
	ProtocolPort,
	RecorderConfig,
	RecorderWorkerToClient,
} from "../worker/workerMessages";

export interface RecorderCoreOptions {
	/** Engine → UI-thread event sink (worker shell wires `postMessage`). */
	emit: (message: RecorderWorkerToClient) => void;
	/** Worker-local monotonic ms for retries/heartbeat (never data time). */
	now?: () => number;
	/** Backoff jitter source, uniform [0, 1). */
	jitter?: () => number;
	requestId?: () => string;
}

interface PendingRequest {
	op: string;
	clientStreamId?: string;
	sequence?: number;
}

interface ParkedChunk {
	kind: "wide" | "rows";
	wide?: SampleChunk;
	rows?: RowChunk;
}

interface StreamRuntime {
	clientStreamId: string;
	draft: StreamDescriptorDraft;
	hostStreamId: string | null;
	openSent: boolean;
	sampleBuffer: ReturnType<typeof createSampleBuffer> | null;
	rowBuffer: ReturnType<typeof createRowBuffer> | null;
	channelNames: string[];
	nextSequence: number;
	/** Chunks closed before the host stream id was known. */
	parked: ParkedChunk[];
	lastTimeUs: SessionUs;
	closing: { endUs: SessionUs } | null;
	closeSent: boolean;
	closeAcked: boolean;
}

const ROW_BYTES_ESTIMATE = 32;

export class RecorderCore {
	private readonly emit: (message: RecorderWorkerToClient) => void;
	private readonly now: () => number;
	private readonly jitter: () => number;
	private readonly nextRequestId: () => string;

	private port: ProtocolPort | null = null;
	private config: Required<RecorderConfig> = {
		inFlightWindow: BIOSIGNAL_LIMITS.defaultInFlightWindow,
		softBufferBytes: BIOSIGNAL_LIMITS.softBufferBytes,
		hardBufferBytes: BIOSIGNAL_LIMITS.hardBufferBytes,
		chunkTargetBytes: BIOSIGNAL_LIMITS.chunkTargetBytes,
		chunkMaxDurationUs: BIOSIGNAL_LIMITS.chunkMaxDurationUs,
		ackTimeoutMs: BIOSIGNAL_LIMITS.ackTimeoutMs,
		heartbeatIntervalMs: BIOSIGNAL_LIMITS.heartbeatIntervalMs,
	};

	private clientState: ClientSessionState = "idle";
	private currentSessionId: string | null = null;
	private queue = createChunkQueue();
	private pressureWindow = createInFlightWindow();
	private readonly pending = new Map<string, PendingRequest>();
	private readonly streams = new Map<string, StreamRuntime>();
	private readonly deferredOpens: string[] = [];

	private stopRequest: { mode: "finalize" | "abort"; reason?: string } | null =
		null;
	private finalizeSent = false;
	private committedChunks = 0;
	private committedBytes = 0;
	private maxEndUs: SessionUs = 0;
	private lastUsage: QuotaUsage | undefined;
	private lastPingAtMs = 0;

	constructor(options: RecorderCoreOptions) {
		this.emit = options.emit;
		this.now = options.now ?? (() => performance.now());
		this.jitter = options.jitter ?? Math.random;
		let requestCounter = 0;
		this.nextRequestId = options.requestId ?? (() => `c-${++requestCounter}`);
		this.queue = createChunkQueue({ jitter: this.jitter });
	}

	state(): ClientSessionState {
		return this.clientState;
	}

	sessionId(): string | null {
		return this.currentSessionId;
	}

	handle(message: ClientToRecorderWorker): void {
		switch (message.t) {
			case "init":
				this.handleInit(message.port, message.config);
				return;
			case "session/start":
				this.handleSessionStart(message.spec);
				return;
			case "stream/open":
				this.handleStreamOpen(message.clientStreamId, message.draft);
				return;
			case "samples":
				this.handleSamples(
					message.clientStreamId,
					message.data,
					message.rows,
					message.channels,
					message.sampleIndex0,
					message.timeUs0,
				);
				return;
			case "irregular":
				this.handleIrregular(
					message.clientStreamId,
					message.timesUs,
					message.data,
					message.rows,
				);
				return;
			case "metricRow":
				this.handleMetricRow(
					message.clientStreamId,
					message.timeUs,
					message.row,
				);
				return;
			case "event":
				this.sendEvents(message.events);
				return;
			case "clock":
				this.request("clock/observe", {
					sessionId: this.currentSessionId,
					observations: message.observations,
				});
				return;
			case "discontinuityHint":
				this.streams
					.get(message.clientStreamId)
					?.sampleBuffer?.hintDiscontinuity(message.reason);
				return;
			case "stream/close":
				this.handleStreamClose(message.clientStreamId, message.endUs);
				return;
			case "session/stop":
				this.handleSessionStop(message.mode, message.reason);
				return;
			case "flush":
				this.flushAllStreams();
				this.pump();
				return;
		}
	}

	/** Advance timers: ACK timeouts, retry backoff, heartbeat. */
	tick(): void {
		if (this.port === null) return;
		const nowMs = this.now();
		const expired = this.queue.expireTimedOut(nowMs);
		if (expired.length > 0) {
			// Their in-flight request ids are stale now — late replies must miss.
			for (const [id, request] of this.pending) {
				if (
					request.op !== "chunk/commit" ||
					request.clientStreamId === undefined
				) {
					continue;
				}
				const stream = this.streams.get(request.clientStreamId);
				const entry =
					stream !== undefined && request.sequence !== undefined
						? this.queue.get(request.clientStreamId, request.sequence)
						: undefined;
				if (entry && entry.requestId !== id) this.pending.delete(id);
			}
		}
		if (
			(this.clientState === "recording" ||
				this.clientState === "degraded" ||
				this.clientState === "finalizing") &&
			nowMs - this.lastPingAtMs >= this.config.heartbeatIntervalMs
		) {
			this.lastPingAtMs = nowMs;
			this.request("ping", {});
		}
		this.pump();
	}

	// ── message handlers ──────────────────────────────────────────────

	private handleInit(port: ProtocolPort, config?: RecorderConfig): void {
		if (this.port !== null) {
			this.emitError("internal", false, "duplicate init ignored");
			return;
		}
		this.config = { ...this.config, ...config };
		this.queue = createChunkQueue({
			ackTimeoutMs: this.config.ackTimeoutMs,
			jitter: this.jitter,
		});
		this.pressureWindow = createInFlightWindow({
			inFlightWindow: this.config.inFlightWindow,
			softBufferBytes: this.config.softBufferBytes,
			hardBufferBytes: this.config.hardBufferBytes,
		});
		this.port = port;
		port.onmessage = (event) => this.onHostMessage(event.data);
		port.start?.();
		this.setState("handshaking");
		this.lastPingAtMs = this.now();
		this.request("ping", {});
	}

	private handleSessionStart(spec: SessionCreateSpec): void {
		if (this.clientState !== "ready") {
			this.emitError("bad_state", false, `cannot start in ${this.clientState}`);
			return;
		}
		this.setState("creating");
		this.request("session/create", { spec });
	}

	private handleStreamOpen(
		clientStreamId: string,
		draft: StreamDescriptorDraft,
	): void {
		if (this.streams.has(clientStreamId)) {
			this.emitError(
				"invalid_payload",
				false,
				`duplicate stream ${clientStreamId}`,
			);
			return;
		}
		const channelNames = draft.channels.map((channel) => channel.name);
		const regular =
			draft.sampling === "regular" &&
			draft.arrowSchemaId === "regular-wide-f32@1";
		const runtime: StreamRuntime = {
			clientStreamId,
			draft,
			hostStreamId: null,
			openSent: false,
			sampleBuffer: regular
				? createSampleBuffer({
						channelCount: channelNames.length,
						sampleRateHz: draft.sampleRateHz ?? 1,
						chunkTargetBytes: this.config.chunkTargetBytes,
						chunkMaxDurationUs: this.config.chunkMaxDurationUs,
					})
				: null,
			rowBuffer: regular
				? null
				: createRowBuffer({
						chunkMaxDurationUs: this.config.chunkMaxDurationUs,
					}),
			channelNames,
			nextSequence: 0,
			parked: [],
			lastTimeUs: 0,
			closing: null,
			closeSent: false,
			closeAcked: false,
		};
		this.streams.set(clientStreamId, runtime);
		if (this.currentSessionId === null) {
			this.deferredOpens.push(clientStreamId);
		} else {
			this.sendStreamOpen(runtime);
		}
	}

	private handleSamples(
		clientStreamId: string,
		data: ArrayBuffer,
		rows: number,
		channels: number,
		sampleIndex0: number,
		timeUs0: SessionUs,
	): void {
		const stream = this.streams.get(clientStreamId);
		if (!stream || !stream.sampleBuffer) {
			this.emitError(
				"invalid_payload",
				false,
				`unknown regular stream ${clientStreamId}`,
			);
			return;
		}
		if (!this.acceptingData()) return;
		if (channels !== stream.channelNames.length) {
			this.emitError("invalid_payload", false, "channel count mismatch");
			return;
		}
		const closed = stream.sampleBuffer.pushRegular(
			new Float32Array(data),
			rows,
			sampleIndex0,
			timeUs0,
		);
		const stats = stream.sampleBuffer.stats();
		stream.lastTimeUs = stats.lastSampleTimeUs ?? stream.lastTimeUs;
		for (const chunk of closed) this.acceptWideChunk(stream, chunk);
		this.pump();
	}

	private handleIrregular(
		clientStreamId: string,
		timesUs: ArrayBuffer,
		data: ArrayBuffer,
		rows: number,
	): void {
		const stream = this.streams.get(clientStreamId);
		if (!stream || !stream.rowBuffer) {
			this.emitError(
				"invalid_payload",
				false,
				`unknown irregular stream ${clientStreamId}`,
			);
			return;
		}
		if (!this.acceptingData()) return;
		const times = new Float64Array(timesUs);
		const values = new Float32Array(data);
		const channels = stream.channelNames;
		for (let row = 0; row < rows; row++) {
			const record: Record<string, unknown> = {};
			for (let channel = 0; channel < channels.length; channel++) {
				record[channels[channel]] = values[row * channels.length + channel];
			}
			const timeUs = times[row];
			stream.lastTimeUs = Math.max(stream.lastTimeUs, timeUs);
			for (const chunk of stream.rowBuffer.push(timeUs, record)) {
				this.acceptRowChunk(stream, chunk);
			}
		}
		this.pump();
	}

	private handleMetricRow(
		clientStreamId: string,
		timeUs: SessionUs,
		row: Record<string, unknown>,
	): void {
		const stream = this.streams.get(clientStreamId);
		if (!stream || !stream.rowBuffer) {
			this.emitError(
				"invalid_payload",
				false,
				`unknown metric stream ${clientStreamId}`,
			);
			return;
		}
		if (!this.acceptingData()) return;
		stream.lastTimeUs = Math.max(stream.lastTimeUs, timeUs);
		for (const chunk of stream.rowBuffer.push(timeUs, row)) {
			this.acceptRowChunk(stream, chunk);
		}
		this.pump();
	}

	private handleStreamClose(clientStreamId: string, endUs: SessionUs): void {
		const stream = this.streams.get(clientStreamId);
		if (!stream || stream.closing !== null) return;
		this.flushStream(stream);
		stream.closing = { endUs };
		this.pump();
	}

	private handleSessionStop(mode: "finalize" | "abort", reason?: string): void {
		if (
			this.clientState !== "recording" &&
			this.clientState !== "degraded" &&
			this.clientState !== "creating"
		) {
			this.emitError("bad_state", false, `cannot stop in ${this.clientState}`);
			return;
		}
		if (mode === "abort") {
			this.setState("aborted");
			this.request("session/abort", {
				sessionId: this.currentSessionId,
				reason: reason ?? "aborted-by-app",
			});
			this.emitClosed(reason ?? "aborted-by-app");
			return;
		}
		this.stopRequest = { mode, reason };
		this.setState("finalizing");
		for (const stream of this.streams.values()) {
			if (stream.closing === null) {
				this.flushStream(stream);
				stream.closing = { endUs: stream.lastTimeUs };
			}
		}
		this.pump();
	}

	// ── chunk intake ─────────────────────────────────────────────────

	private acceptingData(): boolean {
		return (
			this.clientState === "creating" ||
			this.clientState === "recording" ||
			this.clientState === "degraded"
		);
	}

	private acceptWideChunk(stream: StreamRuntime, chunk: SampleChunk): void {
		const rawBytes = chunk.rowCount * stream.channelNames.length * 4;
		this.pressureWindow.addBufferedBytes(rawBytes);
		if (this.readyToEncode(stream)) {
			this.encodeAndEnqueue(stream, { kind: "wide", wide: chunk }, rawBytes);
		} else {
			stream.parked.push({ kind: "wide", wide: chunk });
		}
		this.checkPressure();
	}

	private acceptRowChunk(stream: StreamRuntime, chunk: RowChunk): void {
		const rawBytes = chunk.rowCount * ROW_BYTES_ESTIMATE;
		this.pressureWindow.addBufferedBytes(rawBytes);
		if (this.readyToEncode(stream)) {
			this.encodeAndEnqueue(stream, { kind: "rows", rows: chunk }, rawBytes);
		} else {
			stream.parked.push({ kind: "rows", rows: chunk });
		}
		this.checkPressure();
	}

	private readyToEncode(stream: StreamRuntime): boolean {
		return stream.hostStreamId !== null && this.currentSessionId !== null;
	}

	private encodeAndEnqueue(
		stream: StreamRuntime,
		parked: ParkedChunk,
		rawBytes: number,
	): void {
		const sessionId = this.currentSessionId;
		const hostStreamId = stream.hostStreamId;
		if (sessionId === null || hostStreamId === null) return;
		const identity: ChunkIdentity = {
			sessionId,
			streamId: hostStreamId,
			arrowSchemaId: stream.draft.arrowSchemaId ?? "regular-wide-f32@1",
		};
		let payload: Uint8Array;
		let meta: ChunkCommitMeta;
		if (parked.kind === "wide" && parked.wide) {
			const chunk = parked.wide;
			payload = encodeWideF32Chunk(
				stream.channelNames,
				chunk.channelColumns,
				identity,
			);
			meta = {
				rowCount: chunk.rowCount,
				byteLength: payload.byteLength,
				checksum: checksumOf(payload),
				startUs: chunk.startUs,
				endUs: chunk.endUs,
				sampleIndexStart: chunk.sampleIndexStart,
				discontinuityBefore: chunk.discontinuityBefore,
			};
		} else if (parked.kind === "rows" && parked.rows) {
			const chunk = parked.rows;
			const schema = schemaForId(
				identity.arrowSchemaId,
				identity,
				stream.channelNames,
			);
			payload = encodeRowsChunk(schema, chunk.rows);
			meta = {
				rowCount: chunk.rowCount,
				byteLength: payload.byteLength,
				checksum: checksumOf(payload),
				startUs: chunk.startUs,
				endUs: chunk.endUs,
			};
		} else {
			return;
		}
		this.pressureWindow.releaseBufferedBytes(rawBytes);
		this.pressureWindow.addBufferedBytes(payload.byteLength);
		const sequence = stream.nextSequence++;
		this.queue.enqueue(stream.clientStreamId, sequence, payload, meta);
		if (meta.discontinuityBefore) {
			this.sendEvents([
				{
					streamId: hostStreamId,
					timestampUs: meta.discontinuityBefore.actualStartUs,
					kind: "discontinuity",
					name: "stream.discontinuity",
					payload: { ...meta.discontinuityBefore, sequence },
				},
			]);
		}
	}

	private flushStream(stream: StreamRuntime): void {
		if (stream.sampleBuffer) {
			const chunk = stream.sampleBuffer.flush();
			if (chunk) this.acceptWideChunk(stream, chunk);
			const stats = stream.sampleBuffer.stats();
			stream.lastTimeUs = stats.lastSampleTimeUs ?? stream.lastTimeUs;
		}
		if (stream.rowBuffer) {
			const chunk = stream.rowBuffer.flush();
			if (chunk) this.acceptRowChunk(stream, chunk);
		}
	}

	private flushAllStreams(): void {
		for (const stream of this.streams.values()) this.flushStream(stream);
	}

	// ── sending ──────────────────────────────────────────────────────

	private request(op: string, fields: Record<string, unknown>): string {
		const id = this.nextRequestId();
		this.pending.set(id, { op });
		this.port?.postMessage({
			v: BIOSIGNAL_PROTOCOL_VERSION,
			id,
			op,
			...fields,
		});
		return id;
	}

	private sendStreamOpen(stream: StreamRuntime): void {
		if (stream.openSent || this.currentSessionId === null) return;
		stream.openSent = true;
		const id = this.request("stream/open", {
			sessionId: this.currentSessionId,
			stream: stream.draft,
		});
		this.pending.set(id, {
			op: "stream/open",
			clientStreamId: stream.clientStreamId,
		});
	}

	private sendEvents(events: SessionEventDraft[]): void {
		if (this.currentSessionId === null) return;
		for (
			let start = 0;
			start < events.length;
			start += BIOSIGNAL_LIMITS.maxEventBatch
		) {
			this.request("event/append", {
				sessionId: this.currentSessionId,
				events: events.slice(start, start + BIOSIGNAL_LIMITS.maxEventBatch),
			});
		}
	}

	private pump(): void {
		if (
			this.clientState !== "recording" &&
			this.clientState !== "degraded" &&
			this.clientState !== "finalizing"
		) {
			return;
		}
		const nowMs = this.now();
		const canSend = (clientStreamId: string): boolean => {
			const stream = this.streams.get(clientStreamId);
			if (!stream || stream.hostStreamId === null) return false;
			return (
				this.queue.inFlightCount(clientStreamId) < this.config.inFlightWindow
			);
		};
		for (;;) {
			const entry = this.queue.nextSendable(nowMs, canSend);
			if (!entry) break;
			const stream = this.streams.get(entry.streamId);
			if (!stream || stream.hostStreamId === null) break;
			// Fresh checksum over the retained copy — a resend after transit
			// corruption is automatically valid again.
			entry.meta.checksum = checksumOf(entry.payload);
			const id = this.nextRequestId();
			this.pending.set(id, {
				op: "chunk/commit",
				clientStreamId: entry.streamId,
				sequence: entry.sequence,
			});
			this.queue.markSent(entry.streamId, entry.sequence, id, nowMs);
			const wire = entry.payload.slice().buffer;
			this.port?.postMessage(
				{
					v: BIOSIGNAL_PROTOCOL_VERSION,
					id,
					op: "chunk/commit",
					sessionId: this.currentSessionId,
					streamId: stream.hostStreamId,
					sequence: entry.sequence,
					meta: entry.meta,
					payload: wire,
				},
				[wire],
			);
		}
		this.tryStreamCloses();
		this.maybeFinalize();
	}

	private tryStreamCloses(): void {
		for (const stream of this.streams.values()) {
			if (stream.closing === null || stream.closeSent) continue;
			if (stream.parked.length > 0) continue;
			if (this.queue.hasPendingFor(stream.clientStreamId)) continue;
			if (stream.hostStreamId === null) {
				// Never materialized on the host — nothing to close there.
				stream.closeSent = true;
				stream.closeAcked = true;
				continue;
			}
			stream.closeSent = true;
			const id = this.request("stream/close", {
				sessionId: this.currentSessionId,
				streamId: stream.hostStreamId,
				endUs: stream.closing.endUs,
			});
			this.pending.set(id, {
				op: "stream/close",
				clientStreamId: stream.clientStreamId,
			});
		}
	}

	private maybeFinalize(): void {
		if (this.stopRequest?.mode !== "finalize" || this.finalizeSent) return;
		if (this.queue.size() > 0) return;
		for (const stream of this.streams.values()) {
			if (stream.parked.length > 0) return;
			if (stream.closing !== null && !stream.closeAcked) return;
		}
		this.finalizeSent = true;
		this.request("session/finalize", {
			sessionId: this.currentSessionId,
			endUs: this.maxEndUs,
		});
	}

	// ── host replies ─────────────────────────────────────────────────

	private onHostMessage(data: unknown): void {
		if (!isHostResponse(data)) return;
		const message = data as HostToClient;
		if ("kind" in message && message.kind === "host/notice") {
			this.onNotice(message.notice, message.detail);
			return;
		}
		if (!("id" in message)) return;
		const request = this.pending.get(message.id);
		if (!request) return; // stale reply for a re-queued attempt
		this.pending.delete(message.id);
		if (message.ok) {
			this.onOkReply(request, message.result);
		} else {
			this.onErrorReply(
				request,
				message.error,
				message.retryable,
				message.detail,
			);
		}
	}

	private onNotice(notice: string, detail?: string): void {
		if (notice === "session-invalidated" || notice === "shutting-down") {
			if (
				this.clientState !== "complete" &&
				this.clientState !== "aborted" &&
				this.clientState !== "error"
			) {
				this.setState("aborted");
				this.emitError("session_invalidated", false, detail ?? notice);
				this.emitClosed("client-gone");
			}
		}
	}

	private onOkReply(request: PendingRequest, result: unknown): void {
		switch (request.op) {
			case "ping":
				if (this.clientState === "handshaking") this.setState("ready");
				return;
			case "session/create": {
				const parsed = result as
					| { sessionId?: string; session?: { sessionId?: string } }
					| undefined;
				const sessionId =
					parsed?.sessionId ?? parsed?.session?.sessionId ?? null;
				if (sessionId === null) {
					this.setState("error");
					this.emitError(
						"invalid_payload",
						false,
						"create reply without sessionId",
					);
					return;
				}
				this.currentSessionId = sessionId;
				if (this.clientState === "creating") this.setState("recording");
				while (this.deferredOpens.length > 0) {
					const clientStreamId = this.deferredOpens.shift();
					const stream =
						clientStreamId !== undefined
							? this.streams.get(clientStreamId)
							: undefined;
					if (stream) this.sendStreamOpen(stream);
				}
				return;
			}
			case "stream/open": {
				const stream = request.clientStreamId
					? this.streams.get(request.clientStreamId)
					: undefined;
				if (!stream) return;
				const parsed = result as
					| { streamId?: string; stream?: { streamId?: string } }
					| undefined;
				const hostStreamId =
					parsed?.streamId ?? parsed?.stream?.streamId ?? null;
				if (hostStreamId === null) {
					this.setState("error");
					this.emitError(
						"invalid_payload",
						false,
						"open reply without streamId",
					);
					return;
				}
				stream.hostStreamId = hostStreamId;
				this.emit({
					t: "stream-open",
					clientStreamId: stream.clientStreamId,
					streamId: hostStreamId,
				});
				const parked = stream.parked.splice(0);
				for (const chunk of parked) {
					const rawBytes =
						chunk.kind === "wide" && chunk.wide
							? chunk.wide.rowCount * stream.channelNames.length * 4
							: (chunk.rows?.rowCount ?? 0) * ROW_BYTES_ESTIMATE;
					this.encodeAndEnqueue(stream, chunk, rawBytes);
				}
				this.pump();
				return;
			}
			case "chunk/commit": {
				if (
					request.clientStreamId === undefined ||
					request.sequence === undefined
				) {
					return;
				}
				const entry = this.queue.ack(request.clientStreamId, request.sequence);
				if (!entry) return;
				this.pressureWindow.releaseBufferedBytes(entry.payload.byteLength);
				this.committedChunks += 1;
				this.committedBytes += entry.payload.byteLength;
				this.maxEndUs = Math.max(this.maxEndUs, entry.meta.endUs);
				const commitResult = result as ChunkCommitResult | undefined;
				if (commitResult?.usage) this.lastUsage = commitResult.usage;
				this.emitProgress();
				this.checkPressure();
				this.pump();
				return;
			}
			case "stream/close": {
				const stream = request.clientStreamId
					? this.streams.get(request.clientStreamId)
					: undefined;
				if (stream) stream.closeAcked = true;
				this.maybeFinalize();
				return;
			}
			case "session/finalize":
				if (this.clientState === "finalizing") this.setState("complete");
				this.emitClosed("finalized");
				return;
			case "session/abort":
				return;
			default:
				return;
		}
	}

	private onErrorReply(
		request: PendingRequest,
		code: BiosignalErrorCode,
		retryable: boolean,
		detail?: string,
	): void {
		if (request.op === "chunk/commit") {
			if (
				request.clientStreamId === undefined ||
				request.sequence === undefined
			) {
				return;
			}
			const resendable =
				retryable || isRetryableError(code) || code === "checksum_mismatch";
			if (resendable) {
				const requeued = this.queue.requeueAfterFailure(
					request.clientStreamId,
					request.sequence,
					this.now(),
				);
				// Cascaded entries: drop their stale pending request mappings so
				// late (sequence_conflict) replies for them are ignored.
				for (const [id, pendingRequest] of this.pending) {
					if (pendingRequest.op !== "chunk/commit") continue;
					if (pendingRequest.clientStreamId !== request.clientStreamId)
						continue;
					if (
						requeued.some((entry) => entry.sequence === pendingRequest.sequence)
					) {
						this.pending.delete(id);
					}
				}
				this.emitError(code, true, detail);
				this.pump();
				return;
			}
			this.queue.removeFatal(request.clientStreamId, request.sequence);
			this.emitError(code, false, detail);
			if (this.clientState !== "error") this.setState("error");
			return;
		}
		if (request.op === "event/append" || request.op === "clock/observe") {
			this.emitError(code, retryable, detail);
			return;
		}
		if (request.op === "ping") {
			if (this.clientState === "handshaking") {
				this.setState("error");
				this.emitError(code, false, detail ?? "handshake ping failed");
			}
			return;
		}
		// session/create, stream/open, stream/close, session/finalize, abort…
		this.emitError(code, retryable, detail);
		if (
			this.clientState !== "complete" &&
			this.clientState !== "aborted" &&
			this.clientState !== "error"
		) {
			this.setState("error");
		}
	}

	// ── pressure, state, emissions ───────────────────────────────────

	private checkPressure(): void {
		const pressure = this.pressureWindow.pressure();
		if (pressure === "stalled") {
			if (
				this.clientState === "recording" ||
				this.clientState === "degraded" ||
				this.clientState === "finalizing"
			) {
				this.setState("aborted");
				this.request("session/abort", {
					sessionId: this.currentSessionId,
					reason: "storage_stalled",
				});
				this.emitError(
					"storage_unavailable",
					false,
					"hard buffer limit reached",
				);
				this.emitClosed("storage_stalled");
			}
			return;
		}
		if (pressure === "degraded" && this.clientState === "recording") {
			this.setState("degraded");
			this.sendEvents([
				{
					timestampUs: this.maxEndUs,
					kind: "quality",
					name: "buffer.soft-limit",
					payload: { bufferedBytes: this.pressureWindow.bufferedBytes() },
				},
			]);
			return;
		}
		if (pressure === "ok" && this.clientState === "degraded") {
			this.setState("recording");
		}
	}

	private setState(to: ClientSessionState): void {
		if (!canTransitionClient(this.clientState, to)) {
			// A state-machine violation is an engine bug — surface it loudly.
			this.emitError(
				"internal",
				false,
				`illegal client transition ${this.clientState} → ${to}`,
			);
			return;
		}
		this.clientState = to;
		this.emit({
			t: "state",
			state: to,
			sessionId: this.currentSessionId ?? undefined,
		});
	}

	private emitProgress(): void {
		this.emit({
			t: "progress",
			committedChunks: this.committedChunks,
			committedBytes: this.committedBytes,
			bufferedBytes: this.pressureWindow.bufferedBytes(),
			inFlight: this.queue.inFlightCount(),
			usage: this.lastUsage,
		});
	}

	private emitError(
		code: BiosignalErrorCode | "handshake_timeout" | "disposed" | "transport",
		retryable: boolean,
		detail?: string,
	): void {
		this.emit({ t: "error", code, retryable, detail });
	}

	private emitClosed(endReason: string): void {
		this.emit({
			t: "closed",
			summary: {
				sessionId: this.currentSessionId,
				endUs: this.maxEndUs,
				totalChunks: this.committedChunks,
				totalBytes: this.committedBytes,
				endReason,
			},
		});
	}
}
