/**
 * Analytics worker entry (`@elata-biosciences/biosignal-analytics/worker`).
 * Registers itself when loaded inside a Worker; `attachAnalyticsWorker` is
 * exported so hosts (and tests) can serve the same protocol over any
 * MessagePort. WASM initializes lazily on the first EEG request.
 */

import { analyzeEeg } from "../eeg/analyzeEeg.js";
import { AnalyticsError, toAnalyticsError } from "../errors.js";
import { hrvTimeDomain } from "../pulse/hrv.js";
import {
	ANALYTICS_WORKER_PROTOCOL_VERSION,
	isAnalyticsWorkerRequest,
	type AnalyticsPortLike,
	type AnalyticsWorkerResponse,
	type EegAnalyzePayload,
	type PulseHrvPayload,
} from "./protocol.js";

/**
 * Realm-independent `Float32Array` check. A structured clone arriving over a
 * port carries the *sending* realm's constructor, so `instanceof` is not
 * reliable across the worker boundary.
 */
function isFloat32Array(value: unknown): value is Float32Array {
	return Object.prototype.toString.call(value) === "[object Float32Array]";
}

function isEegAnalyzePayload(value: unknown): value is EegAnalyzePayload {
	if (value === null || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return (
		isFloat32Array(candidate.samples) &&
		typeof candidate.sampleRateHz === "number" &&
		Array.isArray(candidate.channels)
	);
}

function isPulseHrvPayload(value: unknown): value is PulseHrvPayload {
	if (value === null || typeof value !== "object") return false;
	return Array.isArray((value as Record<string, unknown>).ibisMs);
}

async function handleRequest(op: string, payload: unknown): Promise<unknown> {
	switch (op) {
		case "ping":
			return { pong: true, protocolVersion: ANALYTICS_WORKER_PROTOCOL_VERSION };
		case "pulse/hrv": {
			if (!isPulseHrvPayload(payload)) {
				throw new AnalyticsError(
					"invalid_input",
					"pulse/hrv payload must carry ibisMs[]",
				);
			}
			return hrvTimeDomain(payload.ibisMs.map((value) => Number(value)));
		}
		case "eeg/analyze": {
			if (!isEegAnalyzePayload(payload)) {
				throw new AnalyticsError(
					"invalid_input",
					"eeg/analyze payload must carry samples/sampleRateHz/channels",
				);
			}
			return analyzeEeg({
				samples: payload.samples,
				sampleRateHz: payload.sampleRateHz,
				channels: payload.channels.map((channel) => String(channel)),
				...(payload.windows !== undefined ? { windows: payload.windows } : {}),
				...(payload.config !== undefined ? { config: payload.config } : {}),
				...(payload.sessionId !== undefined
					? { sessionId: payload.sessionId }
					: {}),
				...(payload.streamId !== undefined
					? { streamId: payload.streamId }
					: {}),
				...(payload.startUs !== undefined ? { startUs: payload.startUs } : {}),
			});
		}
		default:
			throw new AnalyticsError("invalid_input", `unknown op '${op}'`);
	}
}

/** Serve the analytics protocol over `port` (used by tests and hosts). */
export function attachAnalyticsWorker(port: AnalyticsPortLike): () => void {
	port.onmessage = (event) => {
		const request = event.data;
		if (!isAnalyticsWorkerRequest(request)) {
			return; // Not ours (or wrong version): ignore rather than crash the port.
		}
		void handleRequest(request.op, request.payload)
			.then((payload) => {
				const response: AnalyticsWorkerResponse = {
					v: ANALYTICS_WORKER_PROTOCOL_VERSION,
					id: request.id,
					ok: true,
					payload,
				};
				port.postMessage(response);
			})
			.catch((error: unknown) => {
				const analyticsError = toAnalyticsError(error);
				const response: AnalyticsWorkerResponse = {
					v: ANALYTICS_WORKER_PROTOCOL_VERSION,
					id: request.id,
					ok: false,
					error: { code: analyticsError.code, message: analyticsError.message },
				};
				port.postMessage(response);
			});
	};
	port.start?.();
	return () => {
		port.onmessage = null;
	};
}

declare const WorkerGlobalScope: (new () => unknown) | undefined;

// Self-registration inside a real Worker (guarded so importing this module
// from a window/node context is side-effect free).
if (
	typeof WorkerGlobalScope !== "undefined" &&
	typeof self !== "undefined" &&
	self instanceof WorkerGlobalScope
) {
	attachAnalyticsWorker(self as unknown as AnalyticsPortLike);
}
