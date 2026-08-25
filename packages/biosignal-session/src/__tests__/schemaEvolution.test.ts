/**
 * Schema durability: a chunk written today must still be readable by the
 * code that exists in a year, and a chunk written by that later code must
 * still give today's reader everything it knows about.
 *
 * "Independently decodable" is easy to satisfy on the day a format ships and
 * easy to lose afterwards. These are the two directions that make the claim
 * mean something over time:
 *
 *   backward — an old chunk read against a newer schema: the columns it
 *   carries read correctly, the columns added since read as null (never as
 *   zero, which for a metric column is a different, plausible, wrong answer);
 *
 *   forward — a newer chunk read against today's schema: the known columns
 *   read correctly, the unknown ones are skipped by the reader and still
 *   present in the file, so nothing is lost by reading it early.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Field, Float32, Int32, Schema, Utf8 } from "apache-arrow";
import {
	decodeChunk,
	diffChunkColumns,
	readFloat32Column,
	readOptionalColumn,
	readRowsAgainstSchema,
	readTimeUsColumn,
} from "../arrow/decode";
import { encodeRowsChunk, encodeWideF32Chunk } from "../arrow/encode";
import type { ChunkIdentity } from "../arrow/schemas";
import {
	ppgMetricsSchema,
	regularWideF32Schema,
	rppgMetricsSchema,
} from "../arrow/schemas";
import { createRecorderHarness } from "../testing/recorderHarness";

const IDENTITY: ChunkIdentity = {
	sessionId: "11111111-1111-4111-8111-111111111111",
	streamId: "22222222-2222-4222-8222-222222222222",
	arrowSchemaId: "ppg-metrics@1",
};

/** Tomorrow's schema: today's columns plus nullable additions. */
function extended(schema: Schema, extra: readonly Field[]): Schema {
	return new Schema([...schema.fields, ...extra], schema.metadata);
}

const TODAY = ppgMetricsSchema(IDENTITY);
const TOMORROW = extended(TODAY, [
	new Field("perfusion_index", new Float32(), true),
	new Field("sensor_placement", new Utf8(), true),
	new Field("artifact_count", new Int32(), true),
]);

const ROWS = [
	{
		time_us: 1_000_000,
		bpm: 66.5,
		rmssd_ms: 38.25,
		confidence: 0.84,
		signal_quality: 0.79,
		ibi_count: 17,
		last_sample_timestamp_ms: 64_229.5,
		source: "ppgRaw",
		reason_codes: ["low_signal_quality"],
	},
	{
		time_us: 2_000_000,
		bpm: 0,
		rmssd_ms: null,
		confidence: 0.12,
		signal_quality: 0.2,
		ibi_count: 0,
		last_sample_timestamp_ms: 80_231.25,
		source: "optics",
		reason_codes: [],
	},
];

const TOMORROW_ROWS = ROWS.map((row, index) => ({
	...row,
	perfusion_index: 1.25 + index,
	sensor_placement: index === 0 ? "left-temple" : "right-temple",
	artifact_count: index * 3,
}));

describe("an old chunk read against a newer schema", () => {
	const chunk = encodeRowsChunk(TODAY, ROWS);
	const decoded = decodeChunk(chunk);

	it("still identifies itself without any external schema", () => {
		expect(decoded.identity).toEqual({
			sessionId: IDENTITY.sessionId,
			streamId: IDENTITY.streamId,
			arrowSchemaId: "ppg-metrics@1",
		});
		expect(decoded.rowCount).toBe(ROWS.length);
	});

	it("reports exactly which columns the reader has that the chunk lacks", () => {
		expect(diffChunkColumns(decoded.table, TOMORROW)).toEqual({
			missing: ["perfusion_index", "sensor_placement", "artifact_count"],
			extra: [],
		});
	});

	it("reads every original column correctly and the new ones as null", () => {
		const rows = readRowsAgainstSchema(decoded.table, TOMORROW);
		expect(rows).toHaveLength(ROWS.length);

		expect(rows[0].time_us).toBe(1_000_000n);
		expect(rows[0].bpm).toBeCloseTo(66.5, 4);
		expect(rows[0].rmssd_ms).toBeCloseTo(38.25, 4);
		expect(rows[0].ibi_count).toBe(17);
		expect(rows[0].source).toBe("ppgRaw");
		expect(rows[0].reason_codes).toEqual(["low_signal_quality"]);
		expect(rows[0].last_sample_timestamp_ms).toBe(64_229.5);

		for (const row of rows) {
			expect(row.perfusion_index).toBeNull();
			expect(row.sensor_placement).toBeNull();
			expect(row.artifact_count).toBeNull();
		}
	});

	it("keeps a real null distinguishable from a real zero", () => {
		const rows = readRowsAgainstSchema(decoded.table, TOMORROW);
		// Row 1 genuinely recorded bpm 0 and no RMSSD; the column added later
		// is absent. All three must read differently.
		expect(rows[1].bpm).toBe(0);
		expect(rows[1].rmssd_ms).toBeNull();
		expect(rows[1].perfusion_index).toBeNull();
		expect(readOptionalColumn(decoded.table, "rmssd_ms")).not.toBeNull();
		expect(readOptionalColumn(decoded.table, "perfusion_index")).toBeNull();
	});

	it("leaves the existing typed readers working unchanged", () => {
		expect(readTimeUsColumn(decoded.table)).toEqual([1_000_000, 2_000_000]);
		expect(Array.from(readFloat32Column(decoded.table, "bpm"))).toEqual([
			Math.fround(66.5),
			0,
		]);
	});
});

describe("a newer chunk read against today's schema", () => {
	const chunk = encodeRowsChunk(TOMORROW, TOMORROW_ROWS);
	const decoded = decodeChunk(chunk);

	it("reports exactly which columns the chunk has that the reader lacks", () => {
		expect(diffChunkColumns(decoded.table, TODAY)).toEqual({
			missing: [],
			extra: ["perfusion_index", "sensor_placement", "artifact_count"],
		});
	});

	it("yields every column today's reader knows, with the right values", () => {
		const rows = readRowsAgainstSchema(decoded.table, TODAY);
		expect(Object.keys(rows[0]).sort()).toEqual(
			TODAY.fields.map((field) => field.name).sort(),
		);
		expect(rows[0].bpm).toBeCloseTo(66.5, 4);
		expect(rows[1].source).toBe("optics");
		expect(rows[1].reason_codes).toEqual([]);
		expect(readTimeUsColumn(decoded.table)).toEqual([1_000_000, 2_000_000]);
	});

	it("does not destroy the columns it skipped — they stay in the file", () => {
		expect(readOptionalColumn(decoded.table, "perfusion_index")?.get(1)).toBeCloseTo(
			2.25,
			4,
		);
		expect(readOptionalColumn(decoded.table, "sensor_placement")?.get(0)).toBe(
			"left-temple",
		);
		expect(decoded.columnNames).toEqual(
			TOMORROW.fields.map((field) => field.name),
		);
	});

	it("decodes even when the chunk claims a schema id this build never heard of", () => {
		const future = encodeRowsChunk(
			extended(
				new Schema(TOMORROW.fields, new Map([["elata:arrowSchemaId", "ppg-metrics@7"]])),
				[],
			),
			TOMORROW_ROWS,
		);
		const futureDecoded = decodeChunk(future);
		expect(futureDecoded.identity.arrowSchemaId).toBe("ppg-metrics@7");
		expect(readRowsAgainstSchema(futureDecoded.table, TODAY)[0].bpm).toBeCloseTo(
			66.5,
			4,
		);
	});
});

describe("a wide signal stream that gains a channel", () => {
	const FOUR = ["TP9", "AF7", "AF8", "TP10"];
	const FIVE = [...FOUR, "AUX"];
	const columns = FOUR.map((_name, channel) =>
		Float32Array.from([channel, channel + 0.5, channel + 1]),
	);
	const wideIdentity: ChunkIdentity = {
		...IDENTITY,
		arrowSchemaId: "regular-wide-f32@1",
	};

	it("reads a four-channel chunk against a five-channel schema", () => {
		const decoded = decodeChunk(
			encodeWideF32Chunk(FOUR, columns, wideIdentity),
		);
		const five = regularWideF32Schema(FIVE, wideIdentity);
		expect(diffChunkColumns(decoded.table, five)).toEqual({
			missing: ["AUX"],
			extra: [],
		});
		const rows = readRowsAgainstSchema(decoded.table, five);
		expect(rows.map((row) => row.TP10)).toEqual([3, 3.5, 4]);
		expect(rows.every((row) => row.AUX === null)).toBe(true);
	});

	it("reads a five-channel chunk against a four-channel schema", () => {
		const decoded = decodeChunk(
			encodeWideF32Chunk(
				FIVE,
				[...columns, Float32Array.from([9, 9.5, 10])],
				wideIdentity,
			),
		);
		expect(diffChunkColumns(decoded.table, regularWideF32Schema(FOUR, wideIdentity))).toEqual(
			{ missing: [], extra: ["AUX"] },
		);
		const rows = readRowsAgainstSchema(
			decoded.table,
			regularWideF32Schema(FOUR, wideIdentity),
		);
		expect(Object.keys(rows[0])).toEqual(FOUR);
		expect(rows.map((row) => row.TP9)).toEqual([0, 0.5, 1]);
		// The dropped channel is still recoverable from the same bytes.
		expect(Array.from(readFloat32Column(decoded.table, "AUX"))).toEqual([
			9, 9.5, 10,
		]);
	});
});

describe("chunks that were already written, read by later code", () => {
	/**
	 * The golden fixture holds chunk bytes produced by an earlier build and
	 * shared verbatim with host implementations. Nothing regenerates them as
	 * part of a test run, so they are the closest thing here to a file found
	 * on a user's disk a year from now.
	 */
	const fixture = JSON.parse(
		fs.readFileSync(
			path.resolve(__dirname, "..", "..", "fixtures", "biosignal-protocol-v1.json"),
			"utf8",
		),
	) as {
		chunks: {
			wideF32: { channels: string[]; rows: number; base64: string };
			rppgMetrics: {
				identity: ChunkIdentity;
				rows: Record<string, unknown>[];
				base64: string;
			};
		};
	};

	const fromBase64 = (base64: string): Uint8Array =>
		new Uint8Array(Buffer.from(base64, "base64"));

	it("reads the archived rppg chunk against a schema that has moved on", () => {
		const stored = decodeChunk(fromBase64(fixture.chunks.rppgMetrics.base64));
		const later = extended(
			rppgMetricsSchema(fixture.chunks.rppgMetrics.identity),
			[new Field("perfusion_index", new Float32(), true)],
		);
		expect(diffChunkColumns(stored.table, later)).toEqual({
			missing: ["perfusion_index"],
			extra: [],
		});
		const rows = readRowsAgainstSchema(stored.table, later);
		const expectedRows = fixture.chunks.rppgMetrics.rows;
		expect(rows).toHaveLength(expectedRows.length);
		expect(rows[0].bpm).toBeCloseTo(Number(expectedRows[0].bpm), 4);
		expect(rows[0].time_us).toBe(BigInt(Number(expectedRows[0].time_us)));
		expect(rows.every((row) => row.perfusion_index === null)).toBe(true);
	});

	it("reads the archived wide chunk against a schema with an extra channel", () => {
		const stored = decodeChunk(fromBase64(fixture.chunks.wideF32.base64));
		const identity: ChunkIdentity = {
			...IDENTITY,
			arrowSchemaId: "regular-wide-f32@1",
		};
		const later = regularWideF32Schema(
			[...fixture.chunks.wideF32.channels, "AUX"],
			identity,
		);
		const rows = readRowsAgainstSchema(stored.table, later);
		expect(rows).toHaveLength(fixture.chunks.wideF32.rows);
		// The fixture documents its own contents: value[ch][i] = ch*100 + i*0.25.
		fixture.chunks.wideF32.channels.forEach((name, channel) => {
			expect(rows.map((row) => row[name])).toEqual(
				rows.map((_row, index) => channel * 100 + index * 0.25),
			);
		});
		expect(rows.every((row) => row.AUX === null)).toBe(true);
	});

	it("reads a chunk that went through the real recorder and host", async () => {
		const h = createRecorderHarness();
		await h.start();
		const handle = h.sink.openStream({
			sourceId: "harness",
			modality: "ppg-metrics",
			sampling: "irregular",
			channels: [],
			encoding: "arrow-ipc",
			arrowSchemaId: "ppg-metrics@1",
			layout: "wide",
			clockSource: "derived",
		});
		await h.settle();
		for (const row of ROWS) handle.pushMetricRow(Number(row.time_us), row);
		h.core.handle({ t: "flush" });
		await h.settle();

		const streamId = h.eventsOf("stream-open")[0].streamId;
		const committed = h.host.chunksForStream(streamId);
		expect(committed).toHaveLength(1);
		const stored = decodeChunk(committed[0].payload as Uint8Array);
		expect(diffChunkColumns(stored.table, TOMORROW).missing).toEqual([
			"perfusion_index",
			"sensor_placement",
			"artifact_count",
		]);
		const rows = readRowsAgainstSchema(stored.table, TOMORROW);
		expect(rows[0].bpm).toBeCloseTo(66.5, 4);
		expect(rows[0].reason_codes).toEqual(["low_signal_quality"]);
		expect(rows[1].perfusion_index).toBeNull();
	});
});
