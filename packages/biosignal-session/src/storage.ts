import type {
	ArrowChunkV1,
	SessionEventV1,
	SessionManifestV1,
	SessionSourceV1,
	SessionStreamV1,
	SessionSummaryV1,
} from "./contracts";
import { SessionError } from "./errors";
import { sha256Hex, streamSchemaSha256 } from "./hash";
import {
	validateChunk,
	validateEvent,
	validateManifest,
	validateSource,
	validateStream,
	validateSummary,
} from "./validation";

export interface SessionStore {
	create(scopeId: string, manifest: SessionManifestV1): Promise<void>;
	getManifest(
		scopeId: string,
		sessionId: string,
	): Promise<SessionManifestV1 | null>;
	listManifests(scopeId: string): Promise<SessionManifestV1[]>;
	addSource(
		scopeId: string,
		sessionId: string,
		source: SessionSourceV1,
	): Promise<void>;
	addStream(
		scopeId: string,
		sessionId: string,
		stream: SessionStreamV1,
	): Promise<void>;
	putChunk(
		scopeId: string,
		chunk: ArrowChunkV1,
	): Promise<"committed" | "duplicate">;
	getChunk(
		scopeId: string,
		sessionId: string,
		streamId: string,
		sequence: number,
	): Promise<ArrowChunkV1 | null>;
	appendEvent(
		scopeId: string,
		event: SessionEventV1,
	): Promise<"committed" | "duplicate">;
	listEvents(scopeId: string, sessionId: string): Promise<SessionEventV1[]>;
	putSummary(scopeId: string, summary: SessionSummaryV1): Promise<void>;
	getSummary(
		scopeId: string,
		sessionId: string,
	): Promise<SessionSummaryV1 | null>;
	setStatus(
		scopeId: string,
		sessionId: string,
		status: "complete" | "interrupted" | "aborted",
		endedAt?: string,
	): Promise<void>;
	recoverInterrupted(scopeId: string): Promise<string[]>;
	resume(scopeId: string, sessionId: string): Promise<void>;
	delete(scopeId: string, sessionId: string): Promise<void>;
}

export interface ChunkPayloadStore {
	put(scopeId: string, chunk: ArrowChunkV1): Promise<void>;
	get(
		scopeId: string,
		sessionId: string,
		streamId: string,
		sequence: number,
	): Promise<Uint8Array | null>;
	delete(
		scopeId: string,
		sessionId: string,
		streamId: string,
		sequence: number,
	): Promise<void>;
	deleteSession(scopeId: string, sessionId: string): Promise<void>;
}

interface StoredSession {
	manifest: SessionManifestV1;
	events: SessionEventV1[];
	summary: SessionSummaryV1 | null;
}

function clone<T>(value: T): T {
	return structuredClone(value);
}

function requireRecording(record: StoredSession): void {
	if (record.manifest.status !== "recording") {
		throw new SessionError(
			"invalid_state",
			`Session is ${record.manifest.status}`,
		);
	}
}

function sourceMatches(a: SessionSourceV1, b: SessionSourceV1): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function streamMatches(a: SessionStreamV1, b: SessionStreamV1): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

async function validatePayload(chunk: ArrowChunkV1): Promise<void> {
	validateChunk(chunk.descriptor);
	if (chunk.payload.byteLength !== chunk.descriptor.byteLength) {
		throw new SessionError(
			"invalid_chunk",
			"Chunk byte length does not match descriptor",
		);
	}
	if ((await sha256Hex(chunk.payload)) !== chunk.descriptor.sha256) {
		throw new SessionError(
			"checksum_mismatch",
			"Chunk checksum does not match descriptor",
		);
	}
}

abstract class SessionStoreBase implements SessionStore {
	protected abstract read(
		scopeId: string,
		sessionId: string,
	): Promise<StoredSession | null>;
	protected abstract write(
		scopeId: string,
		record: StoredSession,
	): Promise<void>;
	protected abstract remove(scopeId: string, sessionId: string): Promise<void>;
	protected abstract records(scopeId: string): Promise<StoredSession[]>;
	protected abstract storePayload(
		scopeId: string,
		chunk: ArrowChunkV1,
	): Promise<void>;
	protected abstract loadPayload(
		scopeId: string,
		sessionId: string,
		streamId: string,
		sequence: number,
	): Promise<Uint8Array | null>;
	protected abstract removePayloads(
		scopeId: string,
		sessionId: string,
	): Promise<void>;

	async create(scopeId: string, manifest: SessionManifestV1): Promise<void> {
		validateManifest(manifest);
		if (!scopeId)
			throw new SessionError("scope_denied", "A storage scope is required");
		if (manifest.status !== "recording" || manifest.chunks.length !== 0) {
			throw new SessionError(
				"invalid_manifest",
				"New sessions must be empty and recording",
			);
		}
		if (await this.read(scopeId, manifest.sessionId)) {
			throw new SessionError("invalid_state", "Session already exists");
		}
		await this.write(scopeId, {
			manifest: clone(manifest),
			events: [],
			summary: null,
		});
	}

	async getManifest(
		scopeId: string,
		sessionId: string,
	): Promise<SessionManifestV1 | null> {
		const record = await this.read(scopeId, sessionId);
		return record ? clone(record.manifest) : null;
	}

	async listManifests(scopeId: string): Promise<SessionManifestV1[]> {
		return (await this.records(scopeId))
			.map((record) => clone(record.manifest))
			.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
	}

	async addSource(
		scopeId: string,
		sessionId: string,
		source: SessionSourceV1,
	): Promise<void> {
		validateSource(source);
		const record = await this.required(scopeId, sessionId);
		requireRecording(record);
		const existing = record.manifest.sources.find(
			(item) => item.sourceId === source.sourceId,
		);
		if (existing) {
			if (!sourceMatches(existing, source))
				throw new SessionError("schema_mismatch", "Source ID conflict");
			return;
		}
		record.manifest.sources.push(clone(source));
		await this.write(scopeId, record);
	}

	async addStream(
		scopeId: string,
		sessionId: string,
		stream: SessionStreamV1,
	): Promise<void> {
		validateStream(stream);
		const record = await this.required(scopeId, sessionId);
		requireRecording(record);
		if (
			!record.manifest.sources.some(
				(source) => source.sourceId === stream.sourceId,
			)
		) {
			throw new SessionError("invalid_stream", "Stream source is not declared");
		}
		const existing = record.manifest.streams.find(
			(item) => item.streamId === stream.streamId,
		);
		if (existing) {
			if (!streamMatches(existing, stream))
				throw new SessionError("schema_mismatch", "Stream ID conflict");
			return;
		}
		record.manifest.streams.push(clone(stream));
		await this.write(scopeId, record);
	}

	async putChunk(
		scopeId: string,
		chunk: ArrowChunkV1,
	): Promise<"committed" | "duplicate"> {
		await validatePayload(chunk);
		const { descriptor } = chunk;
		const record = await this.required(scopeId, descriptor.sessionId);
		requireRecording(record);
		const stream = record.manifest.streams.find(
			(item) => item.streamId === descriptor.streamId,
		);
		if (!stream) {
			throw new SessionError(
				"stream_not_found",
				"Chunk stream is not declared",
			);
		}
		if ((await streamSchemaSha256(stream)) !== descriptor.schemaSha256) {
			throw new SessionError(
				"schema_mismatch",
				"Chunk schema hash does not match declared stream",
			);
		}
		const existing = record.manifest.chunks.find(
			(item) =>
				item.streamId === descriptor.streamId &&
				item.sequence === descriptor.sequence,
		);
		if (existing) {
			if (
				existing.sha256 !== descriptor.sha256 ||
				existing.byteLength !== descriptor.byteLength
			) {
				throw new SessionError(
					"sequence_conflict",
					"Chunk sequence already has different content",
				);
			}
			return "duplicate";
		}
		const prior = record.manifest.chunks
			.filter((item) => item.streamId === descriptor.streamId)
			.reduce((max, item) => Math.max(max, item.sequence), -1);
		if (descriptor.sequence !== prior + 1) {
			throw new SessionError(
				"invalid_chunk",
				`Expected chunk sequence ${prior + 1}`,
			);
		}
		await this.storePayload(scopeId, {
			descriptor: clone(descriptor),
			payload: chunk.payload.slice(),
		});
		record.manifest.chunks.push(clone(descriptor));
		try {
			await this.write(scopeId, record);
		} catch (error) {
			await this.removeStoredPayload(scopeId, descriptor).catch(
				() => undefined,
			);
			throw error;
		}
		return "committed";
	}

	async getChunk(
		scopeId: string,
		sessionId: string,
		streamId: string,
		sequence: number,
	): Promise<ArrowChunkV1 | null> {
		const record = await this.read(scopeId, sessionId);
		const descriptor = record?.manifest.chunks.find(
			(item) => item.streamId === streamId && item.sequence === sequence,
		);
		if (!descriptor) return null;
		const payload = await this.loadPayload(
			scopeId,
			sessionId,
			streamId,
			sequence,
		);
		if (!payload)
			throw new SessionError("internal", "Committed chunk payload is missing");
		return { descriptor: clone(descriptor), payload };
	}

	async appendEvent(
		scopeId: string,
		event: SessionEventV1,
	): Promise<"committed" | "duplicate"> {
		validateEvent(event);
		const record = await this.required(scopeId, event.sessionId);
		requireRecording(record);
		const existing = record.events.find(
			(item) => item.eventId === event.eventId,
		);
		if (existing) {
			if (JSON.stringify(existing) !== JSON.stringify(event)) {
				throw new SessionError(
					"sequence_conflict",
					"Event ID already has different content",
				);
			}
			return "duplicate";
		}
		record.events.push(clone(event));
		await this.write(scopeId, record);
		return "committed";
	}

	async listEvents(
		scopeId: string,
		sessionId: string,
	): Promise<SessionEventV1[]> {
		const record = await this.required(scopeId, sessionId);
		return clone(record.events).sort((a, b) => a.offsetUs - b.offsetUs);
	}

	async putSummary(scopeId: string, summary: SessionSummaryV1): Promise<void> {
		validateSummary(summary);
		const record = await this.required(scopeId, summary.sessionId);
		record.summary = clone(summary);
		await this.write(scopeId, record);
	}

	async getSummary(
		scopeId: string,
		sessionId: string,
	): Promise<SessionSummaryV1 | null> {
		return clone((await this.required(scopeId, sessionId)).summary);
	}

	async setStatus(
		scopeId: string,
		sessionId: string,
		status: "complete" | "interrupted" | "aborted",
		endedAt = new Date().toISOString(),
	): Promise<void> {
		const record = await this.required(scopeId, sessionId);
		if (
			record.manifest.status !== "recording" &&
			record.manifest.status !== status
		) {
			throw new SessionError(
				"invalid_state",
				`Cannot change ${record.manifest.status} to ${status}`,
			);
		}
		const start = Date.parse(record.manifest.startedAt);
		const end = Date.parse(endedAt);
		if (!Number.isFinite(end) || end < start)
			throw new SessionError("invalid_state", "Invalid session end time");
		record.manifest.status = status;
		record.manifest.endedAt = endedAt;
		record.manifest.durationUs = Math.round((end - start) * 1000);
		await this.write(scopeId, record);
	}

	async recoverInterrupted(scopeId: string): Promise<string[]> {
		const recovered: string[] = [];
		for (const record of await this.records(scopeId)) {
			if (record.manifest.status === "recording") {
				const endedAt = new Date().toISOString();
				record.manifest.status = "interrupted";
				record.manifest.endedAt = endedAt;
				record.manifest.durationUs = Math.max(
					0,
					Math.round(
						(Date.parse(endedAt) - Date.parse(record.manifest.startedAt)) *
							1000,
					),
				);
				await this.write(scopeId, record);
				recovered.push(record.manifest.sessionId);
			}
		}
		return recovered;
	}

	async resume(scopeId: string, sessionId: string): Promise<void> {
		const record = await this.required(scopeId, sessionId);
		if (record.manifest.status !== "interrupted") {
			throw new SessionError(
				"invalid_state",
				"Only interrupted sessions can resume",
			);
		}
		record.manifest.status = "recording";
		record.manifest.endedAt = undefined;
		record.manifest.durationUs = undefined;
		await this.write(scopeId, record);
	}

	async delete(scopeId: string, sessionId: string): Promise<void> {
		await this.remove(scopeId, sessionId);
		await this.removePayloads(scopeId, sessionId);
	}

	private async required(
		scopeId: string,
		sessionId: string,
	): Promise<StoredSession> {
		const record = await this.read(scopeId, sessionId);
		if (!record)
			throw new SessionError("session_not_found", "Session was not found");
		return record;
	}

	private async removeStoredPayload(
		scopeId: string,
		descriptor: ArrowChunkV1["descriptor"],
	): Promise<void> {
		if (this instanceof MemorySessionStore) {
			this.payloads.delete(
				payloadKey(
					scopeId,
					descriptor.sessionId,
					descriptor.streamId,
					descriptor.sequence,
				),
			);
		} else if (this instanceof IndexedDbSessionStore) {
			await this.removeOnePayload(
				scopeId,
				descriptor.sessionId,
				descriptor.streamId,
				descriptor.sequence,
			);
		}
	}
}

function sessionKey(scopeId: string, sessionId: string): string {
	return `${scopeId}\u0000${sessionId}`;
}

function payloadKey(
	scopeId: string,
	sessionId: string,
	streamId: string,
	sequence: number,
): string {
	return `${scopeId}\u0000${sessionId}\u0000${streamId}\u0000${sequence}`;
}

export class MemorySessionStore extends SessionStoreBase {
	readonly sessions = new Map<string, StoredSession>();
	readonly payloads = new Map<string, Uint8Array>();

	protected async read(
		scopeId: string,
		sessionId: string,
	): Promise<StoredSession | null> {
		const value = this.sessions.get(sessionKey(scopeId, sessionId));
		return value ? clone(value) : null;
	}
	protected async write(scopeId: string, record: StoredSession): Promise<void> {
		this.sessions.set(
			sessionKey(scopeId, record.manifest.sessionId),
			clone(record),
		);
	}
	protected async remove(scopeId: string, sessionId: string): Promise<void> {
		this.sessions.delete(sessionKey(scopeId, sessionId));
	}
	protected async records(scopeId: string): Promise<StoredSession[]> {
		return [...this.sessions.entries()]
			.filter(([key]) => key.startsWith(`${scopeId}\u0000`))
			.map(([, record]) => clone(record));
	}
	protected async storePayload(
		scopeId: string,
		chunk: ArrowChunkV1,
	): Promise<void> {
		const d = chunk.descriptor;
		this.payloads.set(
			payloadKey(scopeId, d.sessionId, d.streamId, d.sequence),
			chunk.payload.slice(),
		);
	}
	protected async loadPayload(
		scopeId: string,
		sessionId: string,
		streamId: string,
		sequence: number,
	): Promise<Uint8Array | null> {
		return (
			this.payloads
				.get(payloadKey(scopeId, sessionId, streamId, sequence))
				?.slice() ?? null
		);
	}
	protected async removePayloads(
		scopeId: string,
		sessionId: string,
	): Promise<void> {
		const prefix = `${scopeId}\u0000${sessionId}\u0000`;
		for (const key of this.payloads.keys())
			if (key.startsWith(prefix)) this.payloads.delete(key);
	}
}

interface IndexedRecord extends StoredSession {
	key: string;
	scopeId: string;
}
interface IndexedPayload {
	key: string;
	sessionKey: string;
	payload: Uint8Array;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		value.onsuccess = () => resolve(value.result);
		value.onerror = () =>
			reject(
				value.error ?? new SessionError("internal", "IndexedDB request failed"),
			);
	});
}

function transactionDone(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onabort = () =>
			reject(
				tx.error ??
					new SessionError("internal", "IndexedDB transaction aborted"),
			);
		tx.onerror = () =>
			reject(
				tx.error ??
					new SessionError("internal", "IndexedDB transaction failed"),
			);
	});
}

export interface IndexedDbSessionStoreOptions {
	databaseName?: string;
	payloadStore?: ChunkPayloadStore;
	indexedDB?: IDBFactory;
}

export class IndexedDbSessionStore extends SessionStoreBase {
	private readonly databaseName: string;
	private readonly payloadStore?: ChunkPayloadStore;
	private readonly factory: IDBFactory;
	private database?: Promise<IDBDatabase>;

	constructor(options: IndexedDbSessionStoreOptions = {}) {
		super();
		this.databaseName = options.databaseName ?? "elata-biosignal-session-v1";
		this.payloadStore = options.payloadStore;
		this.factory = options.indexedDB ?? globalThis.indexedDB;
		if (!this.factory)
			throw new SessionError("not_supported", "IndexedDB is unavailable");
	}

	async close(): Promise<void> {
		if (this.database) (await this.database).close();
		this.database = undefined;
	}

	protected async read(
		scopeId: string,
		sessionId: string,
	): Promise<StoredSession | null> {
		const db = await this.db();
		const tx = db.transaction("sessions", "readonly");
		const record = await request(
			tx
				.objectStore("sessions")
				.get(sessionKey(scopeId, sessionId)) as IDBRequest<
				IndexedRecord | undefined
			>,
		);
		await transactionDone(tx);
		return record
			? clone({
					manifest: record.manifest,
					events: record.events,
					summary: record.summary,
				})
			: null;
	}

	protected async write(scopeId: string, record: StoredSession): Promise<void> {
		const db = await this.db();
		const tx = db.transaction("sessions", "readwrite");
		tx.objectStore("sessions").put({
			...clone(record),
			key: sessionKey(scopeId, record.manifest.sessionId),
			scopeId,
		});
		await transactionDone(tx);
	}

	protected async remove(scopeId: string, sessionId: string): Promise<void> {
		const db = await this.db();
		const tx = db.transaction(["sessions", "payloads"], "readwrite");
		tx.objectStore("sessions").delete(sessionKey(scopeId, sessionId));
		const index = tx.objectStore("payloads").index("sessionKey");
		const keys = await request(
			index.getAllKeys(sessionKey(scopeId, sessionId)),
		);
		for (const key of keys) tx.objectStore("payloads").delete(key);
		await transactionDone(tx);
	}

	protected async records(scopeId: string): Promise<StoredSession[]> {
		const db = await this.db();
		const tx = db.transaction("sessions", "readonly");
		const values = await request(
			tx.objectStore("sessions").index("scopeId").getAll(scopeId) as IDBRequest<
				IndexedRecord[]
			>,
		);
		await transactionDone(tx);
		return values.map(({ manifest, events, summary }) =>
			clone({ manifest, events, summary }),
		);
	}

	protected async storePayload(
		scopeId: string,
		chunk: ArrowChunkV1,
	): Promise<void> {
		if (this.payloadStore) return this.payloadStore.put(scopeId, chunk);
		const d = chunk.descriptor;
		const db = await this.db();
		const tx = db.transaction("payloads", "readwrite");
		const value: IndexedPayload = {
			key: payloadKey(scopeId, d.sessionId, d.streamId, d.sequence),
			sessionKey: sessionKey(scopeId, d.sessionId),
			payload: chunk.payload.slice(),
		};
		tx.objectStore("payloads").put(value);
		await transactionDone(tx);
	}

	protected async loadPayload(
		scopeId: string,
		sessionId: string,
		streamId: string,
		sequence: number,
	): Promise<Uint8Array | null> {
		if (this.payloadStore)
			return this.payloadStore.get(scopeId, sessionId, streamId, sequence);
		const db = await this.db();
		const tx = db.transaction("payloads", "readonly");
		const value = await request(
			tx
				.objectStore("payloads")
				.get(payloadKey(scopeId, sessionId, streamId, sequence)) as IDBRequest<
				IndexedPayload | undefined
			>,
		);
		await transactionDone(tx);
		return value?.payload.slice() ?? null;
	}

	protected async removePayloads(
		scopeId: string,
		sessionId: string,
	): Promise<void> {
		await this.payloadStore?.deleteSession(scopeId, sessionId);
	}

	async removeOnePayload(
		scopeId: string,
		sessionId: string,
		streamId: string,
		sequence: number,
	): Promise<void> {
		if (this.payloadStore)
			return this.payloadStore.delete(scopeId, sessionId, streamId, sequence);
		const db = await this.db();
		const tx = db.transaction("payloads", "readwrite");
		tx.objectStore("payloads").delete(
			payloadKey(scopeId, sessionId, streamId, sequence),
		);
		await transactionDone(tx);
	}

	private db(): Promise<IDBDatabase> {
		if (!this.database) {
			this.database = new Promise((resolve, reject) => {
				const opening = this.factory.open(this.databaseName, 1);
				opening.onupgradeneeded = () => {
					const db = opening.result;
					const sessions = db.createObjectStore("sessions", { keyPath: "key" });
					sessions.createIndex("scopeId", "scopeId");
					const payloads = db.createObjectStore("payloads", { keyPath: "key" });
					payloads.createIndex("sessionKey", "sessionKey");
				};
				opening.onsuccess = () => resolve(opening.result);
				opening.onerror = () =>
					reject(
						opening.error ??
							new SessionError("internal", "Could not open IndexedDB"),
					);
			});
		}
		return this.database;
	}
}

interface WritableFileStreamLike {
	write(data: BufferSource | Blob | string): Promise<void>;
	close(): Promise<void>;
}
interface FileHandleLike {
	createWritable(): Promise<WritableFileStreamLike>;
	getFile(): Promise<Blob>;
}
interface DirectoryHandleLike {
	getDirectoryHandle(
		name: string,
		options?: { create?: boolean },
	): Promise<DirectoryHandleLike>;
	getFileHandle(
		name: string,
		options?: { create?: boolean },
	): Promise<FileHandleLike>;
	removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

function safePathPart(value: string): string {
	return Array.from(new TextEncoder().encode(value), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

export class OpfsChunkPayloadStore implements ChunkPayloadStore {
	constructor(
		private readonly rootProvider: () => Promise<DirectoryHandleLike> = async () => {
			const storage = navigator.storage as StorageManager & {
				getDirectory?: () => Promise<DirectoryHandleLike>;
			};
			if (!storage?.getDirectory)
				throw new SessionError("not_supported", "OPFS is unavailable");
			return storage.getDirectory();
		},
	) {}

	async put(scopeId: string, chunk: ArrowChunkV1): Promise<void> {
		const d = chunk.descriptor;
		const directory = await this.streamDirectory(
			scopeId,
			d.sessionId,
			d.streamId,
			true,
		);
		const file = await directory.getFileHandle(this.fileName(d.sequence), {
			create: true,
		});
		const writable = await file.createWritable();
		await writable.write(chunk.payload.slice().buffer as ArrayBuffer);
		await writable.close();
	}

	async get(
		scopeId: string,
		sessionId: string,
		streamId: string,
		sequence: number,
	): Promise<Uint8Array | null> {
		try {
			const directory = await this.streamDirectory(
				scopeId,
				sessionId,
				streamId,
				false,
			);
			const file = await directory.getFileHandle(this.fileName(sequence));
			return new Uint8Array(await (await file.getFile()).arrayBuffer());
		} catch (error) {
			if ((error as DOMException)?.name === "NotFoundError") return null;
			throw error;
		}
	}

	async delete(
		scopeId: string,
		sessionId: string,
		streamId: string,
		sequence: number,
	): Promise<void> {
		try {
			const directory = await this.streamDirectory(
				scopeId,
				sessionId,
				streamId,
				false,
			);
			await directory.removeEntry(this.fileName(sequence));
		} catch (error) {
			if ((error as DOMException)?.name !== "NotFoundError") throw error;
		}
	}

	async deleteSession(scopeId: string, sessionId: string): Promise<void> {
		try {
			const root = await this.rootProvider();
			const base = await root.getDirectoryHandle("elata-biosignal-sessions");
			const scope = await base.getDirectoryHandle(safePathPart(scopeId));
			await scope.removeEntry(safePathPart(sessionId), { recursive: true });
		} catch (error) {
			if ((error as DOMException)?.name !== "NotFoundError") throw error;
		}
	}

	private async streamDirectory(
		scopeId: string,
		sessionId: string,
		streamId: string,
		create: boolean,
	): Promise<DirectoryHandleLike> {
		let directory = await this.rootProvider();
		for (const part of [
			"elata-biosignal-sessions",
			safePathPart(scopeId),
			safePathPart(sessionId),
			safePathPart(streamId),
		]) {
			directory = await directory.getDirectoryHandle(part, { create });
		}
		return directory;
	}

	private fileName(sequence: number): string {
		return `${sequence.toString().padStart(10, "0")}.arrow`;
	}
}
