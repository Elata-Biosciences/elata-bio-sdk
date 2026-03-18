#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const packageRoot = process.cwd();
const distIndex = path.join(packageRoot, "dist", "index.js");

assert.ok(fs.existsSync(distIndex), "dist/index.js must exist before ESM verification");

const source = fs.readFileSync(distIndex, "utf8");
assert.match(
	source,
	/\.\/rppgProcessor\.js"/,
	"dist/index.js should use explicit .js specifiers",
);

const mod = await import(pathToFileURL(distIndex).href);
assert.equal(typeof mod.createRppgSession, "function");
assert.equal(typeof mod.RppgProcessor, "function");

console.log("[rppg-web] Verified Node-friendly ESM dist imports.");
