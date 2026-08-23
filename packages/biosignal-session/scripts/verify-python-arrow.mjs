import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { encodeArrowChunk } from "../dist/arrow.js";

const directory = await mkdtemp(path.join(tmpdir(), "elata-arrow-"));
const file = path.join(directory, "fixture.arrow");
try {
	const stream = {
		streamId: "eeg.raw",
		sourceId: "synthetic",
		name: "EEG",
		modality: "eeg",
		kind: "raw",
		schemaVersion: "interop/v1",
		timing: { kind: "regular", sampleRateHz: 2, clockSource: "local" },
		fields: [
			{ name: "fp1", valueType: "float32" },
			{ name: "quality", valueType: "float64", nullable: true },
		],
	};
	const chunk = await encodeArrowChunk(
		stream,
		{ columns: { fp1: new Float32Array([1.25, 2.5]), quality: [0.9, null] } },
		{ sessionId: "session:python-interop", sequence: 0, startOffsetUs: 0 },
	);
	await writeFile(file, chunk.payload);
	const code = [
		"import pyarrow.ipc as ipc, sys",
		"with open(sys.argv[1], 'rb') as handle: table = ipc.open_stream(handle).read_all()",
		"assert table.column_names == ['fp1', 'quality']",
		"assert table['fp1'].to_pylist() == [1.25, 2.5]",
		"assert table['quality'].to_pylist() == [0.9, None]",
		"print('Python Arrow IPC interop passed')",
	].join("\n");
	const result = spawnSync("python", ["-c", code, file], { encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(
			result.stderr || result.stdout || "Python Arrow check failed",
		);
	process.stdout.write(result.stdout);
} finally {
	await rm(directory, { recursive: true, force: true });
}
