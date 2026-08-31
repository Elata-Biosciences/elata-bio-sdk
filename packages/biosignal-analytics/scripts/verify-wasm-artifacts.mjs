// Clone of packages/eeg-web/scripts/verify-wasm.js for this package's
// artifact set (web target in wasm/, nodejs target in wasm/node/).
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
	{ file: "wasm/biosignal_features_wasm.js", minSize: 100 },
	{ file: "wasm/biosignal_features_wasm.d.ts", minSize: 50 },
	{ file: "wasm/biosignal_features_wasm_bg.wasm", minSize: 1024 },
	{ file: "wasm/biosignal_features_wasm_bg.wasm.d.ts", minSize: 50 },
	{ file: "wasm/node/biosignal_features_wasm.js", minSize: 100 },
	{ file: "wasm/node/biosignal_features_wasm_bg.wasm", minSize: 1024 },
];

let failed = false;
for (const { file, minSize } of required) {
	const full = path.join(root, file);
	if (!fs.existsSync(full)) {
		console.error(`WASM verification failed: ${file} not found`);
		failed = true;
		continue;
	}
	const size = fs.statSync(full).size;
	if (size < minSize) {
		console.error(
			`WASM verification failed: ${file} is ${size} bytes (min: ${minSize})`,
		);
		failed = true;
	}
}

if (failed) {
	console.error('\nRun "pnpm run build:wasm" to generate WASM artifacts.');
	process.exit(2);
}
console.log("WASM verification passed: all artifacts present and non-trivial.");
