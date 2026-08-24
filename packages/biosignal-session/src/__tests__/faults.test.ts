/**
 * Fault injection against the full client engine:
 * - transit corruption → `checksum_mismatch` → fresh-checksum resend → ok
 * - `storage_unavailable` → backoff retry → ok
 * - `sequence_conflict` → fatal client error, no blind retry
 * - `rate_limited` control op → surfaced as a retryable error
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

function samples(count: number, base = 0): Float32Array {
	const data = new Float32Array(count);
	for (let i = 0; i < count; i++) data[i] = base + i;
	return data;
}

async function scenario() {
	const h = createRecorderHarness({ config: { chunkTargetBytes: 40 } });
	await h.start();
	const handle = h.sink.openStream(eegDraft);
	await h.settle();
	const hostStreamId = h.eventsOf("stream-open")[0].streamId;
	return { h, handle, hostStreamId };
}

describe("transit corruption", () => {
	it("checksum_mismatch triggers a fresh-checksum resend of the retained payload", async () => {
		const { h, handle, hostStreamId } = await scenario();
		h.host.corruptNextPayload();
		handle.pushRegular(samples(10), 10, 0, 0);
		await h.settle();

		// The corrupted commit was rejected without committing.
		expect(h.host.chunks.size).toBe(0);
		expect(h.eventsOf("error").at(-1)).toMatchObject({
			code: "checksum_mismatch",
			retryable: true,
		});

		// After the 1 s backoff the retained (intact) payload lands.
		await h.advance(1_500);
		expect(h.host.chunks.size).toBe(1);
		const chunk = h.host.chunksForStream(hostStreamId)[0];
		expect(chunk.descriptor.sequence).toBe(0);
		expect(chunk.descriptor.rowCount).toBe(10);

		await h.finalize();
		expect(h.core.state()).toBe("complete");
	});
});

describe("storage-plane failure", () => {
	it("storage_unavailable retries with backoff and succeeds", async () => {
		const { h, hostStreamId, handle } = await scenario();
		h.host.failNextCommitWith("storage_unavailable");
		handle.pushRegular(samples(10), 10, 0, 0);
		await h.settle();
		expect(h.host.chunks.size).toBe(0);
		expect(h.eventsOf("error").at(-1)).toMatchObject({
			code: "storage_unavailable",
			retryable: true,
		});

		await h.advance(1_500);
		expect(h.host.chunks.size).toBe(1);
		expect(h.host.streams.get(hostStreamId)?.expectedNextSequence).toBe(1);

		// Subsequent traffic is unaffected.
		handle.pushRegular(samples(10), 10, 10, 100_000);
		await h.settle();
		expect(h.host.chunks.size).toBe(2);
	});

	it("a failure of chunk N re-queues later in-flight chunks — no sequence gap at the host", async () => {
		const { h, handle, hostStreamId } = await scenario();
		h.host.pause();
		h.host.failNextCommitWith("storage_unavailable");
		// Three chunks go out back to back (window 4).
		for (let batch = 0; batch < 3; batch++) {
			handle.pushRegular(samples(10, batch * 10), 10, batch * 10, batch * 100_000);
		}
		await h.settle();
		h.host.resume(); // chunk 0 fails; 1 and 2 answer sequence_conflict
		await h.settle();
		await h.advance(2_000); // retry 0, then 1 and 2 in order
		await h.advance(2_000);
		const chunks = h.host.chunksForStream(hostStreamId);
		expect(chunks.map((chunk) => chunk.descriptor.sequence)).toEqual([0, 1, 2]);
		expect(h.core.state()).toBe("recording");
	});
});

describe("sequence conflicts are fatal", () => {
	it("a sequence_conflict reply moves the client to error and stops the stream", async () => {
		const { h, handle } = await scenario();
		h.host.failNextCommitWith("sequence_conflict");
		handle.pushRegular(samples(10), 10, 0, 0);
		await h.settle();
		expect(h.core.state()).toBe("error");
		expect(h.eventsOf("error").at(-1)).toMatchObject({
			code: "sequence_conflict",
			retryable: false,
		});
		// No retry ever goes out.
		await h.advance(5_000);
		expect(h.host.chunks.size).toBe(0);
		// The host session is unharmed (still recording, no bad rows).
		expect(h.host.sessions.get("mh-1")?.state).toBe("recording");
	});
});

describe("control-op rate limiting", () => {
	it("surfaces rate_limited as a retryable error without derailing recording", async () => {
		const { h, handle } = await scenario();
		// Exhaust the 100/60 s control window with event batches.
		for (let i = 0; i < 110; i++) {
			h.sink.event({ timestampUs: i, kind: "marker", name: "tick" });
		}
		await h.settle();
		const rateLimited = h.eventsOf("error").filter(
			(event) => event.code === "rate_limited",
		);
		expect(rateLimited.length).toBeGreaterThan(0);
		expect(rateLimited[0].retryable).toBe(true);
		// Chunk commits are exempt from the control-rate limit.
		handle.pushRegular(samples(10), 10, 0, 0);
		await h.settle();
		expect(h.host.chunks.size).toBe(1);
		expect(h.core.state()).toBe("recording");
	});
});
