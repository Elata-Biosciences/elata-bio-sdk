import {
	SESSION_PROTOCOL_VERSION,
	type ArrowChunkV1,
	type BeginSessionInputV1,
	type SessionEventV1,
	type SessionSourceV1,
	type SessionStreamV1,
} from "./contracts";
import { SessionError, type SessionErrorCode } from "./errors";
import { BiosignalSessionRecorder } from "./session";
import type { SessionStore } from "./storage";

type RequestBody =
	| { op: "begin"; input?: BeginSessionInputV1 }
	| { op: "resume"; sessionId: string }
	| { op: "source"; sessionId: string; source: SessionSourceV1 }
	| { op: "stream"; sessionId: string; stream: SessionStreamV1 }
	| {
			op: "chunk";
			sessionId: string;
			chunk: { descriptor: ArrowChunkV1["descriptor"]; payload: ArrayBuffer };
	  }
	| { op: "event"; sessionId: string; event: Omit<SessionEventV1, "sessionId"> }
	| { op: "finalize"; sessionId: string; endedAt?: string }
	| { op: "abort"; sessionId: string; endedAt?: string };

interface ProtocolRequest {
	protocolVersion: 1;
	requestId: number;
	body: RequestBody;
}
interface ProtocolResponse {
	protocolVersion: 1;
	requestId: number;
	ok: boolean;
	value?: unknown;
	error?: { code: SessionErrorCode; message: string };
}

export interface BindSessionHostOptions {
	store: SessionStore;
	scopeId: string;
	appId: string;
	maxChunkBytes?: number;
	maxEventBytes?: number;
}

export function bindSessionHost(
	port: MessagePort,
	options: BindSessionHostOptions,
): () => void {
	const recorders = new Map<string, BiosignalSessionRecorder>();
	const maxChunkBytes = options.maxChunkBytes ?? 1024 * 1024;
	const maxEventBytes = options.maxEventBytes ?? 64 * 1024;
	let disposed = false;
	let requestQueue = Promise.resolve();
	const handleRequest = async (
		message: MessageEvent<ProtocolRequest>,
	): Promise<void> => {
		const request = message.data;
		if (
			disposed ||
			request?.protocolVersion !== SESSION_PROTOCOL_VERSION ||
			!Number.isSafeInteger(request.requestId)
		)
			return;
		let response: ProtocolResponse;
		try {
			const body = request.body;
			if (!body || typeof body.op !== "string")
				throw new SessionError("transport", "Malformed request");
			let value: unknown;
			if (body.op === "begin") {
				const recorder = await BiosignalSessionRecorder.begin({
					...options,
					input: body.input,
				});
				recorders.set(recorder.sessionId, recorder);
				value = { sessionId: recorder.sessionId };
			} else if (body.op === "resume") {
				const recorder = await BiosignalSessionRecorder.resume(
					options.store,
					options.scopeId,
					body.sessionId,
				);
				recorders.set(recorder.sessionId, recorder);
				value = { sessionId: recorder.sessionId };
			} else {
				const recorder = recorders.get(body.sessionId);
				if (!recorder)
					throw new SessionError(
						"scope_denied",
						"Session is not owned by this port",
					);
				switch (body.op) {
					case "source":
						await recorder.addSource(body.source);
						break;
					case "stream":
						await recorder.addStream(body.stream);
						break;
					case "chunk": {
						if (
							!body.chunk.payload ||
							typeof body.chunk.payload.byteLength !== "number"
						)
							throw new SessionError(
								"invalid_chunk",
								"Chunk payload must be transferable",
							);
						if (body.chunk.payload.byteLength > maxChunkBytes)
							throw new SessionError(
								"payload_too_large",
								"Chunk exceeds host byte limit",
							);
						value = await recorder.writeChunk({
							descriptor: body.chunk.descriptor,
							payload: new Uint8Array(body.chunk.payload),
						});
						break;
					}
					case "event":
						if (
							new TextEncoder().encode(JSON.stringify(body.event)).byteLength >
							maxEventBytes
						) {
							throw new SessionError(
								"payload_too_large",
								"Event exceeds host byte limit",
							);
						}
						value = await recorder.appendEvent(body.event);
						break;
					case "finalize":
						await recorder.finalize(body.endedAt);
						recorders.delete(body.sessionId);
						break;
					case "abort":
						await recorder.abort(body.endedAt);
						recorders.delete(body.sessionId);
						break;
				}
			}
			response = {
				protocolVersion: 1,
				requestId: request.requestId,
				ok: true,
				value,
			};
		} catch (error) {
			const sessionError =
				error instanceof SessionError
					? error
					: new SessionError("internal", "Session host failed", error);
			response = {
				protocolVersion: 1,
				requestId: request.requestId,
				ok: false,
				error: { code: sessionError.code, message: sessionError.message },
			};
		}
		port.postMessage(response);
	};
	port.onmessage = (message: MessageEvent<ProtocolRequest>) => {
		requestQueue = requestQueue.then(() => handleRequest(message));
	};
	port.start();
	return () => {
		disposed = true;
		port.onmessage = null;
		port.close();
	};
}

export interface SessionClientOptions {
	maxInFlightPerStream?: number;
}

export const SESSION_CONNECT_MESSAGE =
	"elata.biosignal-session.connect/v1" as const;

export interface InstallSessionWindowHostOptions {
	store: SessionStore;
	resolveClient(event: MessageEvent): { scopeId: string; appId: string } | null;
	window?: Window;
	maxChunkBytes?: number;
	maxEventBytes?: number;
}

export function installSessionWindowHost(
	options: InstallSessionWindowHostOptions,
): () => void {
	const hostWindow = options.window ?? window;
	const bindings = new Set<() => void>();
	const listener = (event: MessageEvent) => {
		if (
			event.data?.type !== SESSION_CONNECT_MESSAGE ||
			event.data?.protocolVersion !== SESSION_PROTOCOL_VERSION
		)
			return;
		const client = options.resolveClient(event);
		const port = event.ports[0];
		if (!client || !port) return;
		bindings.add(
			bindSessionHost(port, {
				...client,
				store: options.store,
				maxChunkBytes: options.maxChunkBytes,
				maxEventBytes: options.maxEventBytes,
			}),
		);
	};
	hostWindow.addEventListener("message", listener);
	return () => {
		hostWindow.removeEventListener("message", listener);
		for (const dispose of bindings) dispose();
		bindings.clear();
	};
}

export function connectSessionClient(
	targetWindow: Pick<Window, "postMessage">,
	targetOrigin: string,
	options?: SessionClientOptions,
): SessionPortClient {
	const channel = new MessageChannel();
	targetWindow.postMessage(
		{
			type: SESSION_CONNECT_MESSAGE,
			protocolVersion: SESSION_PROTOCOL_VERSION,
		},
		targetOrigin,
		[channel.port2],
	);
	return new SessionPortClient(channel.port1, options);
}

export class SessionPortClient {
	private requestId = 0;
	private readonly pending = new Map<
		number,
		{ resolve(value: unknown): void; reject(error: unknown): void }
	>();
	private readonly active = new Map<string, number>();
	private readonly waiters = new Map<string, Array<() => void>>();
	private readonly limit: number;
	private disposed = false;

	constructor(
		private readonly port: MessagePort,
		options: SessionClientOptions = {},
	) {
		this.limit = options.maxInFlightPerStream ?? 2;
		if (!Number.isSafeInteger(this.limit) || this.limit < 1)
			throw new SessionError("transport", "Invalid in-flight limit");
		port.onmessage = (event: MessageEvent<ProtocolResponse>) =>
			this.receive(event.data);
		port.start();
	}

	async begin(input?: BeginSessionInputV1): Promise<string> {
		return ((await this.send({ op: "begin", input })) as { sessionId: string })
			.sessionId;
	}

	async resume(sessionId: string): Promise<string> {
		return (
			(await this.send({ op: "resume", sessionId })) as {
				sessionId: string;
			}
		).sessionId;
	}
	addSource(sessionId: string, source: SessionSourceV1): Promise<unknown> {
		return this.send({ op: "source", sessionId, source });
	}
	addStream(sessionId: string, stream: SessionStreamV1): Promise<unknown> {
		return this.send({ op: "stream", sessionId, stream });
	}
	appendEvent(
		sessionId: string,
		event: Omit<SessionEventV1, "sessionId">,
	): Promise<unknown> {
		return this.send({ op: "event", sessionId, event });
	}
	finalize(sessionId: string, endedAt?: string): Promise<unknown> {
		return this.send({ op: "finalize", sessionId, endedAt });
	}
	abort(sessionId: string, endedAt?: string): Promise<unknown> {
		return this.send({ op: "abort", sessionId, endedAt });
	}

	async writeChunk(
		sessionId: string,
		chunk: ArrowChunkV1,
	): Promise<"committed" | "duplicate"> {
		const key = `${sessionId}\u0000${chunk.descriptor.streamId}`;
		await this.acquire(key);
		try {
			const payload = chunk.payload.slice().buffer as ArrayBuffer;
			return (await this.send(
				{
					op: "chunk",
					sessionId,
					chunk: { descriptor: chunk.descriptor, payload },
				},
				[payload],
			)) as "committed" | "duplicate";
		} finally {
			this.release(key);
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.port.close();
		for (const item of this.pending.values())
			item.reject(new SessionError("disposed", "Session client was disposed"));
		this.pending.clear();
	}

	private send(
		body: RequestBody,
		transfer: Transferable[] = [],
	): Promise<unknown> {
		if (this.disposed)
			return Promise.reject(
				new SessionError("disposed", "Session client was disposed"),
			);
		const requestId = ++this.requestId;
		const request: ProtocolRequest = { protocolVersion: 1, requestId, body };
		return new Promise((resolve, reject) => {
			this.pending.set(requestId, { resolve, reject });
			try {
				this.port.postMessage(request, transfer);
			} catch (error) {
				this.pending.delete(requestId);
				reject(
					new SessionError(
						"transport",
						"Could not send session request",
						error,
					),
				);
			}
		});
	}

	private receive(response: ProtocolResponse): void {
		if (response?.protocolVersion !== SESSION_PROTOCOL_VERSION) return;
		const pending = this.pending.get(response.requestId);
		if (!pending) return;
		this.pending.delete(response.requestId);
		if (response.ok) pending.resolve(response.value);
		else
			pending.reject(
				new SessionError(
					response.error?.code ?? "transport",
					response.error?.message ?? "Session request failed",
				),
			);
	}

	private async acquire(key: string): Promise<void> {
		if ((this.active.get(key) ?? 0) >= this.limit) {
			await new Promise<void>((resolve) => {
				const queue = this.waiters.get(key) ?? [];
				queue.push(resolve);
				this.waiters.set(key, queue);
			});
		}
		this.active.set(key, (this.active.get(key) ?? 0) + 1);
	}

	private release(key: string): void {
		this.active.set(key, Math.max(0, (this.active.get(key) ?? 1) - 1));
		this.waiters.get(key)?.shift()?.();
	}
}
