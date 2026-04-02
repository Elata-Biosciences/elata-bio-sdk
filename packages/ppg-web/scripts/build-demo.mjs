#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const esbuild = await import("esbuild");
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const eegWasmSourceDir = path.resolve(packageRoot, "..", "eeg-web", "wasm");
const eegWasmDemoDir = path.join(packageRoot, "demo", "eeg-wasm");

function copyEegWasmIfPresent() {
	const requiredFiles = [
		"eeg_wasm.js",
		"eeg_wasm.d.ts",
		"eeg_wasm_bg.wasm",
		"eeg_wasm_bg.wasm.d.ts",
	];
	if (!requiredFiles.every((file) => fs.existsSync(path.join(eegWasmSourceDir, file)))) {
		console.warn(
			"[ppg-web] EEG WASM artifacts not found in packages/eeg-web/wasm; " +
				"Athena decoding will be unavailable in the demo until EEG artifacts are built.",
		);
		return;
	}
	fs.mkdirSync(eegWasmDemoDir, { recursive: true });
	for (const file of requiredFiles) {
		fs.copyFileSync(
			path.join(eegWasmSourceDir, file),
			path.join(eegWasmDemoDir, file),
		);
	}
	console.log("[ppg-web] Copied EEG WASM artifacts -> demo/eeg-wasm");
}

copyEegWasmIfPresent();

await esbuild.build({
	absWorkingDir: packageRoot,
	entryPoints: ["demo/main.ts"],
	bundle: true,
	format: "esm",
	outdir: "demo",
	entryNames: "[name]",
	alias: {
		"@elata-biosciences/eeg-web": path.join(packageRoot, "demo/shims/eeg-web.ts"),
		"@elata-biosciences/eeg-web-ble": path.join(
			packageRoot,
			"demo/shims/eeg-web-ble.ts",
		),
		"@elata-biosciences/rppg-web": path.join(
			packageRoot,
			"demo/shims/rppg-web.ts",
		),
	},
	sourcemap: false,
});

console.log("[ppg-web] Bundled demo/main.ts -> demo/main.js");
