import { createChunkQueue } from "../client/chunkQueue";
import type { ChunkCommitMeta } from "../protocol/messages";

const meta = (startUs: number, endUs: number): ChunkCommitMeta => ({
	rowCount: 1,
	byteLength: 4,
	checksum: { algo: "crc32c", value: "00000000" },
	startUs,
	endUs,
});

const payload = (bytes: number) => new Uint8Array(bytes);
const always = () => true;

describe("enqueue and send order", () => {
	it("hands out chunks of one stream strictly in sequence order", () => {
		const queue = createChunkQueue({ jitter: () => 0 });
		queue.enqueue("s1", 0, payload(4), meta(0, 1));
		queue.enqueue("s1", 1, payload(4), meta(1, 2));
		const first = queue.nextSendable(0, always);
		expect(first?.sequence).toBe(0);
		queue.markSent("s1", 0, "r0", 0);
		const second = queue.nextSendable(0, always);
		expect(second?.sequence).toBe(1);
		queue.markSent("s1", 1, "r1", 0);
		expect(queue.nextSendable(0, always)).toBeNull();
	});

	it("respects the caller's window gate per stream", () => {
		const queue = createChunkQueue({ jitter: () => 0 });
		queue.enqueue("s1", 0, payload(4), meta(0, 1));
		queue.enqueue("s2", 0, payload(4), meta(0, 1));
		const gated = queue.nextSendable(0, (streamId) => streamId !== "s1");
		expect(gated?.streamId).toBe("s2");
	});

	it("tracks retained bytes and size until ACK", () => {
		const queue = createChunkQueue({ jitter: () => 0 });
		queue.enqueue("s1", 0, payload(100), meta(0, 1));
		queue.enqueue("s1", 1, payload(50), meta(1, 2));
		expect(queue.size()).toBe(2);
		expect(queue.retainedBytes()).toBe(150);
		const acked = queue.ack("s1", 0);
		expect(acked?.sequence).toBe(0);
		expect(queue.size()).toBe(1);
		expect(queue.retainedBytes()).toBe(50);
		expect(queue.hasPendingFor("s1")).toBe(true);
		queue.ack("s1", 1);
		expect(queue.hasPendingFor("s1")).toBe(false);
	});
});

describe("backoff policy", () => {
	it("runs 1 s → 30 s doubling with zero jitter", () => {
		const queue = createChunkQueue({ jitter: () => 0 });
		expect(queue.backoffDelayMs(0)).toBe(0);
		expect(queue.backoffDelayMs(1)).toBe(1_000);
		expect(queue.backoffDelayMs(2)).toBe(2_000);
		expect(queue.backoffDelayMs(3)).toBe(4_000);
		expect(queue.backoffDelayMs(5)).toBe(16_000);
		expect(queue.backoffDelayMs(6)).toBe(30_000);
		expect(queue.backoffDelayMs(10)).toBe(30_000);
	});

	it("adds up to 50% jitter but never exceeds the 30 s cap", () => {
		const full = createChunkQueue({ jitter: () => 0.999999 });
		expect(full.backoffDelayMs(1)).toBeGreaterThan(1_000);
		expect(full.backoffDelayMs(1)).toBeLessThanOrEqual(1_500);
		expect(full.backoffDelayMs(6)).toBe(30_000);
	});

	it("a failed chunk is not sendable before its backoff elapses", () => {
		const queue = createChunkQueue({ jitter: () => 0 });
		queue.enqueue("s1", 0, payload(4), meta(0, 1));
		queue.markSent("s1", 0, "r0", 0);
		queue.requeueAfterFailure("s1", 0, 1_000);
		expect(queue.nextSendable(1_500, always)).toBeNull();
		const retry = queue.nextSendable(2_000, always);
		expect(retry?.sequence).toBe(0);
		expect(retry?.failures).toBe(1);
	});
});

describe("failure cascade keeps wire order", () => {
	it("re-queues every later in-flight chunk of the failed stream", () => {
		const queue = createChunkQueue({ jitter: () => 0 });
		for (let sequence = 0; sequence < 4; sequence++) {
			queue.enqueue("s1", sequence, payload(4), meta(sequence, sequence + 1));
			queue.markSent("s1", sequence, `r${sequence}`, 0);
		}
		queue.enqueue("s2", 0, payload(4), meta(0, 1));
		queue.markSent("s2", 0, "other", 0);

		const requeued = queue.requeueAfterFailure("s1", 1, 100);
		expect(requeued.map((entry) => entry.sequence)).toEqual([2, 3]);
		// Later entries lost their in-flight identity.
		expect(queue.get("s1", 2)?.requestId).toBeNull();
		expect(queue.get("s1", 3)?.sentAtMs).toBeNull();
		// Chunk 0 is still in flight; the other stream is untouched.
		expect(queue.get("s1", 0)?.requestId).toBe("r0");
		expect(queue.get("s2", 0)?.requestId).toBe("other");

		// Resend order: 1 first (after backoff), then 2, then 3.
		expect(queue.nextSendable(100, always)).toBeNull(); // backoff pending
		const first = queue.nextSendable(1_100, always);
		expect(first?.sequence).toBe(1);
		queue.markSent("s1", 1, "r1b", 1_100);
		expect(queue.nextSendable(1_100, always)?.sequence).toBe(2);
	});

	it("removeFatal drops the entry permanently", () => {
		const queue = createChunkQueue({ jitter: () => 0 });
		queue.enqueue("s1", 0, payload(4), meta(0, 1));
		queue.markSent("s1", 0, "r0", 0);
		const removed = queue.removeFatal("s1", 0);
		expect(removed?.sequence).toBe(0);
		expect(queue.size()).toBe(0);
		expect(queue.removeFatal("s1", 0)).toBeNull();
	});
});

describe("ACK timeout", () => {
	it("expires in-flight chunks after 15 s by default and applies backoff", () => {
		const queue = createChunkQueue({ jitter: () => 0 });
		queue.enqueue("s1", 0, payload(4), meta(0, 1));
		queue.markSent("s1", 0, "r0", 1_000);
		expect(queue.expireTimedOut(15_999)).toHaveLength(0);
		const expired = queue.expireTimedOut(16_000);
		expect(expired.map((entry) => entry.sequence)).toEqual([0]);
		expect(queue.get("s1", 0)?.failures).toBe(1);
		// Not sendable until the 1 s backoff elapses.
		expect(queue.nextSendable(16_500, always)).toBeNull();
		expect(queue.nextSendable(17_000, always)?.sequence).toBe(0);
	});

	it("honors a custom ackTimeoutMs", () => {
		const queue = createChunkQueue({ ackTimeoutMs: 100, jitter: () => 0 });
		queue.enqueue("s1", 0, payload(4), meta(0, 1));
		queue.markSent("s1", 0, "r0", 0);
		expect(queue.expireTimedOut(99)).toHaveLength(0);
		expect(queue.expireTimedOut(100)).toHaveLength(1);
	});

	it("cascades a timeout to later in-flight chunks of the stream", () => {
		const queue = createChunkQueue({ ackTimeoutMs: 100, jitter: () => 0 });
		queue.enqueue("s1", 0, payload(4), meta(0, 1));
		queue.enqueue("s1", 1, payload(4), meta(1, 2));
		queue.markSent("s1", 0, "r0", 0);
		queue.markSent("s1", 1, "r1", 90);
		const expired = queue.expireTimedOut(120);
		// Only chunk 0 timed out, but chunk 1 was pulled back with it.
		expect(expired.map((entry) => entry.sequence)).toEqual([0]);
		expect(queue.get("s1", 1)?.sentAtMs).toBeNull();
	});
});
