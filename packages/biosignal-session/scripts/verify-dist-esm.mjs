#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const packageRoot = process.cwd();
const entries = ["index.js", "browser.js", "testing.js"];

for (const entry of entries) {
	const full = path.join(packageRoot, "dist", entry);
	assert.ok(
		fs.existsSync(full),
		`dist/${entry} must exist before ESM verification`,
	);
	const source = fs.readFileSync(full, "utf8");
	const relativeSpecifiers = source.match(/from\s+"(\.{1,2}\/[^"]+)"/g) ?? [];
	for (const spec of relativeSpecifiers) {
		assert.match(
			spec,
			/\.js"$/,
			`dist/${entry} has a relative import without an explicit .js extension: ${spec}`,
		);
	}
}

console.log("dist ESM verification passed");
