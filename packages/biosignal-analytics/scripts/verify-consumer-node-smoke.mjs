// Node ESM smoke: exercises the exact production init path —
// initAnalyticsWasm(fs.readFileSync(<wasm binary>)) — against the built dist
// and web-target glue, then runs one analyze_window call.
// (Mirrors packages/eeg-web's consumer-node-smoke precedent.)
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");

const distRuntime = path.join(packageRoot, "dist", "runtime.js");
const wasmBinary = path.join(
	packageRoot,
	"wasm",
	"biosignal_features_wasm_bg.wasm",
);
assert.ok(fs.existsSync(distRuntime), "dist/runtime.js missing — run build");
assert.ok(fs.existsSync(wasmBinary), "wasm binary missing — run build:wasm");

const runtime = await import(distRuntime);
await runtime.initAnalyticsWasm(fs.readFileSync(wasmBinary));
const analyzer = runtime.createEegWindowAnalyzerRaw(256, 1, undefined);

const n = 1024;
const samples = new Float32Array(n);
for (let i = 0; i < n; i++) {
	samples[i] = 20 * Math.sin((2 * Math.PI * 10 * i) / 256);
}
const result = JSON.parse(analyzer.analyze_window(samples));
assert.equal(result.schema, "elata.eeg-window-features/v1");
assert.ok(result.bandPowersRel[0].alpha > 0.9, "alpha should dominate");
assert.equal(typeof analyzer.config_id(), "string");
analyzer.free();

console.log("consumer node smoke passed: initAnalyticsWasm + analyze_window");
