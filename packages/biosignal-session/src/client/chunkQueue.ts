/**
 * Pure unACKed-chunk retention and retry policy (client side).
 *
 * Every encoded chunk is retained (an owned copy — the transferred wire
 * buffer is detached by `postMessage`) until its durable-commit ACK arrives.
 * Retries happen only for retryable failures (`internal`,
 * `storage_unavailable`, `rate_limited`), for the caller-approved
 * `checksum_mismatch` resend, and for ACK timeouts; backoff runs
 * 1 s → 30 s with injectable jitter and clock.
 *
 * Sequence discipline: chunks of a stream are only ever handed out for send
 * in sequence order, and a retryable failure of sequence N automatically
 * re-queues every later in-flight chunk of the same stream — MessagePort
 * ordering means those would otherwise arrive as a gap at the host and be
 * answered with a fatal `sequence_conflict`.
 */

import type { ChunkCommitMeta } from "../protocol/messages";
import { BIOSIGNAL_LIMITS } from "../protocol/messages";

export interface ChunkQueueEntry {
	streamId: string;
	sequence: number;
	/** Owned retained copy — never handed to `postMessage` directly. */
	payload: Uint8Array;
	meta: ChunkCommitMeta;
	/** Send attempts completed (0 = never sent). */
	attempts: number;
	/** Retryable failures + ACK timeouts observed (drives backoff). */
	failures: number;
	/** Monotonic ms of the last send, `null` while queued. */
	sentAtMs: number | null;
	/** Earliest monotonic ms this entry may be (re)sent. */
	notBeforeMs: number;
	/** Request id of the in-flight attempt, `null` while queued. */
	requestId: string | null;
}

export interface ChunkQueueConfig {
	ackTimeoutMs?: number;
	backoffBaseMs?: number;
	backoffMaxMs?: number;
	/** Uniform [0, 1) jitter source; defaults to `Math.random`. */
	jitter?: () => number;
}

export interface ChunkQueue {
	enqueue(
		streamId: string,
		sequence: number,
		payload: Uint8Array,
		meta: ChunkCommitMeta,
	): ChunkQueueEntry;
	/**
	 * Next entry eligible to send now, respecting per-stream sequence order,
	 * per-entry backoff, and the caller's window (`canSend`). Returns `null`
	 * when nothing is currently eligible. Call repeatedly to drain.
	 */
	nextSendable(
		nowMs: number,
		canSend: (streamId: string) => boolean,
	): ChunkQueueEntry | null;
	markSent(
		streamId: string,
		sequence: number,
		requestId: string,
		nowMs: number,
	): void;
	/** Remove and return an ACKed entry (`null` when unknown). */
	ack(streamId: string, sequence: number): ChunkQueueEntry | null;
	/**
	 * Handle a retryable failure or ACK timeout of one in-flight entry:
	 * schedules its resend with backoff and re-queues every later in-flight
	 * entry of the same stream (they would conflict at the host otherwise).
	 * Returns the re-queued later entries.
	 */
	requeueAfterFailure(
		streamId: string,
		sequence: number,
		nowMs: number,
	): ChunkQueueEntry[];
	/** Remove and return a fatally failed entry (`null` when unknown). */
	removeFatal(streamId: string, sequence: number): ChunkQueueEntry | null;
	/**
	 * Move in-flight entries whose ACK deadline passed back to the queue
	 * (with backoff and conflict-cascade). Returns the timed-out entries.
	 */
	expireTimedOut(nowMs: number): ChunkQueueEntry[];
	get(streamId: string, sequence: number): ChunkQueueEntry | undefined;
	/** In-flight entries, for one stream or across all streams. */
	inFlightCount(streamId?: string): number;
	hasPendingFor(streamId: string): boolean;
	size(): number;
	retainedBytes(): number;
	/** Backoff delay for a given failure count (exposed for tests). */
	backoffDelayMs(failures: number): number;
}

export function createChunkQueue(config: ChunkQueueConfig = {}): ChunkQueue {
	const ackTimeoutMs = config.ackTimeoutMs ?? BIOSIGNAL_LIMITS.ackTimeoutMs;
	const backoffBaseMs = config.backoffBaseMs ?? 1_000;
	const backoffMaxMs = config.backoffMaxMs ?? 30_000;
	const jitter = config.jitter ?? Math.random;

	/** Per stream, entries sorted by sequence (insertion is in order). */
	const byStream = new Map<string, ChunkQueueEntry[]>();

	const backoffDelayMs = (failures: number): number => {
		if (failures <= 0) return 0;
		const base = Math.min(backoffMaxMs, backoffBaseMs * 2 ** (failures - 1));
		return Math.min(backoffMaxMs, Math.round(base * (1 + 0.5 * jitter())));
	};

	const find = (
		streamId: string,
		sequence: number,
	): ChunkQueueEntry | undefined =>
		byStream.get(streamId)?.find((entry) => entry.sequence === sequence);

	const requeueLaterInFlight = (
		streamId: string,
		sequence: number,
	): ChunkQueueEntry[] => {
		const requeued: ChunkQueueEntry[] = [];
		for (const entry of byStream.get(streamId) ?? []) {
			if (entry.sequence > sequence && entry.sentAtMs !== null) {
				entry.sentAtMs = null;
				entry.requestId = null;
				entry.notBeforeMs = 0; // ordering alone gates them behind the failed one
				requeued.push(entry);
			}
		}
		return requeued;
	};

	return {
		enqueue(streamId, sequence, payload, meta) {
			const entry: ChunkQueueEntry = {
				streamId,
				sequence,
				payload,
				meta,
				attempts: 0,
				failures: 0,
				sentAtMs: null,
				notBeforeMs: 0,
				requestId: null,
			};
			const list = byStream.get(streamId);
			if (list) list.push(entry);
			else byStream.set(streamId, [entry]);
			return entry;
		},

		nextSendable(nowMs, canSend) {
			for (const [streamId, list] of byStream) {
				if (list.length === 0) continue;
				if (!canSend(streamId)) continue;
				// First queued entry in sequence order; everything before it is
				// in flight, so sending it preserves wire order.
				const candidate = list.find((entry) => entry.sentAtMs === null);
				if (!candidate) continue;
				if (candidate.notBeforeMs > nowMs) continue;
				return candidate;
			}
			return null;
		},

		markSent(streamId, sequence, requestId, nowMs) {
			const entry = find(streamId, sequence);
			if (!entry) return;
			entry.attempts += 1;
			entry.sentAtMs = nowMs;
			entry.requestId = requestId;
		},

		ack(streamId, sequence) {
			const list = byStream.get(streamId);
			if (!list) return null;
			const index = list.findIndex((entry) => entry.sequence === sequence);
			if (index < 0) return null;
			const [entry] = list.splice(index, 1);
			if (list.length === 0) byStream.delete(streamId);
			return entry;
		},

		requeueAfterFailure(streamId, sequence, nowMs) {
			const entry = find(streamId, sequence);
			if (!entry) return [];
			entry.failures += 1;
			entry.sentAtMs = null;
			entry.requestId = null;
			entry.notBeforeMs = nowMs + backoffDelayMs(entry.failures);
			return requeueLaterInFlight(streamId, sequence);
		},

		removeFatal(streamId, sequence) {
			return this.ack(streamId, sequence);
		},

		expireTimedOut(nowMs) {
			const expired: ChunkQueueEntry[] = [];
			for (const [streamId, list] of byStream) {
				for (const entry of [...list]) {
					if (entry.sentAtMs === null) continue;
					if (nowMs - entry.sentAtMs < ackTimeoutMs) continue;
					expired.push(entry);
					this.requeueAfterFailure(streamId, entry.sequence, nowMs);
				}
			}
			return expired;
		},

		get(streamId, sequence) {
			return find(streamId, sequence);
		},

		inFlightCount(streamId) {
			let total = 0;
			for (const [id, list] of byStream) {
				if (streamId !== undefined && id !== streamId) continue;
				for (const entry of list) {
					if (entry.sentAtMs !== null) total += 1;
				}
			}
			return total;
		},

		hasPendingFor(streamId) {
			return (byStream.get(streamId)?.length ?? 0) > 0;
		},

		size() {
			let total = 0;
			for (const list of byStream.values()) total += list.length;
			return total;
		},

		retainedBytes() {
			let total = 0;
			for (const list of byStream.values()) {
				for (const entry of list) total += entry.payload.byteLength;
			}
			return total;
		},

		backoffDelayMs,
	};
}
