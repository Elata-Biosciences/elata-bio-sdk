/**
 * Client that runs inside the sandboxed app iframe.
 *
 * Listens for the host's `__elata_metrics_init` message, captures the transferred
 * `MessagePort`, and exposes a Promise-based API. All calls are async and route
 * over the port — apps never see raw storage.
 */

import {
	type AppRecord,
	type AppScore,
	type HostErrorCode,
	type HostResponse,
	INIT_MESSAGE_KIND,
	PROTOCOL_VERSION,
	type QueryFilter,
	type ScoreFilter,
} from "./protocol";

export type {
	AppRecord,
	AppScore,
	HostErrorCode,
	QueryFilter,
	ScoreFilter,
	ScoreOrder,
} from "./protocol";

export interface MetricsClientOptions {
	/**
	 * Window to listen on for the init handshake. Defaults to `window`. Tests
	 * inject a fake window.
	 */
	window?: Window;
	/**
	 * Milliseconds to wait for the host handshake before rejecting calls.
	 * Defaults to 5 seconds. Pass `Infinity` to wait forever.
	 */
	handshakeTimeoutMs?: number;
}

export interface RecordInput {
	type: string;
	data: unknown;
}

export interface SaveScoreInput {
	value: number;
	meta?: unknown;
}

export interface WriteResult {
	id: string;
	timestamp: number;
}

export interface MetricsClient {
	record(input: RecordInput): Promise<WriteResult>;
	query(filter?: QueryFilter): Promise<AppRecord[]>;
	clear(): Promise<void>;
	saveScore(input: SaveScoreInput): Promise<WriteResult>;
	loadScores(filter?: ScoreFilter): Promise<AppScore[]>;
	/** Whether the host handshake has completed. */
	isReady(): boolean;
	/** Resolves when the host handshake completes; rejects on timeout. */
	ready(): Promise<void>;
	/** Tear down listeners. Pending calls reject with `disposed`. */
	dispose(): void;
}

export class MetricsClientError extends Error {
	readonly code: HostErrorCode | "handshake_timeout" | "disposed" | "transport";
	constructor(
		code:
			| HostErrorCode
			| "handshake_timeout"
			| "disposed"
			| "transport",
		message: string,
	) {
		super(message);
		this.name = "MetricsClientError";
		this.code = code;
	}
}

interface PendingCall {
	resolve(value: unknown): void;
	reject(error: Error): void;
}

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5_000;

export function createMetricsClient(
	options: MetricsClientOptions = {},
): MetricsClient {
	const targetWindow = options.window ?? globalThis.window;
	if (!targetWindow) {
		throw new Error(
			"createMetricsClient: no window available (call this in a browser/jsdom context)",
		);
	}
	const handshakeTimeoutMs =
		options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;

	let port: MessagePort | null = null;
	let disposed = false;
	let nextId = 1;
	const pending = new Map<string, PendingCall>();

	let resolveReady: () => void;
	let rejectReady: (e: Error) => void;
	const readyPromise = new Promise<void>((resolve, reject) => {
		resolveReady = resolve;
		rejectReady = reject;
	});

	const handshakeTimer =
		handshakeTimeoutMs === Number.POSITIVE_INFINITY
			? null
			: setTimeout(() => {
					if (port || disposed) return;
					const err = new MetricsClientError(
						"handshake_timeout",
						`metrics host did not respond within ${handshakeTimeoutMs}ms`,
					);
					rejectReady(err);
					for (const call of pending.values()) call.reject(err);
					pending.clear();
				}, handshakeTimeoutMs);

	const onInit = (ev: MessageEvent<unknown>) => {
		if (port || disposed) return;
		const data = ev.data as Record<string, unknown> | null;
		if (!data || data.kind !== INIT_MESSAGE_KIND) return;
		if (data.v !== PROTOCOL_VERSION) return;
		const transferred = ev.ports?.[0];
		if (!transferred) return;
		port = transferred;
		port.onmessage = onPortMessage;
		port.start();
		if (handshakeTimer) clearTimeout(handshakeTimer);
		resolveReady();
	};

	const onPortMessage = (ev: MessageEvent<unknown>) => {
		const response = ev.data as HostResponse | null;
		if (
			!response ||
			typeof response !== "object" ||
			typeof (response as { id: unknown }).id !== "string"
		) {
			return;
		}
		const call = pending.get(response.id);
		if (!call) return;
		pending.delete(response.id);
		if (response.ok) {
			call.resolve(response.result);
		} else {
			call.reject(
				new MetricsClientError(response.error, `metrics host: ${response.error}`),
			);
		}
	};

	targetWindow.addEventListener("message", onInit);

	const send = <T>(request: Record<string, unknown>): Promise<T> => {
		if (disposed) {
			return Promise.reject(
				new MetricsClientError("disposed", "metrics client disposed"),
			);
		}
		const id = `c_${nextId++}`;
		const full = { v: PROTOCOL_VERSION, id, ...request };
		return new Promise<T>((resolve, reject) => {
			pending.set(id, {
				resolve: (v) => resolve(v as T),
				reject,
			});
			const dispatch = () => {
				if (!port) {
					reject(
						new MetricsClientError(
							"transport",
							"metrics host port not available",
						),
					);
					pending.delete(id);
					return;
				}
				try {
					port.postMessage(full);
				} catch (e) {
					pending.delete(id);
					reject(
						new MetricsClientError(
							"transport",
							e instanceof Error ? e.message : "postMessage failed",
						),
					);
				}
			};
			if (port) {
				dispatch();
			} else {
				readyPromise.then(dispatch, (err) => {
					pending.delete(id);
					reject(err);
				});
			}
		});
	};

	return {
		isReady: () => port !== null,
		ready: () => readyPromise,
		record: (input) =>
			send<WriteResult>({ op: "record", type: input.type, data: input.data }),
		query: (filter = {}) => send<AppRecord[]>({ op: "query", filter }),
		clear: () => send<void>({ op: "clear", scope: "app" }),
		saveScore: (input) =>
			send<WriteResult>({
				op: "saveScore",
				value: input.value,
				meta: input.meta,
			}),
		loadScores: (filter = {}) => send<AppScore[]>({ op: "loadScores", filter }),
		dispose() {
			if (disposed) return;
			disposed = true;
			if (handshakeTimer) clearTimeout(handshakeTimer);
			targetWindow.removeEventListener("message", onInit);
			if (port) {
				port.onmessage = null;
				port.close();
				port = null;
			}
			const err = new MetricsClientError("disposed", "metrics client disposed");
			for (const call of pending.values()) call.reject(err);
			pending.clear();
		},
	};
}
