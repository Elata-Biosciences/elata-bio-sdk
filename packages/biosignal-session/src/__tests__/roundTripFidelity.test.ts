/**
 * Bit-exact end-to-end fidelity.
 *
 * Every other suite checks structure (counts, checksums, state). This one
 * checks the data itself: known sample values are pushed through the whole
 * client pipeline — sample buffer → Arrow encode → checksum → port → host
 * commit → stored bytes — then decoded back and compared value by value.
 * A single flipped float, a transposed channel, or an off-by-one chunk
 * boundary fails here.
 *
 * The streams are driven directly rather than by a generator so the expected
 * values are exact by construction.
 */

import { decodeChunk, readFloat32Column, readTimeUsColumn } from "../arrow/decode";
import type { StreamDescriptorDraft } from "../contracts/session";
import { createRecorderHarness, HARNESS_SOURCE } from "../testing/recorderHarness";
import type { RecorderHarness } from "../testing/recorderHarness";

const CHANNELS = ["TP9", "AF7", "AF8", "TP10"];
const RATE_HZ = 256;

/**
 * Values chosen to catch encoding mistakes a smooth waveform would hide:
 * signed zero, float32 denormals, the type's extremes, and decimals that are
 * not representable exactly in binary floating point.
 */
const EDGE_VALUES = [
	0,
	-0,
	1,
	-1,
	0.1,
	-0.1,
	1e-38,
	-1e-38,
	3.4028234e38,
	-3.4028234e38,
	1 / 3,
	123456.789,
];

function eegStream(sourceId: string): StreamDescriptorDraft {
	return {
		sourceId,
		modality: "eeg",
		sampling: "regular",
		sampleRateHz: RATE_HZ,
		channels: CHANNELS.map((name) => ({ name, unit: "uV" })),
		encoding: "arrow-ipc",
		arrowSchemaId: "regular-wide-f32@1",
		layout: "wide",
		clockSource: "local",
	};
}

function traceStream(sourceId: string): StreamDescriptorDraft {
	return {
		sourceId,
		modality: "rppg-trace",
		sampling: "irregular",
		channels: [{ name: "value" }, { name: "raw" }],
		encoding: "arrow-ipc",
		arrowSchemaId: "rppg-trace@1",
		layout: "wide",
		clockSource: "local",
	};
}

/** The exact sample the harness should see at (channel, absolute index). */
function expectedSample(channel: number, index: number): number {
	// Interleave the edge cases through an otherwise distinctive ramp so every
	// channel and index combination is uniquely identifiable.
	if (index < EDGE_VALUES.length) {
		return Math.fround(EDGE_VALUES[index] * (channel + 1));
	}
	return Math.fround(channel * 100_000 + index * 0.5);
}

/** Concatenate a stream's committed chunks back into per-channel series. */
function decodeChannels(
	harness: RecorderHarness,
	streamId: string,
): { columns: Float32Array[]; rowTotal: number; sequences: number[]; starts: number[] } {
	const chunks = [...harness.host.chunks.values()]
		.filter((chunk) => chunk.descriptor.streamId === streamId)
		.sort((a, b) => a.descriptor.sequence - b.descriptor.sequence);

	const perChannel: number[][] = CHANNELS.map(() => []);
	for (const chunk of chunks) {
		const table = decodeChunk(chunk.payload as Uint8Array).table;
		CHANNELS.forEach((name, channel) => {
			const column = readFloat32Column(table, name);
			for (const value of column) perChannel[channel].push(value);
		});
	}
	return {
		columns: perChannel.map((values) => Float32Array.from(values)),
		rowTotal: chunks.reduce((sum, chunk) => sum + chunk.descriptor.rowCount, 0),
		sequences: chunks.map((chunk) => chunk.descriptor.sequence),
		starts: chunks.map((chunk) => chunk.descriptor.sampleIndexStart ?? -1),
	};
}

describe("bit-exact round trip", () => {
	// 20 000 samples at 256 Hz ≈ 78 s, which crosses the 30 s duration cap
	// twice — so the data spans three chunks rather than one flush.
	const TOTAL_SAMPLES = 20_000;
	const BATCH = 500; // deliberately not a divisor of the 7680-row chunk
	let harness: RecorderHarness;
	let eegStreamId: string;
	let traceStreamId: string;

	beforeAll(async () => {
		harness = createRecorderHarness();
		await harness.start();
		const sourceId = HARNESS_SOURCE.name;
		const eeg = harness.sink.openStream(eegStream(sourceId));
		const trace = harness.sink.openStream(traceStream(sourceId));
		// `sink.openStream` hands back the CLIENT-side id; the host assigns its
		// own. Resolve the host ids by modality once the session is finalized.
		void eeg;
		void trace;

		let pushed = 0;
		while (pushed < TOTAL_SAMPLES) {
			const rows = Math.min(BATCH, TOTAL_SAMPLES - pushed);
			const rowMajor = new Float32Array(rows * CHANNELS.length);
			for (let row = 0; row < rows; row++) {
				for (let channel = 0; channel < CHANNELS.length; channel++) {
					rowMajor[row * CHANNELS.length + channel] = expectedSample(
						channel,
						pushed + row,
					);
				}
			}
			eeg.pushRegular(rowMajor, rows, pushed, harness.sessionClock.nowUs());

			// An irregular stream interleaved on the same session clock.
			const times = new Float64Array(rows);
			const traceRows = new Float32Array(rows * 2);
			for (let row = 0; row < rows; row++) {
				times[row] = harness.sessionClock.nowUs() + row * 1000;
				traceRows[row * 2] = Math.fround((pushed + row) * 0.125);
				traceRows[row * 2 + 1] = Math.fround(-(pushed + row));
			}
			trace.pushIrregular(times, traceRows, rows);

			pushed += rows;
			await harness.advance((rows / RATE_HZ) * 1000);
		}
		await harness.finalize();

		for (const stream of harness.host.streams.values()) {
			if (stream.modality === "eeg") eegStreamId = stream.streamId;
			if (stream.modality === "rppg-trace") traceStreamId = stream.streamId;
		}
	});

	it("preserves every EEG sample value exactly, channel by channel", () => {
		const { columns } = decodeChannels(harness, eegStreamId);
		CHANNELS.forEach((_, channel) => {
			const expected = new Float32Array(TOTAL_SAMPLES);
			for (let i = 0; i < TOTAL_SAMPLES; i++) expected[i] = expectedSample(channel, i);
			// Whole-array equality: no spot checks, no tolerance.
			expect(columns[channel]).toEqual(expected);
		});
	});

	it("keeps signed zero, denormals, and float32 extremes intact", () => {
		const { columns } = decodeChannels(harness, eegStreamId);
		// -0 must stay -0 (Object.is distinguishes it from +0).
		expect(Object.is(columns[0][1], -0)).toBe(true);
		expect(columns[0][6]).toBe(Math.fround(1e-38));
		expect(columns[0][8]).toBe(Math.fround(3.4028234e38));
		expect(columns[0][9]).toBe(Math.fround(-3.4028234e38));
		// 0.1 and 1/3 survive as their float32 roundings, not float64 values.
		expect(columns[0][4]).toBe(Math.fround(0.1));
		expect(columns[0][10]).toBe(Math.fround(1 / 3));
	});

	it("commits exactly the samples pushed, with contiguous chunk boundaries", () => {
		const { rowTotal, sequences, starts } = decodeChannels(harness, eegStreamId);
		expect(rowTotal).toBe(TOTAL_SAMPLES);
		// Guard the premise: if this ever collapses to one chunk, the suite is
		// no longer testing chunk-boundary fidelity at all.
		expect(sequences.length).toBeGreaterThanOrEqual(3);
		// Sequences are 0..n with no gaps.
		expect(sequences).toEqual(sequences.map((_, i) => i));
		// Each chunk starts where the previous ended — no overlap, no hole.
		const chunks = [...harness.host.chunks.values()]
			.filter((chunk) => chunk.descriptor.streamId === eegStreamId)
			.sort((a, b) => a.descriptor.sequence - b.descriptor.sequence);
		let cursor = 0;
		for (const [i, chunk] of chunks.entries()) {
			expect(starts[i]).toBe(cursor);
			cursor += chunk.descriptor.rowCount;
		}
		expect(cursor).toBe(TOTAL_SAMPLES);
	});

	it("derives per-sample time from the counter, monotonically across chunks", () => {
		const chunks = [...harness.host.chunks.values()]
			.filter((chunk) => chunk.descriptor.streamId === eegStreamId)
			.sort((a, b) => a.descriptor.sequence - b.descriptor.sequence);
		let previousEnd = Number.NEGATIVE_INFINITY;
		for (const chunk of chunks) {
			const { startUs, endUs, rowCount, sampleIndexStart } = chunk.descriptor;
			expect(startUs).toBeGreaterThan(previousEnd);
			expect(endUs).toBeGreaterThanOrEqual(startUs);
			// endUs is the last sample's time: start + (rows-1) periods.
			const expectedSpan = Math.round(((rowCount - 1) * 1_000_000) / RATE_HZ);
			expect(endUs - startUs).toBe(expectedSpan);
			expect(sampleIndexStart).toBeGreaterThanOrEqual(0);
			previousEnd = endUs;
		}
	});

	it("keeps the irregular stream's own timeline and values independent", () => {
		const chunks = [...harness.host.chunks.values()]
			.filter((chunk) => chunk.descriptor.streamId === traceStreamId)
			.sort((a, b) => a.descriptor.sequence - b.descriptor.sequence);
		expect(chunks.length).toBeGreaterThan(0);

		const values: number[] = [];
		const times: number[] = [];
		for (const chunk of chunks) {
			const table = decodeChunk(chunk.payload as Uint8Array).table;
			for (const value of readFloat32Column(table, "value")) values.push(value);
			for (const time of readTimeUsColumn(table)) times.push(time);
		}
		expect(values.length).toBe(TOTAL_SAMPLES);
		for (let i = 0; i < TOTAL_SAMPLES; i++) {
			expect(values[i]).toBe(Math.fround(i * 0.125));
		}
		// Irregular rows carry explicit times, and they never go backwards.
		for (let i = 1; i < times.length; i++) {
			expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
		}
	});

	it("re-verifies every stored chunk's checksum and decodes each in isolation", () => {
		expect(harness.host.chunks.size).toBeGreaterThan(0);
		for (const chunk of harness.host.chunks.values()) {
			const decoded = decodeChunk(chunk.payload as Uint8Array);
			expect(decoded.rowCount).toBe(chunk.descriptor.rowCount);
			expect(decoded.identity.streamId).toBe(chunk.descriptor.streamId);
		}
	});
});
