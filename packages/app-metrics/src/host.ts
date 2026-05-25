import { createMemoryAdapter } from "./adapters/memory";
import type { StorageAdapter } from "./adapters/types";
import {
	type ClientRequest,
	type HostErrorCode,
	type HostResponse,
	INIT_MESSAGE_KIND,
	isClientRequest,
	isValidType,
	PROTOCOL_VERSION,
	type StoredRecord,
	toAppRecord,
} from "./protocol";

export { createIndexedDbAdapter } from "./adapters/indexeddb";
export { createMemoryAdapter } from "./adapters/memory";
export type { StorageAdapter } from "./adapters/types";

export interface MetricsHostOptions {
	iframe: HTMLIFrameElement;
	appId: string;
	walletAddress: string;
	storage?: StorageAdapter;
	/** Default 5 MB. */
	quotaBytes?: number;
	/** Default 64 KB. */
	maxRecordBytes?: number;
	/** Default 100 writes / 60s. */
	writeRateLimit?: { count: number; windowMs: number };
	/** Override for tests. */
	now?: () => number;
	/** Override for tests. */
	randomId?: () => string;
}

export interface MetricsHost {
	/** Send the init message + transferred port to the iframe. Call after iframe load. */
	start(): void;
	/** Stop accepting messages and release resources. */
	stop(): void;
}

const DEFAULT_QUOTA = 5 * 1024 * 1024;
const DEFAULT_MAX_RECORD = 64 * 1024;
const DEFAULT_RATE = { count: 100, windowMs: 60_000 };

export function createMetricsHost(options: MetricsHostOptions): MetricsHost {
	const {
		iframe,
		appId,
		walletAddress,
		storage = createMemoryAdapter(),
		quotaBytes = DEFAULT_QUOTA,
		maxRecordBytes = DEFAULT_MAX_RECORD,
		writeRateLimit = DEFAULT_RATE,
		now = Date.now,
		randomId = defaultRandomId,
	} = options;

	if (!appId || typeof appId !== "string") {
		throw new Error("createMetricsHost: appId is required");
	}
	if (!walletAddress || typeof walletAddress !== "string") {
		throw new Error("createMetricsHost: walletAddress is required");
	}

	let port: MessagePort | null = null;
	let stopped = false;
	const writeTimestamps: number[] = [];

	const handleMessage = async (event: MessageEvent<unknown>) => {
		if (stopped) return;
		const req = event.data;
		if (!isClientRequest(req)) {
			respond({ v: 1, id: extractId(req), ok: false, error: "invalid_payload" });
			return;
		}
		try {
			const response = await dispatch(req);
			respond(response);
		} catch {
			respond({ v: 1, id: req.id, ok: false, error: "internal" });
		}
	};

	const respond = (response: HostResponse) => {
		if (!port || stopped) return;
		port.postMessage(response);
	};

	const dispatch = async (req: ClientRequest): Promise<HostResponse> => {
		if (req.op === "record") {
			return handleRecord(req);
		}
		if (req.op === "query") {
			const rows = await storage.query(walletAddress, appId, req.filter);
			return { v: 1, id: req.id, ok: true, result: rows.map(toAppRecord) };
		}
		if (req.op === "clear") {
			await storage.clearScope(walletAddress, appId);
			return { v: 1, id: req.id, ok: true };
		}
		return { v: 1, id: (req as { id: string }).id, ok: false, error: "invalid_payload" };
	};

	const handleRecord = async (
		req: Extract<ClientRequest, { op: "record" }>,
	): Promise<HostResponse> => {
		if (!isValidType(req.type)) {
			return { v: 1, id: req.id, ok: false, error: "invalid_payload" };
		}
		let serialized: string;
		try {
			serialized = JSON.stringify(req.data);
		} catch {
			return { v: 1, id: req.id, ok: false, error: "invalid_payload" };
		}
		if (serialized === undefined) {
			return { v: 1, id: req.id, ok: false, error: "invalid_payload" };
		}
		const sizeBytes = byteLength(serialized);
		if (sizeBytes > maxRecordBytes) {
			return { v: 1, id: req.id, ok: false, error: "invalid_payload" };
		}

		const rateError = checkRate();
		if (rateError) return { v: 1, id: req.id, ok: false, error: rateError };

		const existing = await storage.sumBytes(walletAddress, appId);
		if (existing + sizeBytes > quotaBytes) {
			return { v: 1, id: req.id, ok: false, error: "quota_exceeded" };
		}

		const record: StoredRecord = {
			id: randomId(),
			walletAddress,
			appId,
			type: req.type,
			data: JSON.parse(serialized),
			timestamp: now(),
			sizeBytes,
		};
		await storage.put(record);
		return { v: 1, id: req.id, ok: true, result: { id: record.id, timestamp: record.timestamp } };
	};

	const checkRate = (): HostErrorCode | null => {
		const t = now();
		const cutoff = t - writeRateLimit.windowMs;
		while (writeTimestamps.length > 0 && writeTimestamps[0]! < cutoff) {
			writeTimestamps.shift();
		}
		if (writeTimestamps.length >= writeRateLimit.count) {
			return "rate_limited";
		}
		writeTimestamps.push(t);
		return null;
	};

	return {
		start() {
			if (stopped) return;
			const win = iframe.contentWindow;
			if (!win) {
				throw new Error("createMetricsHost: iframe has no contentWindow yet — call start() after onload");
			}
			const channel = new MessageChannel();
			port = channel.port1;
			port.onmessage = handleMessage;
			port.start();
			win.postMessage(
				{ kind: INIT_MESSAGE_KIND, v: PROTOCOL_VERSION },
				"*",
				[channel.port2],
			);
		},
		stop() {
			stopped = true;
			if (port) {
				port.onmessage = null;
				port.close();
				port = null;
			}
		},
	};
}

function defaultRandomId(): string {
	const c =
		typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
			? globalThis.crypto
			: undefined;
	if (c) return c.randomUUID();
	return `id_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function byteLength(s: string): number {
	if (typeof TextEncoder !== "undefined") {
		return new TextEncoder().encode(s).byteLength;
	}
	return s.length;
}

function extractId(value: unknown): string {
	if (value && typeof value === "object" && "id" in value) {
		const id = (value as { id: unknown }).id;
		if (typeof id === "string") return id;
	}
	return "unknown";
}
