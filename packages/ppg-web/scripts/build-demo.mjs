#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";

const esbuild = await import("esbuild");
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
