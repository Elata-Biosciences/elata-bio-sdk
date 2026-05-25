import {
	type AppRecord,
	type ClientRequest,
	type HostResponse,
	INIT_MESSAGE_KIND,
	type QueryFilter,
	PROTOCOL_VERSION,
} from "./protocol";

export interface MetricsClient {
	record(input: { type: string; data: unknown }): Promise<{ id: string; timestamp: number }>;
	query(filter?: QueryFilter): Promise<AppRecord[]>;
	clear(): Promise<void>;
	/** True once the host handshake has completed. */
	isReady(): boolean;
}

export interface CreateMetricsClientOptions {
	/** Override target window for tests. Defaults to globalThis (inside the iframe). */
	target?: Window | typeof globalThis;
	/** Max ms to wait for the host handshake. Defaults to 5000. */
	handshakeTimeoutMs?: number;
	/** Per-request timeout. Defaults to 10000. */
	requestTimeoutMs?: number;
}

export function createMetricsClient(
	options: CreateMetricsClientOptions = {},
): MetricsClient {
	const target = (options.target ?? globalThis) as Window;
	const handshakeTimeoutMs = options.handshakeTimeoutMs ?? 5_000;
	const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;

	let port: MessagePort | null = null;
	const pending = new Map<
		string,
		{ resolve: (value: HostResponse) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
	>();

	const handshake = new Promise<MessagePort>((resolve, reject) => {
		const timer = setTimeout(() => {
			target.removeEventListener("message", onInit as EventListener);
			reject(new Error("metrics client: host handshake timed out"));
		}, handshakeTimeoutMs);

		const onInit = (event: MessageEvent<unknown>) => {
			const data = event.data;
			if (
				!data ||
				typeof data !== "object" ||
				(data as { kind?: unknown }).kind !== INIT_MESSAGE_KIND ||
				(data as { v?: unknown }).v !== PROTOCOL_VERSION
			) {
				return;
			}
			const incoming = event.ports[0];
			if (!incoming) return;
			clearTimeout(timer);
			target.removeEventListener("message", onInit as EventListener);
			incoming.onmessage = onPortMessage;
			incoming.start();
			port = incoming;
			resolve(incoming);
		};
		target.addEventListener("message", onInit as EventListener);
	});

	const onPortMessage = (event: MessageEvent<unknown>) => {
		const data = event.data as HostResponse | undefined;
		if (!data || typeof data !== "object" || typeof data.id !== "string") return;
		const entry = pending.get(data.id);
		if (!entry) return;
		clearTimeout(entry.timer);
		pending.delete(data.id);
		entry.resolve(data);
	};

	const send = async <T>(req: ClientRequest): Promise<T> => {
		const p = await handshake;
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				pending.delete(req.id);
				reject(new Error(`metrics client: request '${req.op}' timed out`));
			}, requestTimeoutMs);
			pending.set(req.id, {
				resolve: (resp) => {
					if (resp.ok) {
						resolve((resp.result as T) ?? (undefined as unknown as T));
					} else {
						reject(new Error(`metrics host error: ${resp.error}`));
					}
				},
				reject,
				timer,
			});
			p.postMessage(req);
		});
	};

	return {
		async record(input) {
			if (!input || typeof input.type !== "string") {
				throw new Error("metrics: record requires { type, data }");
			}
			return send<{ id: string; timestamp: number }>({
				v: PROTOCOL_VERSION,
				id: randomId(),
				op: "record",
				type: input.type,
				data: input.data,
			});
		},
		async query(filter = {}) {
			return send<AppRecord[]>({
				v: PROTOCOL_VERSION,
				id: randomId(),
				op: "query",
				filter,
			});
		},
		async clear() {
			await send<void>({
				v: PROTOCOL_VERSION,
				id: randomId(),
				op: "clear",
				scope: "app",
			});
		},
		isReady() {
			return port !== null;
		},
	};
}

function randomId(): string {
	const c =
		typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
			? globalThis.crypto
			: undefined;
	if (c) return c.randomUUID();
	return `r_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}
