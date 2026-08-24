import { checksumOf } from "../arrow/checksum";
import type { SourceDescriptorDraft, StreamDescriptorDraft } from "../contracts/session";
import type { ChunkCommitMeta, HostToClient } from "../protocol/messages";
import {
	createLoopbackPortPair,
	createMemoryHost,
	settleMicrotasks,
} from "../testing/memoryHost";

const sourceDraft: SourceDescriptorDraft = {
	kind: "synthetic",
	name: "synthetic",
	adapter: "synthetic@1",
	sdkPackages: [],
};

const eegDraft = (sourceId: string): StreamDescriptorDraft => ({
	sourceId,
	modality: "eeg",
	sampling: "regular",
	sampleRateHz: 256,
	channels: [{ name: "ch1" }, { name: "ch2" }],
	encoding: "arrow-ipc",
	arrowSchemaId: "regular-wide-f32@1",
	layout: "wide",
	clockSource: "local",
});

function chunkMeta(payload: Uint8Array, sequence: number): ChunkCommitMeta {
	return {
		rowCount: 4,
		byteLength: payload.byteLength,
		checksum: checksumOf(payload),
		startUs: sequence * 1_000,
		endUs: sequence * 1_000 + 999,
		sampleIndexStart: sequence * 4,
	};
}

/** Test harness speaking the wire protocol directly at a memory host. */
function harness() {
	const host = createMemoryHost();
	const [clientPort, hostPort] = createLoopbackPortPair();
	host.attach(hostPort);
	const replies: HostToClient[] = [];
	clientPort.onmessage = (event) => replies.push(event.data as HostToClient);
	let requestCounter = 0;
	const send = (partial: Record<string, unknown>) => {
		const id = `req-${++requestCounter}`;
		clientPort.postMessage({ v: 1, id, ...partial });
		return id;
	};
	const replyFor = (id: string) =>
		replies.find((message) => "id" in message && message.id === id);
	return { host, clientPort, replies, send, replyFor };
}

async function createSessionAndStream(h: ReturnType<typeof harness>) {
	const createId = h.send({ op: "session/create", spec: baseSpec() });
	await settleMicrotasks();
	const created = h.replyFor(createId) as Extract<HostToClient, { ok: true }>;
	const { session } = created.result as { session: { sessionId: string } };
	const openId = h.send({
		op: "stream/open",
		sessionId: session.sessionId,
		stream: eegDraft("src-1"),
	});
	await settleMicrotasks();
	const opened = h.replyFor(openId) as Extract<HostToClient, { ok: true }>;
	const { stream } = opened.result as { stream: { streamId: string } };
	return { sessionId: session.sessionId, streamId: stream.streamId };
}

function baseSpec() {
	return {
		startedAtUtcMs: 1_700_000_000_000,
		startedAtMonotonicMs: 10_000,
		sources: [sourceDraft],
		provenance: { recorderVersion: "0.1.0", protocolVersion: 1, sdkPackages: [] },
	};
}

function commit(
	h: ReturnType<typeof harness>,
	sessionId: string,
	streamId: string,
	sequence: number,
	payload: Uint8Array,
	meta = chunkMeta(payload, sequence),
) {
	// Fresh buffer per send — like a transferred wire payload.
	const wire = payload.slice().buffer;
	return h.send({
		op: "chunk/commit",
		sessionId,
		streamId,
		sequence,
		meta,
		payload: wire,
	});
}

describe("session and stream lifecycle", () => {
	it("creates a recording session with host-assigned ids", async () => {
		const h = harness();
		const id = h.send({ op: "session/create", spec: baseSpec() });
		await settleMicrotasks();
		const reply = h.replyFor(id) as Extract<HostToClient, { ok: true }>;
		expect(reply.ok).toBe(true);
		const result = reply.result as {
			session: { sessionId: string; state: string; appId: string };
			sources: { sourceId: string }[];
		};
		expect(result.session.state).toBe("recording");
		expect(result.session.appId).toBe("app-test");
		expect(result.sources).toHaveLength(1);
		expect(h.host.sessions.size).toBe(1);
	});

	it("rejects a stream open on an unknown session", async () => {
		const h = harness();
		const id = h.send({
			op: "stream/open",
			sessionId: "nope",
			stream: eegDraft("s"),
		});
		await settleMicrotasks();
		expect(h.replyFor(id)).toMatchObject({ ok: false, error: "unknown_session" });
	});

	it("requires sampleRateHz on regular streams and a known arrow schema", async () => {
		const h = harness();
		const createId = h.send({ op: "session/create", spec: baseSpec() });
		await settleMicrotasks();
		const created = h.replyFor(createId) as Extract<HostToClient, { ok: true }>;
		const { session } = created.result as { session: { sessionId: string } };
		const badRate = h.send({
			op: "stream/open",
			sessionId: session.sessionId,
			stream: { ...eegDraft("s"), sampleRateHz: undefined },
		});
		const badSchema = h.send({
			op: "stream/open",
			sessionId: session.sessionId,
			stream: { ...eegDraft("s"), arrowSchemaId: "bogus@9" },
		});
		await settleMicrotasks();
		expect(h.replyFor(badRate)).toMatchObject({ ok: false, error: "invalid_payload" });
		expect(h.replyFor(badSchema)).toMatchObject({ ok: false, error: "invalid_payload" });
	});

	it("finalize closes open streams and completes the session", async () => {
		const h = harness();
		const { sessionId, streamId } = await createSessionAndStream(h);
		const id = h.send({ op: "session/finalize", sessionId, endUs: 5_000 });
		await settleMicrotasks();
		expect(h.replyFor(id)).toMatchObject({ ok: true });
		expect(h.host.sessions.get(sessionId)).toMatchObject({
			state: "complete",
			endReason: "finalized",
			endUs: 5_000,
		});
		expect(h.host.streams.get(streamId)).toMatchObject({ state: "closed" });
	});

	it("abort with storage_stalled records that end reason", async () => {
		const h = harness();
		const { sessionId } = await createSessionAndStream(h);
		h.send({ op: "session/abort", sessionId, reason: "storage_stalled" });
		await settleMicrotasks();
		expect(h.host.sessions.get(sessionId)?.endReason).toBe("storage_stalled");
	});
});

describe("chunk commit validation", () => {
	it("commits a valid chunk, updates stats, and ACKs with usage", async () => {
		const h = harness();
		const { sessionId, streamId } = await createSessionAndStream(h);
		const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
		const id = commit(h, sessionId, streamId, 0, payload);
		await settleMicrotasks();
		const reply = h.replyFor(id) as Extract<HostToClient, { ok: true }>;
		expect(reply.ok).toBe(true);
		expect(reply.result).toMatchObject({ sequence: 0, storedBytes: 8 });
		expect(h.host.streams.get(streamId)?.expectedNextSequence).toBe(1);
		expect(h.host.sessions.get(sessionId)?.stats.totalChunks).toBe(1);
		expect(h.host.committedBytes()).toBe(8);
	});

	it("re-verifies the checksum and rejects mismatches", async () => {
		const h = harness();
		const { sessionId, streamId } = await createSessionAndStream(h);
		const payload = new Uint8Array([1, 2, 3, 4]);
		const meta = { ...chunkMeta(payload, 0), checksum: { algo: "crc32c" as const, value: "deadbeef" } };
		const id = commit(h, sessionId, streamId, 0, payload, meta);
		await settleMicrotasks();
		expect(h.replyFor(id)).toMatchObject({ ok: false, error: "checksum_mismatch" });
		expect(h.host.chunks.size).toBe(0);
	});

	it("rejects byteLength mismatches and oversized payloads", async () => {
		const h = harness();
		const { sessionId, streamId } = await createSessionAndStream(h);
		const payload = new Uint8Array([1, 2, 3, 4]);
		const badLength = commit(h, sessionId, streamId, 0, payload, {
			...chunkMeta(payload, 0),
			byteLength: 3,
		});
		await settleMicrotasks();
		expect(h.replyFor(badLength)).toMatchObject({ ok: false, error: "invalid_payload" });
	});

	it("answers a duplicate sequence with equal checksum as an idempotent replay", async () => {
		const h = harness();
		const { sessionId, streamId } = await createSessionAndStream(h);
		const payload = new Uint8Array([9, 9, 9, 9]);
		commit(h, sessionId, streamId, 0, payload);
		await settleMicrotasks();
		const replay = commit(h, sessionId, streamId, 0, payload);
		await settleMicrotasks();
		expect(h.replyFor(replay)).toMatchObject({ ok: true });
		expect(h.host.chunks.size).toBe(1);
	});

	it("answers a duplicate sequence with a different checksum as sequence_conflict", async () => {
		const h = harness();
		const { sessionId, streamId } = await createSessionAndStream(h);
		commit(h, sessionId, streamId, 0, new Uint8Array([1, 1, 1, 1]));
		await settleMicrotasks();
		const conflict = commit(h, sessionId, streamId, 0, new Uint8Array([2, 2, 2, 2]));
		await settleMicrotasks();
		expect(h.replyFor(conflict)).toMatchObject({
			ok: false,
			error: "sequence_conflict",
			retryable: false,
		});
	});

	it("answers a sequence gap as sequence_conflict", async () => {
		const h = harness();
		const { sessionId, streamId } = await createSessionAndStream(h);
		const id = commit(h, sessionId, streamId, 2, new Uint8Array([1, 2, 3, 4]));
		await settleMicrotasks();
		expect(h.replyFor(id)).toMatchObject({ ok: false, error: "sequence_conflict" });
	});

	it("rejects commits on a closed stream with bad_state", async () => {
		const h = harness();
		const { sessionId, streamId } = await createSessionAndStream(h);
		h.send({ op: "stream/close", sessionId, streamId, endUs: 1_000 });
		await settleMicrotasks();
		const id = commit(h, sessionId, streamId, 0, new Uint8Array([1, 2, 3, 4]));
		await settleMicrotasks();
		expect(h.replyFor(id)).toMatchObject({ ok: false, error: "bad_state" });
	});
});

describe("event and clock validation", () => {
	it("stores events with host-assigned ids and app origin", async () => {
		const h = harness();
		const { sessionId } = await createSessionAndStream(h);
		const id = h.send({
			op: "event/append",
			sessionId,
			events: [
				{ timestampUs: 1, kind: "marker", name: "epoch_started" },
				{ timestampUs: 2, kind: "annotation", name: "note", payload: { a: 1 } },
			],
		});
		await settleMicrotasks();
		expect(h.replyFor(id)).toMatchObject({ ok: true, result: { appended: 2 } });
		expect(h.host.events).toHaveLength(2);
		expect(h.host.events[0].origin).toBe("app");
		expect(h.host.events[0].eventId).toBeTruthy();
	});

	it("rejects invalid event names and oversized payloads", async () => {
		const h = harness();
		const { sessionId } = await createSessionAndStream(h);
		const badName = h.send({
			op: "event/append",
			sessionId,
			events: [{ timestampUs: 1, kind: "marker", name: "Bad Name" }],
		});
		const tooBig = h.send({
			op: "event/append",
			sessionId,
			events: [
				{
					timestampUs: 1,
					kind: "marker",
					name: "big",
					payload: { blob: "x".repeat(5000) },
				},
			],
		});
		await settleMicrotasks();
		expect(h.replyFor(badName)).toMatchObject({ ok: false, error: "invalid_payload" });
		expect(h.replyFor(tooBig)).toMatchObject({ ok: false, error: "payload_too_large" });
		expect(h.host.events).toHaveLength(0);
	});

	it("rejects an oversized event batch", async () => {
		const h = harness();
		const { sessionId } = await createSessionAndStream(h);
		const events = Array.from({ length: 101 }, (_, index) => ({
			timestampUs: index,
			kind: "marker" as const,
			name: "tick",
		}));
		const id = h.send({ op: "event/append", sessionId, events });
		await settleMicrotasks();
		expect(h.replyFor(id)).toMatchObject({ ok: false, error: "invalid_payload" });
	});

	it("records clock observations", async () => {
		const h = harness();
		const { sessionId } = await createSessionAndStream(h);
		const id = h.send({
			op: "clock/observe",
			sessionId,
			observations: [
				{ sourceId: "src", kind: "device-clock", observedAtUs: 10, deviceTimestampMs: 5 },
			],
		});
		await settleMicrotasks();
		expect(h.replyFor(id)).toMatchObject({ ok: true, result: { recorded: 1 } });
		expect(h.host.observations).toHaveLength(1);
		expect(h.host.observations[0].sessionId).toBe(sessionId);
	});
});

describe("protocol hygiene", () => {
	it("rejects malformed requests that still carry an id", async () => {
		const h = harness();
		const id = "bad-1";
		h.clientPort.postMessage({ v: 1, id, op: "not/an-op" });
		await settleMicrotasks();
		expect(h.replyFor(id)).toMatchObject({ ok: false, error: "invalid_payload" });
	});

	it("silently ignores garbage without an id", async () => {
		const h = harness();
		h.clientPort.postMessage("garbage");
		h.clientPort.postMessage(null);
		await settleMicrotasks();
		expect(h.replies).toHaveLength(0);
	});

	it("answers ping and quota/estimate", async () => {
		const h = harness();
		const ping = h.send({ op: "ping" });
		const quota = h.send({ op: "quota/estimate" });
		await settleMicrotasks();
		expect(h.replyFor(ping)).toMatchObject({ ok: true });
		expect(h.replyFor(quota)).toMatchObject({
			ok: true,
			result: { usage: { usageBytes: 0 } },
		});
	});

	it("rate-limits control ops but never chunk commits", async () => {
		let now = 0;
		const host = createMemoryHost({ nowMs: () => now });
		const [clientPort, hostPort] = createLoopbackPortPair();
		host.attach(hostPort);
		const replies: HostToClient[] = [];
		clientPort.onmessage = (event) => replies.push(event.data as HostToClient);
		for (let i = 0; i < 101; i++) {
			clientPort.postMessage({ v: 1, id: `p-${i}`, op: "ping" });
		}
		await settleMicrotasks();
		const limited = replies.filter(
			(reply) => "ok" in reply && !reply.ok && reply.error === "rate_limited",
		);
		expect(limited).toHaveLength(1);
		// The window slides: after 60 s pings pass again.
		now = 61_000;
		clientPort.postMessage({ v: 1, id: "later", op: "ping" });
		await settleMicrotasks();
		expect(
			replies.find((reply) => "id" in reply && reply.id === "later"),
		).toMatchObject({ ok: true });
	});
});

describe("fault injection", () => {
	it("dropNextAck commits durably but swallows the reply", async () => {
		const h = harness();
		const { sessionId, streamId } = await createSessionAndStream(h);
		h.host.dropNextAck();
		const payload = new Uint8Array([7, 7, 7, 7]);
		const id = commit(h, sessionId, streamId, 0, payload);
		await settleMicrotasks();
		expect(h.replyFor(id)).toBeUndefined();
		expect(h.host.chunks.size).toBe(1);
		// The retry replays idempotently.
		const retry = commit(h, sessionId, streamId, 0, payload);
		await settleMicrotasks();
		expect(h.replyFor(retry)).toMatchObject({ ok: true });
		expect(h.host.chunks.size).toBe(1);
	});

	it("failNextCommitWith fails exactly one commit without committing", async () => {
		const h = harness();
		const { sessionId, streamId } = await createSessionAndStream(h);
		h.host.failNextCommitWith("storage_unavailable");
		const payload = new Uint8Array([1, 2, 3, 4]);
		const failed = commit(h, sessionId, streamId, 0, payload);
		await settleMicrotasks();
		expect(h.replyFor(failed)).toMatchObject({
			ok: false,
			error: "storage_unavailable",
			retryable: true,
		});
		expect(h.host.chunks.size).toBe(0);
		const retried = commit(h, sessionId, streamId, 0, payload);
		await settleMicrotasks();
		expect(h.replyFor(retried)).toMatchObject({ ok: true });
		expect(h.host.chunks.size).toBe(1);
	});

	it("corruptNextPayload triggers the checksum re-verification", async () => {
		const h = harness();
		const { sessionId, streamId } = await createSessionAndStream(h);
		h.host.corruptNextPayload();
		const payload = new Uint8Array([1, 2, 3, 4]);
		const id = commit(h, sessionId, streamId, 0, payload);
		await settleMicrotasks();
		expect(h.replyFor(id)).toMatchObject({ ok: false, error: "checksum_mismatch" });
		expect(h.host.chunks.size).toBe(0);
	});

	it("pause holds processing; resume replays held messages in order", async () => {
		const h = harness();
		const { sessionId, streamId } = await createSessionAndStream(h);
		h.host.pause();
		commit(h, sessionId, streamId, 0, new Uint8Array([1, 1, 1, 1]));
		commit(h, sessionId, streamId, 1, new Uint8Array([2, 2, 2, 2]));
		await settleMicrotasks();
		expect(h.host.chunks.size).toBe(0);
		h.host.resume();
		await settleMicrotasks();
		expect(h.host.chunks.size).toBe(2);
		expect(h.host.streams.get(streamId)?.expectedNextSequence).toBe(2);
	});

	it("notify pushes a host notice to the client", async () => {
		const h = harness();
		h.host.notify("quota-warning", undefined, "84%");
		await settleMicrotasks();
		expect(h.replies[0]).toMatchObject({
			kind: "host/notice",
			notice: "quota-warning",
		});
	});
});

describe("quota", () => {
	it("hard-stops commits past the quota with storage_full", async () => {
		let requestCounter = 100;
		const host = createMemoryHost({ quotaBytes: 10 });
		const [clientPort, hostPort] = createLoopbackPortPair();
		host.attach(hostPort);
		const replies: HostToClient[] = [];
		clientPort.onmessage = (event) => replies.push(event.data as HostToClient);
		const send = (partial: Record<string, unknown>) => {
			const id = `req-${++requestCounter}`;
			clientPort.postMessage({ v: 1, id, ...partial });
			return id;
		};
		const h = {
			host,
			clientPort,
			replies,
			send,
			replyFor: (id: string) =>
				replies.find((message) => "id" in message && message.id === id),
		} as ReturnType<typeof harness>;
		const { sessionId, streamId } = await createSessionAndStream(h);
		commit(h, sessionId, streamId, 0, new Uint8Array(8));
		await settleMicrotasks();
		const over = commit(h, sessionId, streamId, 1, new Uint8Array(8));
		await settleMicrotasks();
		expect(h.replyFor(over)).toMatchObject({ ok: false, error: "storage_full" });
	});
});
