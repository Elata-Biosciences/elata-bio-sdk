#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, "..");

for (const dir of ["dist", "demo/eeg-wasm"]) {
	const full = path.join(pkgDir, dir);
	if (fs.existsSync(full)) {
		fs.rmSync(full, { recursive: true, force: true });
		console.log("Removed:", dir);
	}
}

for (const file of ["tsconfig.tsbuildinfo", "demo/main.js"]) {
	const full = path.join(pkgDir, file);
	if (fs.existsSync(full)) {
		fs.rmSync(full, { force: true });
		console.log("Removed:", file);
	}
}
