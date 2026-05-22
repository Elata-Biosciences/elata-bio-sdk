#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const packageRoot = process.cwd();
const distIndex = path.join(packageRoot, "dist", "index.js");
const distHost = path.join(packageRoot, "dist", "host.js");

assert.ok(
	fs.existsSync(distIndex),
	"dist/index.js must exist before ESM verification",
);
assert.ok(
	fs.existsSync(distHost),
	"dist/host.js must exist before ESM verification",
);

const indexSource = fs.readFileSync(distIndex, "utf8");
assert.match(
	indexSource,
	/\.\/client\.js"/,
	"dist/index.js should re-export client using explicit .js specifier",
);

const hostSource = fs.readFileSync(distHost, "utf8");
assert.match(
	hostSource,
	/\.\/protocol\.js"/,
	"dist/host.js should reference protocol using explicit .js specifier",
);

console.log("dist ESM specifiers OK");
