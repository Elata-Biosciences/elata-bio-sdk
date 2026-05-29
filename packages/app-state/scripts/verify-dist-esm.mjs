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

const indexSource = fs.readFileSync(distIndex, "utf8");
assert.match(
	indexSource,
	/\.\/client\.js"/,
	"dist/index.js should re-export client using explicit .js specifier",
);

console.log("dist ESM specifiers OK");
