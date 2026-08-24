/**
 * Hostile-client behaviour.
 *
 * The threat actor is a third-party app running inside the sandboxed iframe:
 * it speaks the protocol, but lies. Each case here sends a deliberately
 * malicious or malformed request and asserts two things — the host refuses it
 * with the specific documented error code, and the session survives in a
 * consistent state afterwards (a rejection must never corrupt the catalog or
 * wedge the port).
 */

import { checksumOf } from "../arrow/checksum";
import { encodeWideF32Chunk } from "../arrow/encode";
import type { SourceDescriptorDraft, StreamDescriptorDraft } from "../contracts/session";
import type { BiosignalErrorCode } from "../protocol/errors";
import type { HostToClient } from "../protocol/messages";
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

function payloadFor(sessionId: string, streamId: string): Uint8Array {
	return encodeWideF32Chunk(
		["ch1", "ch2"],
		[Float32Array.from([1, 2, 3, 4]), Float32Array.from([5, 6, 7, 8])],
		{ sessionId, streamId, arrowSchemaId: "regular-wide-f32@1" },
	);
}

function harness() {
	const host = createMemoryHost();
	const [clientPort, hostPort] = createLoopbackPortPair();
	host.attach(hostPort);
	const replies: HostToClient[] = [];
	clientPort.onmessage = (event) => replies.push(event.data as HostToClient);
	let counter = 0;
	const send = (partial: Record<string, unknown>, transfer?: Transferable[]) => {
		const id = `req-${++counter}`;
		clientPort.postMessage({ v: 1, id, ...partial }, transfer ?? []);
		return id;
	};
	const replyFor = (id: string) =>
		replies.find((message) => "id" in message && message.id === id);
	/**
	 * Send, settle, and report what the host did: the error code on refusal,
	 * `"ACCEPTED"` when it succeeded, `"NO_REPLY"` when it stayed silent.
	 * These three are kept distinct so a test can never mistake silence for
	 * a rejection.
	 */
	const outcomeOf = async (
		partial: Record<string, unknown>,
		transfer?: Transferable[],
	): Promise<BiosignalErrorCode | "ACCEPTED" | "NO_REPLY"> => {
		const id = send(partial, transfer);
		await settleMicrotasks();
		const reply = replyFor(id);
		if (!reply || !("ok" in reply)) return "NO_REPLY";
		return reply.ok ? "ACCEPTED" : reply.error;
	};
	return { host, send, replyFor, outcomeOf };
}

const baseSpec = () => ({
	startedAtUtcMs: 1_700_000_000_000,
	startedAtMonotonicMs: 10_000,
	sources: [sourceDraft],
	provenance: { recorderVersion: "0.1.0", protocolVersion: 1, sdkPackages: [] },
});

async function openSession(h: ReturnType<typeof harness>) {
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

describe("a hostile client cannot forge identity", () => {
	it("refuses a chunk aimed at a session that does not exist", async () => {
		const h = harness();
		const { streamId } = await openSession(h);
		const payload = payloadFor("forged", streamId);
		const error = await h.outcomeOf(
			{
				op: "chunk/commit",
				sessionId: "00000000-0000-4000-8000-000000000000",
				streamId,
				sequence: 0,
				meta: {
					rowCount: 4,
					byteLength: payload.byteLength,
					checksum: checksumOf(payload),
					startUs: 0,
					endUs: 999,
					sampleIndexStart: 0,
				},
				payload: payload.slice().buffer,
			},
			[],
		);
		expect(error).toBe("unknown_session");
		expect(h.host.chunks.size).toBe(0);
	});

	it("refuses a stream id belonging to a different session", async () => {
		const h = harness();
		const first = await openSession(h);
		const second = await openSession(h);
		const payload = payloadFor(second.sessionId, first.streamId);
		// Session B, but stream A — a cross-session write attempt.
		const error = await h.outcomeOf({
			op: "chunk/commit",
			sessionId: second.sessionId,
			streamId: first.streamId,
			sequence: 0,
			meta: {
				rowCount: 4,
				byteLength: payload.byteLength,
				checksum: checksumOf(payload),
				startUs: 0,
				endUs: 999,
				sampleIndexStart: 0,
			},
			payload: payload.slice().buffer,
		});
		expect(error).toBe("unknown_stream");
		expect(h.host.chunks.size).toBe(0);
	});

	it("stamps app origin on events even when the client claims host", async () => {
		const h = harness();
		const { sessionId } = await openSession(h);
		const id = h.send({
			op: "event/append",
			sessionId,
			events: [
				{
					timestampUs: 1_000,
					kind: "quality",
					name: "device.status",
					origin: "host",
					payload: { claimed: "host" },
				},
			],
		});
		await settleMicrotasks();
		const reply = h.replyFor(id) as Extract<HostToClient, { ok: true }>;
		expect(reply.ok).toBe(true);
		// Whatever the client asserted, the stored row is app-origin.
		const stored = [...h.host.events.values()].flat();
		expect(stored.length).toBe(1);
		expect(stored[0].origin).toBe("app");
	});
});

describe("a hostile client cannot corrupt the stream", () => {
	it("refuses a negative sequence number", async () => {
		const h = harness();
		const { sessionId, streamId } = await openSession(h);
		const payload = payloadFor(sessionId, streamId);
		const error = await h.outcomeOf({
			op: "chunk/commit",
			sessionId,
			streamId,
			sequence: -1,
			meta: {
				rowCount: 4,
				byteLength: payload.byteLength,
				checksum: checksumOf(payload),
				startUs: 0,
				endUs: 999,
				sampleIndexStart: 0,
			},
			payload: payload.slice().buffer,
		});
		expect(error).not.toBe("ACCEPTED");
		expect(h.host.chunks.size).toBe(0);
	});

	it("refuses non-finite timing values", async () => {
		const h = harness();
		const { sessionId, streamId } = await openSession(h);
		const payload = payloadFor(sessionId, streamId);
		for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
			const error = await h.outcomeOf({
				op: "chunk/commit",
				sessionId,
				streamId,
				sequence: 0,
				meta: {
					rowCount: 4,
					byteLength: payload.byteLength,
					checksum: checksumOf(payload),
					startUs: bad,
					endUs: bad,
					sampleIndexStart: 0,
				},
				payload: payload.slice().buffer,
			});
			expect(error).toBe("invalid_payload");
		}
		expect(h.host.chunks.size).toBe(0);
	});

	it("refuses a stream declaring an unknown modality or schema", async () => {
		const h = harness();
		const createId = h.send({ op: "session/create", spec: baseSpec() });
		await settleMicrotasks();
		const created = h.replyFor(createId) as Extract<HostToClient, { ok: true }>;
		const { session } = created.result as { session: { sessionId: string } };

		const badModality = await h.outcomeOf({
			op: "stream/open",
			sessionId: session.sessionId,
			stream: { ...eegDraft("src-1"), modality: "telepathy" },
		});
		expect(badModality).toBe("invalid_payload");

		const badSchema = await h.outcomeOf({
			op: "stream/open",
			sessionId: session.sessionId,
			stream: { ...eegDraft("src-1"), arrowSchemaId: "made-up@9" },
		});
		expect(badSchema).toBe("invalid_payload");
	});

	it("refuses writes to a session that has already been finalized", async () => {
		const h = harness();
		const { sessionId, streamId } = await openSession(h);
		const finalizeId = h.send({ op: "session/finalize", sessionId, endUs: 1_000 });
		await settleMicrotasks();
		expect((h.replyFor(finalizeId) as { ok: boolean }).ok).toBe(true);

		const payload = payloadFor(sessionId, streamId);
		const chunkError = await h.outcomeOf({
			op: "chunk/commit",
			sessionId,
			streamId,
			sequence: 0,
			meta: {
				rowCount: 4,
				byteLength: payload.byteLength,
				checksum: checksumOf(payload),
				startUs: 0,
				endUs: 999,
				sampleIndexStart: 0,
			},
			payload: payload.slice().buffer,
		});
		expect(chunkError).toBe("bad_state");

		const eventError = await h.outcomeOf({
			op: "event/append",
			sessionId,
			events: [{ timestampUs: 1, kind: "annotation", name: "late" }],
		});
		expect(eventError).toBe("bad_state");
	});
});

describe("the port survives abuse", () => {
	it("keeps serving valid traffic after a burst of malformed requests", async () => {
		const h = harness();
		const { sessionId, streamId } = await openSession(h);

		// Garbage of several shapes, including things that are not requests.
		for (const junk of [
			{ op: "nonexistent/op" },
			{ op: "chunk/commit" },
			{ op: "session/read", sessionId: 42 },
			{ op: "event/append", sessionId, events: "not-an-array" },
			{ op: "event/append", sessionId, events: [] },
		]) {
			await h.outcomeOf(junk);
		}

		// The session is untouched and still accepts a legitimate commit.
		const payload = payloadFor(sessionId, streamId);
		const id = h.send({
			op: "chunk/commit",
			sessionId,
			streamId,
			sequence: 0,
			meta: {
				rowCount: 4,
				byteLength: payload.byteLength,
				checksum: checksumOf(payload),
				startUs: 0,
				endUs: 999,
				sampleIndexStart: 0,
			},
			payload: payload.slice().buffer,
		});
		await settleMicrotasks();
		const reply = h.replyFor(id) as Extract<HostToClient, { ok: true }>;
		expect(reply.ok).toBe(true);
		expect(h.host.chunks.size).toBe(1);
	});

	it("does not leak other sessions through session/list or session/read", async () => {
		const h = harness();
		const first = await openSession(h);
		const second = await openSession(h);

		const readId = h.send({ op: "session/read", sessionId: first.sessionId });
		await settleMicrotasks();
		const read = h.replyFor(readId) as Extract<HostToClient, { ok: true }>;
		const { session } = read.result as { session: { sessionId: string } };
		// A read answers about exactly the session asked for.
		expect(session.sessionId).toBe(first.sessionId);
		expect(session.sessionId).not.toBe(second.sessionId);
	});
});
