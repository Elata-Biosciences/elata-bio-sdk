/**
 * Lost-ACK idempotency: the host commits durably but the ACK never arrives;
 * the client retries after the ACK timeout and the host answers with an
 * idempotent replay — exactly one committed chunk, no duplicate rows.
 */

import type { StreamDescriptorDraft } from "../contracts/session";
import { createRecorderHarness } from "../testing/recorderHarness";

const eegDraft: StreamDescriptorDraft = {
	sourceId: "src",
	modality: "eeg",
	sampling: "regular",
	sampleRateHz: 100,
	channels: [{ name: "ch1" }],
	encoding: "arrow-ipc",
	arrowSchemaId: "regular-wide-f32@1",
	layout: "wide",
	clockSource: "local",
};

function samples(count: number): Float32Array {
	const data = new Float32Array(count);
	for (let i = 0; i < count; i++) data[i] = i;
	return data;
}

describe("lost ACK → retry → single committed chunk", () => {
	it("replays idempotently after the 15 s ACK timeout", async () => {
		const h = createRecorderHarness({
			config: { chunkTargetBytes: 40 }, // 10 rows per chunk
		});
		await h.start();
		const handle = h.sink.openStream(eegDraft);
		await h.settle();
		const hostStreamId = h.eventsOf("stream-open")[0].streamId;

		h.host.dropNextAck();
		handle.pushRegular(samples(10), 10, 0, 0);
		await h.settle();

		// Committed durably at the host, but the client never saw the ACK.
		expect(h.host.chunks.size).toBe(1);
		expect(h.eventsOf("progress")).toHaveLength(0);

		// Before the ACK timeout nothing is resent.
		await h.advance(14_000);
		expect(h.host.chunks.size).toBe(1);
		expect(h.host.streams.get(hostStreamId)?.stats.chunkCount).toBe(1);
		expect(h.eventsOf("progress")).toHaveLength(0);

		// Past the timeout the chunk re-queues with 1 s backoff, then resends.
		await h.advance(2_000); // 16 s total — expired, backoff pending
		await h.advance(1_000); // backoff elapsed — resend goes out
		await h.settle();

		// Exactly one committed chunk; the replay ACK completed the client.
		expect(h.host.chunks.size).toBe(1);
		expect(h.host.streams.get(hostStreamId)?.expectedNextSequence).toBe(1);
		expect(h.host.streams.get(hostStreamId)?.stats.rowCount).toBe(10);
		const progress = h.eventsOf("progress");
		expect(progress).toHaveLength(1);
		expect(progress[0]).toMatchObject({ committedChunks: 1, inFlight: 0 });

		// The session still finalizes cleanly afterwards.
		await h.finalize();
		expect(h.core.state()).toBe("complete");
		expect(h.host.sessions.get("mh-1")?.stats.totalChunks).toBe(1);
	});

	it("subsequent chunks continue in sequence after a replayed commit", async () => {
		const h = createRecorderHarness({
			config: { chunkTargetBytes: 40 },
		});
		await h.start();
		const handle = h.sink.openStream(eegDraft);
		await h.settle();
		const hostStreamId = h.eventsOf("stream-open")[0].streamId;

		h.host.dropNextAck();
		handle.pushRegular(samples(10), 10, 0, 0);
		await h.settle();
		await h.advance(16_000);
		await h.advance(1_000);
		await h.settle();

		handle.pushRegular(samples(10), 10, 10, 100_000);
		await h.settle();

		const chunks = h.host.chunksForStream(hostStreamId);
		expect(chunks.map((chunk) => chunk.descriptor.sequence)).toEqual([0, 1]);
		expect(chunks.map((chunk) => chunk.descriptor.sampleIndexStart)).toEqual([
			0, 10,
		]);
	});
});
