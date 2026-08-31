/**
 * Analytics worker wire protocol: versioned request/response envelopes over a
 * MessagePort. `Float32Array` payloads travel as transferables.
 */

import type { AnalyticsErrorCode } from "../errors.js";
import type { EegWindowConfigV1 } from "../eeg/eegWindowFeatures.js";

export const ANALYTICS_WORKER_PROTOCOL_VERSION = 1 as const;

export type AnalyticsWorkerOp = "ping" | "eeg/analyze" | "pulse/hrv";

export interface EegAnalyzePayload {
	/** Transferred interleaved samples. */
	samples: Float32Array;
	sampleRateHz: number;
	channels: readonly string[];
	windows?: { durationMs: number; stepMs: number };
	config?: EegWindowConfigV1;
	sessionId?: string;
	streamId?: string;
	startUs?: number;
}

export interface PulseHrvPayload {
	ibisMs: readonly number[];
}

export interface AnalyticsWorkerRequest {
	v: typeof ANALYTICS_WORKER_PROTOCOL_VERSION;
	id: string;
	op: AnalyticsWorkerOp;
	payload?: unknown;
}

export interface AnalyticsWorkerSuccess {
	v: typeof ANALYTICS_WORKER_PROTOCOL_VERSION;
	id: string;
	ok: true;
	payload: unknown;
}

export interface AnalyticsWorkerFailure {
	v: typeof ANALYTICS_WORKER_PROTOCOL_VERSION;
	id: string;
	ok: false;
	error: { code: AnalyticsErrorCode; message: string };
}

export type AnalyticsWorkerResponse =
	| AnalyticsWorkerSuccess
	| AnalyticsWorkerFailure;

export function isAnalyticsWorkerRequest(
	value: unknown,
): value is AnalyticsWorkerRequest {
	if (value === null || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return (
		candidate.v === ANALYTICS_WORKER_PROTOCOL_VERSION &&
		typeof candidate.id === "string" &&
		typeof candidate.op === "string"
	);
}

export function isAnalyticsWorkerResponse(
	value: unknown,
): value is AnalyticsWorkerResponse {
	if (value === null || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return (
		candidate.v === ANALYTICS_WORKER_PROTOCOL_VERSION &&
		typeof candidate.id === "string" &&
		typeof candidate.ok === "boolean"
	);
}

/** Minimal MessagePort surface shared by DOM and node:worker_threads ports. */
export interface AnalyticsPortLike {
	postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void;
	onmessage: ((event: { data: unknown }) => void) | null;
	start?(): void;
	close?(): void;
}
