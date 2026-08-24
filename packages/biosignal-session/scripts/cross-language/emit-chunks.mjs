#!/usr/bin/env node
/**
 * Emit one chunk per Arrow schema into a directory, plus a manifest of what
 * each chunk should contain. The Python side (`verify_chunks.py`) reads them
 * with pyarrow and checks the values independently — proving the chunks are
 * real Arrow IPC files rather than something only our JS decoder understands.
 *
 * Usage: node scripts/cross-language/emit-chunks.mjs <outDir>
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..", "..");
const dist = await import(path.join(packageRoot, "dist", "browser.js"));

const {
	checksumOf,
	encodeRowsChunk,
	encodeWideF32Chunk,
	ppgMetricsSchema,
	rppgMetricsSchema,
	rppgTraceSchema,
	batterySchema,
} = dist;

const outDir = path.resolve(
	process.argv[2] ?? path.join(packageRoot, ".cross-language"),
);
fs.mkdirSync(outDir, { recursive: true });

const sessionId = "11111111-1111-4111-8111-111111111111";
const streamId = "22222222-2222-4222-8222-222222222222";
const identity = (arrowSchemaId) => ({ sessionId, streamId, arrowSchemaId });

const cases = [];

// 1. Wide EEG: 4 channels x 512 rows, exact float32 values from a formula.
{
	const channels = ["TP9", "AF7", "AF8", "TP10"];
	const rows = 512;
	const columns = channels.map((_, ch) => {
		const column = new Float32Array(rows);
		for (let i = 0; i < rows; i++) column[i] = ch * 1000 + i * 0.25;
		return column;
	});
	const bytes = encodeWideF32Chunk(
		channels,
		columns,
		identity("regular-wide-f32@1"),
	);
	fs.writeFileSync(path.join(outDir, "eeg-wide.arrow"), bytes);
	cases.push({
		file: "eeg-wide.arrow",
		arrowSchemaId: "regular-wide-f32@1",
		columns: channels,
		rows,
		checksum: checksumOf(bytes).value,
		valueFormula: "value[ch][i] = ch * 1000 + i * 0.25",
		hasTimeColumn: false,
	});
}

// 2. rPPG trace: irregular stream with an explicit int64 time column.
{
	const rows = [];
	for (let i = 0; i < 64; i++) {
		rows.push({
			time_us: i * 33_333,
			value: Math.sin(i / 8),
			raw: i % 7 === 0 ? null : i,
		});
	}
	const bytes = encodeRowsChunk(
		rppgTraceSchema(identity("rppg-trace@1")),
		rows,
	);
	fs.writeFileSync(path.join(outDir, "rppg-trace.arrow"), bytes);
	cases.push({
		file: "rppg-trace.arrow",
		arrowSchemaId: "rppg-trace@1",
		columns: ["time_us", "value", "raw"],
		rows: rows.length,
		checksum: checksumOf(bytes).value,
		timeUsStepUs: 33_333,
		nullEvery: 7,
		hasTimeColumn: true,
	});
}

// 3. rPPG metrics: the mixed-type surface (float/bool/dictionary/list + nulls).
{
	const rows = [
		{
			time_us: 1_000_000,
			bpm: 72.5,
			confidence: 0.9,
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
			fused_source: "blend",
			alias_flag: true,
			reason_codes: ["low_signal_quality"],
		},
	];
	const bytes = encodeRowsChunk(
		rppgMetricsSchema(identity("rppg-metrics@1")),
		rows,
	);
	fs.writeFileSync(path.join(outDir, "rppg-metrics.arrow"), bytes);
	cases.push({
		file: "rppg-metrics.arrow",
		arrowSchemaId: "rppg-metrics@1",
		rows: rows.length,
		checksum: checksumOf(bytes).value,
		expect: {
			bpm: [72.5, 74.25],
			fused_source: ["camera", "blend"],
			alias_flag: [false, true],
			confidence_row1_is_null: true,
			reason_codes_row1: ["low_signal_quality"],
		},
		hasTimeColumn: true,
	});
}

// 4. ppg metrics: int32 + float64 + dictionary columns.
{
	const rows = [
		{
			time_us: 500_000,
			bpm: 68,
			rmssd_ms: 42.5,
			ibi_count: 17,
			window_sample_count: 1024,
			last_sample_timestamp_ms: 1_700_000_123_456.5,
			source: "ppgRaw",
			channel: "PPG1",
			reason_codes: [],
		},
	];
	const bytes = encodeRowsChunk(
		ppgMetricsSchema(identity("ppg-metrics@1")),
		rows,
	);
	fs.writeFileSync(path.join(outDir, "ppg-metrics.arrow"), bytes);
	cases.push({
		file: "ppg-metrics.arrow",
		arrowSchemaId: "ppg-metrics@1",
		rows: rows.length,
		checksum: checksumOf(bytes).value,
		expect: {
			ibi_count: [17],
			source: ["ppgRaw"],
			last_sample_timestamp_ms: [1_700_000_123_456.5],
		},
		hasTimeColumn: true,
	});
}

// 5. battery: the small irregular schema.
{
	const rows = [
		{ time_us: 0, battery_pct: 100 },
		{ time_us: 60_000_000, battery_pct: 97.5 },
	];
	const bytes = encodeRowsChunk(batterySchema(identity("battery@1")), rows);
	fs.writeFileSync(path.join(outDir, "battery.arrow"), bytes);
	cases.push({
		file: "battery.arrow",
		arrowSchemaId: "battery@1",
		rows: rows.length,
		checksum: checksumOf(bytes).value,
		expect: { battery_pct: [100, 97.5] },
		hasTimeColumn: true,
	});
}

const manifest = {
	generator: "@elata-biosciences/biosignal-session cross-language emitter",
	sessionId,
	streamId,
	metadataKeys: {
		sessionId: "elata:sessionId",
		streamId: "elata:streamId",
		arrowSchemaId: "elata:arrowSchemaId",
	},
	cases,
};
fs.writeFileSync(
	path.join(outDir, "manifest.json"),
	`${JSON.stringify(manifest, null, "\t")}\n`,
);
console.log(`wrote ${cases.length} chunks + manifest.json to ${outDir}`);
