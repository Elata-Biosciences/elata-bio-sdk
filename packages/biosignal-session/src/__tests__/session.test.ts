import {
	BiosignalSessionRecorder,
	IndexedDbSessionStore,
	MemorySessionStore,
	OpfsChunkPayloadStore,
	SessionError,
	SessionPortClient,
	adaptHeadbandSignalBlock,
	adaptRppgReplaySession,
	bindSessionHost,
	decodeArrowChunk,
	encodeArrowChunk,
	exportSessionArchive,
	importSessionArchive,
	type SessionSourceV1,
	type SessionStreamV1,
} from "../index";

const source: SessionSourceV1 = { sourceId: "synthetic", name: "Synthetic EEG", kind: "synthetic" };
const stream: SessionStreamV1 = {
	streamId: "eeg.raw",
	sourceId: source.sourceId,
	name: "Raw EEG",
	modality: "eeg",
	kind: "raw",
	schemaVersion: "test.eeg/v1",
	timing: { kind: "regular", sampleRateHz: 256, clockSource: "local" },
	fields: [
		{ name: "fp1", valueType: "float32", unit: "uV" },
		{ name: "fp2", valueType: "float32", unit: "uV" },
	],
};

async function newRecorder(store: MemorySessionStore | IndexedDbSessionStore, scope = "app:test") {
	const recorder = await BiosignalSessionRecorder.begin({ store, scopeId: scope, appId: "test-app", input: { sources: [source] } });
	await recorder.addStream(stream);
	return recorder;
}

describe("Session v1 vertical slice", () => {
	test("encodes Arrow IPC and validates round-trip columns", async () => {
		const chunk = await encodeArrowChunk(stream, { columns: { fp1: new Float32Array([1, 2, 3]), fp2: new Float32Array([4, 5, 6]) } }, {
			sessionId: "session:test", sequence: 0, startOffsetUs: 0,
		});
		const decoded = await decodeArrowChunk(stream, chunk);
		expect(decoded.columns.fp1).toEqual([1, 2, 3]);
		expect(chunk.descriptor.encoding).toBe("arrow-ipc-stream");
	});

	test("commits idempotently, rejects conflicts, and recovers interrupted sessions", async () => {
		const store = new MemorySessionStore();
		const recorder = await newRecorder(store);
		const chunk = await encodeArrowChunk(stream, { columns: { fp1: [1], fp2: [2] } }, {
			sessionId: recorder.sessionId, sequence: 0, startOffsetUs: 0,
		});
		expect(await recorder.writeChunk(chunk)).toBe("committed");
		expect(await recorder.writeChunk(chunk)).toBe("duplicate");
		const conflicting = await encodeArrowChunk(stream, { columns: { fp1: [9], fp2: [2] } }, {
			sessionId: recorder.sessionId, sequence: 0, startOffsetUs: 0,
		});
		await expect(recorder.writeChunk(conflicting)).rejects.toMatchObject({ code: "sequence_conflict" });
		expect(await store.recoverInterrupted("app:test")).toEqual([recorder.sessionId]);
		expect((await recorder.manifest()).status).toBe("interrupted");
		const resumed = await BiosignalSessionRecorder.resume(
			store,
			"app:test",
			recorder.sessionId,
		);
		const next = await encodeArrowChunk(
			stream,
			{ columns: { fp1: [3], fp2: [4] } },
			{ sessionId: recorder.sessionId, sequence: 1, startOffsetUs: 3906 },
		);
		expect(await resumed.writeChunk(next)).toBe("committed");
		await resumed.finalize();
		expect((await resumed.manifest()).status).toBe("complete");
		await store.delete("app:test", recorder.sessionId);
		expect(await store.getManifest("app:test", recorder.sessionId)).toBeNull();
		expect(store.payloads.size).toBe(0);
	});

	test("exports, verifies, and imports a portable .elata ZIP", async () => {
		const sourceStore = new MemorySessionStore();
		const recorder = await newRecorder(sourceStore);
		const chunk = await encodeArrowChunk(stream, { columns: { fp1: [1, 2], fp2: [3, 4] } }, {
			sessionId: recorder.sessionId, sequence: 0, startOffsetUs: 0,
		});
		await recorder.writeChunk(chunk);
		await recorder.appendEvent({ offsetUs: 100, type: "stimulus.onset", schemaVersion: "1", data: { label: "A" } });
		await recorder.finalize();
		const archive = await exportSessionArchive(sourceStore, "app:test", recorder.sessionId);
		expect(archive.byteLength).toBeGreaterThan(chunk.payload.byteLength);
		const target = new MemorySessionStore();
		expect(await importSessionArchive(archive, { store: target, scopeId: "import:test" })).toBe(recorder.sessionId);
		expect((await target.getManifest("import:test", recorder.sessionId))?.chunks).toHaveLength(1);
		expect(await target.listEvents("import:test", recorder.sessionId)).toHaveLength(1);
	});

	test("ACKs transferable chunks only after the host store commits", async () => {
		const store = new MemorySessionStore();
		const channel = new MessageChannel();
		const disposeHost = bindSessionHost(channel.port1, { store, scopeId: "iframe:one", appId: "embedded-app" });
		const client = new SessionPortClient(channel.port2, { maxInFlightPerStream: 2 });
		const sessionId = await client.begin({ sources: [source] });
		await client.addStream(sessionId, stream);
		const chunk = await encodeArrowChunk(stream, { columns: { fp1: [1], fp2: [2] } }, { sessionId, sequence: 0, startOffsetUs: 0 });
		const second = await encodeArrowChunk(stream, { columns: { fp1: [3], fp2: [4] } }, { sessionId, sequence: 1, startOffsetUs: 3906 });
		expect(await Promise.all([client.writeChunk(sessionId, chunk), client.writeChunk(sessionId, second)])).toEqual(["committed", "committed"]);
		expect((await store.getManifest("iframe:one", sessionId))?.chunks).toHaveLength(2);
		await client.finalize(sessionId);
		client.dispose();
		disposeHost();
	});

	test("uses IndexedDB as the authoritative catalog with an inline payload fallback", async () => {
		const store = new IndexedDbSessionStore({ databaseName: `test-${Date.now()}-${Math.random()}` });
		const recorder = await newRecorder(store, "idb:test");
		const chunk = await encodeArrowChunk(stream, { columns: { fp1: [1], fp2: [2] } }, { sessionId: recorder.sessionId, sequence: 0, startOffsetUs: 0 });
		await recorder.writeChunk(chunk);
		expect(Array.from((await store.getChunk("idb:test", recorder.sessionId, stream.streamId, 0))?.payload ?? [])).toEqual(Array.from(chunk.payload));
		await store.close();
	});

	test("stores immutable payload bytes in the OPFS layout", async () => {
		class Directory {
			directories = new Map<string, Directory>();
			files = new Map<string, Uint8Array>();
			async getDirectoryHandle(name: string, options?: { create?: boolean }) {
				let child = this.directories.get(name);
				if (!child && options?.create) { child = new Directory(); this.directories.set(name, child); }
				if (!child) throw new DOMException("missing", "NotFoundError");
				return child;
			}
			async getFileHandle(name: string, options?: { create?: boolean }) {
				if (!this.files.has(name) && !options?.create) throw new DOMException("missing", "NotFoundError");
				return {
					createWritable: async () => ({
						write: async (data: ArrayBuffer) => { this.files.set(name, new Uint8Array(data).slice()); },
						close: async () => undefined,
					}),
					getFile: async () => ({ arrayBuffer: async () => (this.files.get(name) ?? new Uint8Array()).slice().buffer }),
				};
			}
			async removeEntry(name: string, options?: { recursive?: boolean }) {
				if (options?.recursive && this.directories.delete(name)) return;
				if (!this.files.delete(name)) throw new DOMException("missing", "NotFoundError");
			}
		}
		const root = new Directory();
		const payloadStore = new OpfsChunkPayloadStore(async () => root as never);
		const chunk = await encodeArrowChunk(stream, { columns: { fp1: [1], fp2: [2] } }, { sessionId: "session:opfs", sequence: 0, startOffsetUs: 0 });
		await payloadStore.put("scope", chunk);
		expect(Array.from((await payloadStore.get("scope", "session:opfs", stream.streamId, 0)) ?? [])).toEqual(Array.from(chunk.payload));
		await payloadStore.deleteSession("scope", "session:opfs");
		expect(await payloadStore.get("scope", "session:opfs", stream.streamId, 0)).toBeNull();
	});

	test("maps existing Headband and rPPG shapes without changing their APIs", async () => {
		const headband = await adaptHeadbandSignalBlock({
			schemaVersion: "1", source: "hb", sequenceId: 0, emittedAtMs: 5,
			eeg: { sampleRateHz: 256, channelNames: ["Fp1", "Fp2"], channelCount: 2, samples: [[1, 2], [3, 4]] },
		}, "session:headband");
		expect(headband.stream.fields.map((field) => field.name)).toEqual(["Fp1", "Fp2"]);
		const rppg = await adaptRppgReplaySession({
			syncSamples: [{ epochTs: 1000, stage: "warmup", estimators: { finalBpm: null } }, { epochTs: 1100, stage: "track", estimators: { finalBpm: 72 } }],
			pairEvents: [{ ts: 1050, referenceBpm: 70 }],
		}, "session:rppg");
		expect(rppg.chunk.descriptor.sampleCount).toBe(2);
		expect(rppg.events).toHaveLength(1);
	});

	test("rejects checksum corruption", async () => {
		const store = new MemorySessionStore();
		const recorder = await newRecorder(store);
		const chunk = await encodeArrowChunk(stream, { columns: { fp1: [1], fp2: [2] } }, { sessionId: recorder.sessionId, sequence: 0, startOffsetUs: 0 });
		chunk.payload[0] ^= 1;
		await expect(recorder.writeChunk(chunk)).rejects.toBeInstanceOf(SessionError);
	});

	test("enforces host message bounds and summary validation", async () => {
		const store = new MemorySessionStore();
		const channel = new MessageChannel();
		const disposeHost = bindSessionHost(channel.port1, {
			store,
			scopeId: "bounded:test",
			appId: "bounded",
			maxChunkBytes: 1,
		});
		const client = new SessionPortClient(channel.port2);
		const sessionId = await client.begin({ sources: [source] });
		await client.addStream(sessionId, stream);
		const chunk = await encodeArrowChunk(
			stream,
			{ columns: { fp1: [1], fp2: [2] } },
			{ sessionId, sequence: 0, startOffsetUs: 0 },
		);
		await expect(client.writeChunk(sessionId, chunk)).rejects.toMatchObject({
			code: "payload_too_large",
		});
		await expect(
			store.putSummary("bounded:test", {
				schema: "elata.biosignal-session-summary/v1",
				sessionId,
				definitionVersion: "1",
				computedAt: new Date().toISOString(),
				metrics: [{ coverage: 2 }],
			} as never),
		).rejects.toMatchObject({ code: "invalid_manifest" });
		client.dispose();
		disposeHost();
	});
});
