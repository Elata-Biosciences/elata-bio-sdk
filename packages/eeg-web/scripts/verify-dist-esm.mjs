#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const packageRoot = process.cwd();
const distIndex = path.join(packageRoot, "dist", "index.js");

assert.ok(
	fs.existsSync(distIndex),
	"dist/index.js must exist before ESM verification",
);

const source = fs.readFileSync(distIndex, "utf8");
assert.match(
	source,
	/\.\/headband\.js"/,
	"dist/index.js should re-export headband using explicit .js specifiers",
);
assert.match(
	source,
	/\.\/errors\.js"/,
	"dist/index.js should re-export errors using explicit .js specifiers",
);

const mod = await import(pathToFileURL(distIndex).href);
assert.equal(typeof mod.initEegWasm, "function");
assert.equal(typeof mod.initEegWasmSync, "function");

console.log("[eeg-web] Verified Node-friendly ESM dist imports.");

