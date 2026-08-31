/**
 * Main-thread client for the analytics worker. Mirrors the package's direct
 * APIs over the versioned envelope protocol; `Float32Array` inputs are
 * transferred, not copied. Inject `createWorker` (or a raw `port`) for
 * environments without module-worker support.
 */

import type { EegAnalysisResult } from "../eeg/analyzeEeg.js";
import { AnalyticsError } from "../errors.js";
import type { HrvTimeDomain } from "../pulse/hrv.js";
import {
	ANALYTICS_WORKER_PROTOCOL_VERSION,
	isAnalyticsWorkerResponse,
	type AnalyticsPortLike,
	type AnalyticsWorkerOp,
	type EegAnalyzePayload,
} from "./protocol.js";

interface WorkerLike extends AnalyticsPortLike {
	terminate?(): void;
}

export interface AnalyticsWorkerClientOptions {
	/**
	 * Worker factory. Pass `launchAnalyticsWorker` for the packaged module
	 * worker; it lives in its own module because `import.meta` cannot be
	 * parsed by Jest's CJS transform.
	 */
	createWorker?: () => WorkerLike;
	/** Bypass worker creation entirely (tests, host-owned ports). */
	port?: AnalyticsPortLike;
}

export interface AnalyticsWorkerClient {
	ping(): Promise<{ pong: true; protocolVersion: number }>;
	analyzeEeg(payload: EegAnalyzePayload): Promise<EegAnalysisResult>;
	hrvTimeDomain(ibisMs: readonly number[]): Promise<HrvTimeDomain>;
	dispose(): void;
}

export function createAnalyticsWorkerClient(
	opts: AnalyticsWorkerClientOptions = {},
): AnalyticsWorkerClient {
	if (opts.port === undefined && opts.createWorker === undefined) {
		throw new AnalyticsError(
			"unsupported",
			"createAnalyticsWorkerClient needs a `port` or a `createWorker` factory " +
				"(pass `launchAnalyticsWorker` for the packaged module worker)",
		);
	}
	const target: WorkerLike =
		opts.port ?? (opts.createWorker as () => WorkerLike)();
	const ownsWorker = opts.port === undefined;

	let nextId = 0;
	let disposed = false;
	const pending = new Map<
		string,
		{
			resolve: (value: unknown) => void;
			reject: (error: AnalyticsError) => void;
		}
	>();

	target.onmessage = (event) => {
		const response = event.data;
		if (!isAnalyticsWorkerResponse(response)) return;
		const entry = pending.get(response.id);
		if (entry === undefined) return;
		pending.delete(response.id);
		if (response.ok) {
			entry.resolve(response.payload);
		} else {
			entry.reject(
				new AnalyticsError(response.error.code, response.error.message),
			);
		}
	};
	target.start?.();

	function request(
		op: AnalyticsWorkerOp,
		payload?: unknown,
		transfer?: ArrayBuffer[],
	): Promise<unknown> {
		if (disposed) {
			return Promise.reject(
				new AnalyticsError("worker_terminated", "client is disposed"),
			);
		}
		const id = `req-${nextId++}`;
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			target.postMessage(
				{ v: ANALYTICS_WORKER_PROTOCOL_VERSION, id, op, payload },
				transfer ?? [],
			);
		});
	}

	return {
		async ping() {
			return (await request("ping")) as { pong: true; protocolVersion: number };
		},
		async analyzeEeg(payload: EegAnalyzePayload) {
			const transfer: ArrayBuffer[] =
				payload.samples.buffer instanceof ArrayBuffer
					? [payload.samples.buffer]
					: [];
			return (await request(
				"eeg/analyze",
				payload,
				transfer,
			)) as EegAnalysisResult;
		},
		async hrvTimeDomain(ibisMs: readonly number[]) {
			return (await request("pulse/hrv", {
				ibisMs: [...ibisMs],
			})) as HrvTimeDomain;
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			for (const entry of pending.values()) {
				entry.reject(
					new AnalyticsError("worker_terminated", "client disposed"),
				);
			}
			pending.clear();
			target.onmessage = null;
			if (ownsWorker) {
				target.terminate?.();
				target.close?.();
			}
		},
	};
}
