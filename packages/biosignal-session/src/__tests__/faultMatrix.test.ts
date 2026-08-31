/**
 * Fault matrix: a transient failure anywhere in a session must not cost data.
 *
 * The existing fault suite samples individual failures. This crosses every
 * recoverable fault the reference host can inject with every position in the
 * session — the very first chunk, the middle, and the last one before
 * finalize — and for each combination asserts the *outcome* rather than the
 * mechanism: the recording still ends complete, every chunk is present
 * exactly once in contiguous order, and every sample value survives.
 *
 * Position matters because the first chunk has no predecessor to re-queue
 * behind, and the last one races finalize.
 */

import { decodeChunk, readFloat32Column } from "../arrow/decode";
import type { StreamDescriptorDraft } from "../contracts/session";
import { createRecorderHarness, HARNESS_SOURCE } from "../testing/recorderHarness";
import type { RecorderHarness } from "../testing/recorderHarness";

const CHANNELS = ["ch1", "ch2"];
const RATE_HZ = 256;
/** ~8 s of data per chunk at this target, so a short session spans several. */
const CHUNK_TARGET_BYTES = 16 * 1024;
const TOTAL_SAMPLES = 12_000;
const BATCH = 400;

type FaultName = "lost-ack" | "storage-unavailable" | "corrupt-payload" | "rate-limited";

const FAULTS: FaultName[] = [
	"lost-ack",
	"storage-unavailable",
	"corrupt-payload",
	"rate-limited",
];

/** Where in the committed sequence the fault is armed. */
const POSITIONS = ["first", "middle", "last"] as const;
type Position = (typeof POSITIONS)[number];

function streamDraft(): StreamDescriptorDraft {
	return {
		sourceId: HARNESS_SOURCE.name,
		modality: "eeg",
		sampling: "regular",
		sampleRateHz: RATE_HZ,
		channels: CHANNELS.map((name) => ({ name })),
		encoding: "arrow-ipc",
		arrowSchemaId: "regular-wide-f32@1",
		layout: "wide",
		clockSource: "local",
	};
}

const sampleValue = (channel: number, index: number): number =>
	Math.fround(channel * 500_000 + index);

function arm(harness: RecorderHarness, fault: FaultName): void {
	switch (fault) {
		case "lost-ack":
			harness.host.dropNextAck();
			return;
		case "storage-unavailable":
			harness.host.failNextCommitWith("storage_unavailable");
			return;
		case "corrupt-payload":
			harness.host.corruptNextPayload();
			return;
		case "rate-limited":
			harness.host.failNextCommitWith("rate_limited");
			return;
	}
}

/** Chunk index at which the fault should fire, given the expected total. */
function targetIndex(position: Position, expectedChunks: number): number {
	if (position === "first") return 0;
	if (position === "last") return Math.max(expectedChunks - 1, 0);
	return Math.floor(expectedChunks / 2);
}

async function runWithFault(fault: FaultName, position: Position) {
	const harness = createRecorderHarness({
		config: { chunkTargetBytes: CHUNK_TARGET_BYTES },
	});
	await harness.start();
	const handle = harness.sink.openStream(streamDraft());
	// Let the stream/open round trip land first. `dropNextAck` swallows the
	// next successful reply of ANY kind, so arming it before the stream is
	// established would eat the open reply instead of a chunk ACK.
	await harness.settle();

	// bytes/chunk ÷ (channels × 4) = rows/chunk, so we can aim at a position.
	const rowsPerChunk = CHUNK_TARGET_BYTES / (CHANNELS.length * 4);
	const expectedChunks = Math.ceil(TOTAL_SAMPLES / rowsPerChunk);
	const fireAt = targetIndex(position, expectedChunks);

	let pushed = 0;
	let armed = false;
	while (pushed < TOTAL_SAMPLES) {
		// Arm as soon as the host has accepted the chunks preceding the target,
		// so the very next commit is the one that fails.
		if (!armed && harness.host.chunks.size >= fireAt) {
			arm(harness, fault);
			armed = true;
		}
		const rows = Math.min(BATCH, TOTAL_SAMPLES - pushed);
		const rowMajor = new Float32Array(rows * CHANNELS.length);
		for (let row = 0; row < rows; row++) {
			for (let channel = 0; channel < CHANNELS.length; channel++) {
				rowMajor[row * CHANNELS.length + channel] = sampleValue(
					channel,
					pushed + row,
				);
			}
		}
		handle.pushRegular(rowMajor, rows, pushed, harness.sessionClock.nowUs());
		pushed += rows;
		// Advance well past the 15 s ACK timeout budget in aggregate so a
		// dropped ACK has room to time out and replay before the session ends.
		await harness.advance((rows / RATE_HZ) * 1000);
	}
	expect(armed).toBe(true);

	// Give retries/backoff room to complete before finalizing.
	await harness.advance(40_000);
	await harness.finalize();
	return harness;
}

describe.each(FAULTS)("a %s fault", (fault) => {
	describe.each(POSITIONS)("arriving at the %s chunk", (position) => {
		let harness: RecorderHarness;

		beforeAll(async () => {
			harness = await runWithFault(fault, position);
		});

		it("still completes the session", () => {
			const session = [...harness.host.sessions.values()][0];
			expect(session?.state).toBe("complete");
		});

		it("stores every chunk exactly once, in contiguous order", () => {
			const chunks = [...harness.host.chunks.values()].sort(
				(a, b) => a.descriptor.sequence - b.descriptor.sequence,
			);
			expect(chunks.length).toBeGreaterThan(1);
			// Contiguous from zero: no gap (lost data) and no repeat (double
			// commit of a replayed chunk).
			expect(chunks.map((chunk) => chunk.descriptor.sequence)).toEqual(
				chunks.map((_, i) => i),
			);
			const total = chunks.reduce((sum, chunk) => sum + chunk.descriptor.rowCount, 0);
			expect(total).toBe(TOTAL_SAMPLES);
		});

		it("preserves every sample value through the fault", () => {
			const chunks = [...harness.host.chunks.values()].sort(
				(a, b) => a.descriptor.sequence - b.descriptor.sequence,
			);
			const perChannel: number[][] = CHANNELS.map(() => []);
			for (const chunk of chunks) {
				const table = decodeChunk(chunk.payload as Uint8Array).table;
				CHANNELS.forEach((name, channel) => {
					for (const value of readFloat32Column(table, name)) {
						perChannel[channel].push(value);
					}
				});
			}
			CHANNELS.forEach((_, channel) => {
				const expected = new Float32Array(TOTAL_SAMPLES);
				for (let i = 0; i < TOTAL_SAMPLES; i++) {
					expected[i] = sampleValue(channel, i);
				}
				expect(Float32Array.from(perChannel[channel])).toEqual(expected);
			});
		});
	});
});
