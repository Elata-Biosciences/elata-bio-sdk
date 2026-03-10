#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, "..");

const dirs = ["dist"];
const files = ["tsconfig.tsbuildinfo"];

for (const dir of dirs) {
	const full = path.join(pkgDir, dir);
	if (fs.existsSync(full)) {
		fs.rmSync(full, { recursive: true, force: true });
		console.log("Removed:", dir);
	}
}
for (const file of files) {
	const full = path.join(pkgDir, file);
	if (fs.existsSync(full)) {
		fs.rmSync(full, { force: true });
		console.log("Removed:", file);
	}
}
