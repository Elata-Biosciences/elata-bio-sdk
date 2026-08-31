/**
 * Property-based invariants.
 *
 * The fixed-scenario suites prove the pipeline works for the shapes we thought
 * to write down. This one randomizes the shapes — sample rate, channel count,
 * batch sizes, chunk target, total duration — and asserts the properties that
 * must hold for EVERY configuration. Failures print the seed so any case can
 * be replayed deterministically.
 */

import { crc32cHex } from "../arrow/checksum";
import { decodeChunk, readFloat32Column } from "../arrow/decode";
import type { StreamDescriptorDraft } from "../contracts/session";
import { mulberry32 } from "../testing/prng";
import { createRecorderHarness, HARNESS_SOURCE } from "../testing/recorderHarness";

interface Scenario {
	seed: number;
	sampleRateHz: number;
	channelCount: number;
	totalSamples: number;
	batches: number[];
	chunkTargetBytes: number;
}

/** Build a randomized but legal scenario from a seed. */
function scenarioFor(seed: number): Scenario {
	const random = mulberry32(seed);
	const pick = <T>(values: readonly T[]): T =>
		values[Math.floor(random() * values.length)];

	const sampleRateHz = pick([32, 52, 64, 125, 250, 256, 500, 1000]);
	const channelCount = pick([1, 2, 3, 4, 8, 16]);
	const chunkTargetBytes = pick([8 * 1024, 32 * 1024, 64 * 1024, 256 * 1024]);
	const totalSamples = 200 + Math.floor(random() * 4_000);

	// Irregular batch sizes, so chunk boundaries rarely align with a batch.
	const batches: number[] = [];
	let remaining = totalSamples;
	while (remaining > 0) {
		const size = Math.min(remaining, 1 + Math.floor(random() * 400));
		batches.push(size);
		remaining -= size;
	}
	return { seed, sampleRateHz, channelCount, totalSamples, batches, chunkTargetBytes };
}

function streamDraft(scenario: Scenario): StreamDescriptorDraft {
	return {
		sourceId: HARNESS_SOURCE.name,
		modality: "eeg",
		sampling: "regular",
		sampleRateHz: scenario.sampleRateHz,
		channels: Array.from({ length: scenario.channelCount }, (_, i) => ({
			name: `CH${i + 1}`,
		})),
		encoding: "arrow-ipc",
		arrowSchemaId: "regular-wide-f32@1",
		layout: "wide",
		clockSource: "local",
	};
}

/** Deterministic, uniquely identifying value for (channel, absolute index). */
function sampleValue(channel: number, index: number): number {
	return Math.fround(channel * 1e6 + index);
}

async function runScenario(scenario: Scenario) {
	const harness = createRecorderHarness({
		config: { chunkTargetBytes: scenario.chunkTargetBytes },
	});
	await harness.start();
	const handle = harness.sink.openStream(streamDraft(scenario));

	let pushed = 0;
	for (const rows of scenario.batches) {
		const rowMajor = new Float32Array(rows * scenario.channelCount);
		for (let row = 0; row < rows; row++) {
			for (let channel = 0; channel < scenario.channelCount; channel++) {
				rowMajor[row * scenario.channelCount + channel] = sampleValue(
					channel,
					pushed + row,
				);
			}
		}
		handle.pushRegular(rowMajor, rows, pushed, harness.sessionClock.nowUs());
		pushed += rows;
		await harness.advance((rows / scenario.sampleRateHz) * 1000);
	}
	await harness.finalize();

	const streamId = [...harness.host.streams.values()].find(
		(stream) => stream.modality === "eeg",
	)?.streamId;
	const chunks = [...harness.host.chunks.values()]
		.filter((chunk) => chunk.descriptor.streamId === streamId)
		.sort((a, b) => a.descriptor.sequence - b.descriptor.sequence);
	return { harness, chunks };
}

// A fixed spread of seeds: deterministic in CI, but broad enough that a
// shape-dependent bug is very unlikely to slip through all of them.
const SEEDS = [1, 7, 13, 29, 42, 101, 512, 777, 2024, 31337];

describe.each(SEEDS)("randomized session (seed %i)", (seed) => {
	const scenario = scenarioFor(seed);
	const label =
		`${scenario.channelCount}ch @ ${scenario.sampleRateHz}Hz, ` +
		`${scenario.totalSamples} samples, ${scenario.batches.length} batches, ` +
		`${scenario.chunkTargetBytes / 1024}KiB target`;

	let chunks: Awaited<ReturnType<typeof runScenario>>["chunks"];

	beforeAll(async () => {
		({ chunks } = await runScenario(scenario));
	});

	it(`conserves every sample — ${label}`, () => {
		const total = chunks.reduce((sum, chunk) => sum + chunk.descriptor.rowCount, 0);
		expect(total).toBe(scenario.totalSamples);
	});

	it("keeps chunk sequences contiguous from zero", () => {
		expect(chunks.map((chunk) => chunk.descriptor.sequence)).toEqual(
			chunks.map((_, i) => i),
		);
	});

	it("keeps sample indices contiguous with no overlap or hole", () => {
		let cursor = 0;
		for (const chunk of chunks) {
			expect(chunk.descriptor.sampleIndexStart).toBe(cursor);
			cursor += chunk.descriptor.rowCount;
		}
		expect(cursor).toBe(scenario.totalSamples);
	});

	it("keeps time strictly increasing across chunk boundaries", () => {
		let previousEnd = Number.NEGATIVE_INFINITY;
		for (const chunk of chunks) {
			expect(chunk.descriptor.startUs).toBeGreaterThan(previousEnd);
			expect(chunk.descriptor.endUs).toBeGreaterThanOrEqual(chunk.descriptor.startUs);
			previousEnd = chunk.descriptor.endUs;
		}
	});

	it("re-verifies every checksum over the stored bytes", () => {
		for (const chunk of chunks) {
			expect(crc32cHex(chunk.payload as Uint8Array)).toBe(
				chunk.descriptor.checksum.value,
			);
		}
	});

	it("never exceeds the protocol's hard payload cap", () => {
		for (const chunk of chunks) {
			expect(chunk.descriptor.byteLength).toBeLessThanOrEqual(8 * 1024 * 1024);
			expect(chunk.descriptor.byteLength).toBe(
				(chunk.payload as Uint8Array).byteLength,
			);
		}
	});

	it("round-trips every sample value on every channel", () => {
		const perChannel: number[][] = Array.from(
			{ length: scenario.channelCount },
			() => [],
		);
		for (const chunk of chunks) {
			const table = decodeChunk(chunk.payload as Uint8Array).table;
			for (let channel = 0; channel < scenario.channelCount; channel++) {
				for (const value of readFloat32Column(table, `CH${channel + 1}`)) {
					perChannel[channel].push(value);
				}
			}
		}
		for (let channel = 0; channel < scenario.channelCount; channel++) {
			const expected = new Float32Array(scenario.totalSamples);
			for (let i = 0; i < scenario.totalSamples; i++) {
				expected[i] = sampleValue(channel, i);
			}
			expect(Float32Array.from(perChannel[channel])).toEqual(expected);
		}
	});
});
