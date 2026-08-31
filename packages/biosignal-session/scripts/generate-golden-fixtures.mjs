#!/usr/bin/env node
/**
 * Generate the golden protocol fixtures shared verbatim with host
 * implementations (the appstore mirrors this file and conformance-tests
 * against it). Deterministic: same package version → same bytes.
 *
 * Run after `pnpm build`: `node ./scripts/generate-golden-fixtures.mjs`
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, "..");
const dist = await import(path.join(pkgDir, "dist", "browser.js"));

const {
	BIOSIGNAL_INIT_MESSAGE_KIND,
	BIOSIGNAL_PROTOCOL_VERSION,
	BIOSIGNAL_LIMITS,
	CLIENT_OPS,
	checksumOf,
	encodeWideF32Chunk,
	encodeRowsChunk,
	rppgMetricsSchema,
} = dist;

const identity = {
	sessionId: "11111111-1111-4111-8111-111111111111",
	streamId: "22222222-2222-4222-8222-222222222222",
	arrowSchemaId: "regular-wide-f32@1",
};

const channels = ["TP9", "AF7", "AF8", "TP10"];
const columns = channels.map((_, ch) => {
	const column = new Float32Array(16);
	for (let i = 0; i < 16; i++) column[i] = ch * 100 + i * 0.25;
	return column;
});
const wideChunk = encodeWideF32Chunk(channels, columns, identity);

const metricsIdentity = { ...identity, arrowSchemaId: "rppg-metrics@1" };
const metricsRows = [
	{
		time_us: 1_000_000,
		bpm: 72.5,
		confidence: 0.9,
		signal_quality: 0.8,
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
const metricsChunk = encodeRowsChunk(
	rppgMetricsSchema(metricsIdentity),
	metricsRows,
);

const toBase64 = (bytes) => Buffer.from(bytes).toString("base64");

const fixture = {
	fixtureVersion: 1,
	generator: "@elata-biosciences/biosignal-session@0.1.0",
	protocol: {
		version: BIOSIGNAL_PROTOCOL_VERSION,
		initMessageKind: BIOSIGNAL_INIT_MESSAGE_KIND,
		clientOps: CLIENT_OPS,
		limits: BIOSIGNAL_LIMITS,
		initMessage: {
			kind: BIOSIGNAL_INIT_MESSAGE_KIND,
			v: BIOSIGNAL_PROTOCOL_VERSION,
		},
		sampleMessages: {
			ping: { v: 1, id: "req-1", op: "ping" },
			okResponse: { v: 1, id: "req-1", ok: true },
			errorResponse: {
				v: 1,
				id: "req-2",
				ok: false,
				error: "sequence_conflict",
				retryable: false,
			},
			notice: { v: 1, kind: "host/notice", notice: "quota-warning" },
		},
		nameVectors: {
			valid: ["round_started", "app.neurochess.round-1", "a"],
			invalid: ["Round", "9lives", "", "has space", `a${"b".repeat(64)}`],
		},
	},
	checksum: {
		algo: "crc32c",
		vectors: [
			{ input: "utf8:123456789", hex: "e3069283" },
			{ input: "zeros:32", hex: "8a9136aa" },
			{ input: "ones:32", hex: "62a8ab43" },
			{ input: "ascending:32", hex: "46dd794e" },
		],
	},
	chunks: {
		wideF32: {
			identity,
			channels,
			rows: 16,
			columnFormula: "value[ch][i] = ch * 100 + i * 0.25",
			byteLength: wideChunk.byteLength,
			checksum: checksumOf(wideChunk).value,
			base64: toBase64(wideChunk),
		},
		rppgMetrics: {
			identity: metricsIdentity,
			rows: metricsRows,
			byteLength: metricsChunk.byteLength,
			checksum: checksumOf(metricsChunk).value,
			base64: toBase64(metricsChunk),
		},
	},
};

const outPath = path.join(pkgDir, "fixtures", "biosignal-protocol-v1.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(fixture, null, "\t")}\n`);
console.log("Wrote", outPath, `(${fs.statSync(outPath).size} bytes)`);
