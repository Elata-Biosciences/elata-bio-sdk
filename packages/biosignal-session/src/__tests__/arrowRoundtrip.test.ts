import { checksumOf } from "../arrow/checksum";
import { decodeChunk, readFloat32Column, readTimeUsColumn } from "../arrow/decode";
import { encodeRowsChunk, encodeWideF32Chunk } from "../arrow/encode";
import type { ChunkIdentity } from "../arrow/schemas";
import { ppgMetricsSchema, rppgMetricsSchema } from "../arrow/schemas";

const identity: ChunkIdentity = {
	sessionId: "11111111-1111-4111-8111-111111111111",
	streamId: "22222222-2222-4222-8222-222222222222",
	arrowSchemaId: "regular-wide-f32@1",
};

describe("wide f32 chunks", () => {
	const channels = ["TP9", "AF7", "AF8", "TP10"];

	function makeColumns(rows: number): Float32Array[] {
		return channels.map((_, ch) => {
			const column = new Float32Array(rows);
			for (let i = 0; i < rows; i++) column[i] = ch * 1000 + i + 0.5;
			return column;
		});
	}

	it("round-trips samples and channel order exactly", () => {
		const columns = makeColumns(256);
		const bytes = encodeWideF32Chunk(channels, columns, identity);
		const decoded = decodeChunk(bytes);
		expect(decoded.rowCount).toBe(256);
		expect(decoded.columnNames).toEqual(channels);
		for (let ch = 0; ch < channels.length; ch++) {
			expect(readFloat32Column(decoded.table, channels[ch])).toEqual(columns[ch]);
		}
	});

	it("carries the Elata identity metadata (self-identifying chunk)", () => {
		const bytes = encodeWideF32Chunk(channels, makeColumns(8), identity);
		const decoded = decodeChunk(bytes);
		expect(decoded.identity).toEqual({
			sessionId: identity.sessionId,
			streamId: identity.streamId,
			arrowSchemaId: "regular-wide-f32@1",
		});
	});

	it("each chunk decodes in isolation with a stable checksum", () => {
		const first = encodeWideF32Chunk(channels, makeColumns(64), identity);
		const second = encodeWideF32Chunk(channels, makeColumns(64), identity);
		expect(checksumOf(first)).toEqual(checksumOf(second));
		// Decoding one chunk needs nothing but its own bytes.
		expect(decodeChunk(second).rowCount).toBe(64);
	});

	it("rejects mismatched channel/column shapes", () => {
		expect(() => encodeWideF32Chunk(channels, makeColumns(8).slice(1), identity)).toThrow(
			/mismatch/,
		);
		const ragged = makeColumns(8);
		ragged[2] = new Float32Array(7);
		expect(() => encodeWideF32Chunk(channels, ragged, identity)).toThrow(/equal length/);
	});
});

describe("rppg-metrics chunks", () => {
	it("round-trips the mixed-type metric row surface", () => {
		const schema = rppgMetricsSchema({ ...identity, arrowSchemaId: "rppg-metrics@1" });
		const rows = [
			{
				time_us: 1_000_000,
				bpm: 72.5,
				confidence: 0.9,
				signal_quality: 0.8,
				bayes_ambiguity: 0.1,
				capture_confidence: 0.95,
				alias_flag: false,
				calibration_trained: true,
				fused_source: "camera",
				reason_codes: ["ok"],
				winning_sources: ["spectral", "acf"],
				capture_reasons: [],
			},
			{
				time_us: 2_000_000,
				bpm: 74.25,
				confidence: null,
				fused_source: "blend",
				alias_flag: true,
				reason_codes: ["low_signal_quality"],
			},
		];
		const bytes = encodeRowsChunk(schema, rows);
		const decoded = decodeChunk(bytes);
		expect(decoded.rowCount).toBe(2);
		expect(decoded.identity.arrowSchemaId).toBe("rppg-metrics@1");
		expect(readTimeUsColumn(decoded.table)).toEqual([1_000_000, 2_000_000]);
		const bpm = readFloat32Column(decoded.table, "bpm");
		expect(bpm[0]).toBeCloseTo(72.5, 4);
		expect(bpm[1]).toBeCloseTo(74.25, 4);
		// Nulls survive: confidence missing on row 2.
		expect(decoded.table.getChild("confidence")?.get(1)).toBeNull();
		expect(decoded.table.getChild("fused_source")?.get(1)).toBe("blend");
		expect(decoded.table.getChild("alias_flag")?.get(1)).toBe(true);
		const reasons = decoded.table.getChild("reason_codes")?.get(1);
		expect(reasons ? Array.from(reasons as Iterable<string>) : []).toEqual([
			"low_signal_quality",
		]);
	});
});

describe("ppg-metrics chunks", () => {
	it("round-trips ints, doubles, and dictionary columns", () => {
		const schema = ppgMetricsSchema({ ...identity, arrowSchemaId: "ppg-metrics@1" });
		const rows = [
			{
				time_us: 500_000,
				bpm: 68,
				rmssd_ms: 42.5,
				sdnn_ms: 55.1,
				mean_nn_ms: 880.2,
				ibi_count: 17,
				window_sample_count: 1024,
				last_sample_timestamp_ms: 1_700_000_123_456.5,
				emitted_at_ms: 1_700_000_123_500,
				source: "ppgRaw",
				channel: "PPG1",
				reason_codes: [],
			},
		];
		const bytes = encodeRowsChunk(schema, rows);
		const decoded = decodeChunk(bytes);
		expect(decoded.rowCount).toBe(1);
		expect(decoded.table.getChild("ibi_count")?.get(0)).toBe(17);
		expect(decoded.table.getChild("source")?.get(0)).toBe("ppgRaw");
		expect(Number(decoded.table.getChild("last_sample_timestamp_ms")?.get(0))).toBeCloseTo(
			1_700_000_123_456.5,
			1,
		);
	});
});
