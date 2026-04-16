#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const packageRoot = process.cwd();
const distIndex = path.join(packageRoot, "dist", "index.js");

assert.ok(
	fs.existsSync(distIndex),
	"dist/index.js must exist before ESM verification",
);

const source = fs.readFileSync(distIndex, "utf8");
assert.match(source, /\.\/ppgProcessor\.js"/);
assert.match(source, /\.\/ppgSession\.js"/);
assert.match(source, /createMusePpgSession/);
assert.match(source, /PpgProcessor/);

console.log("[ppg-web] Verified Node-friendly ESM dist exports.");
