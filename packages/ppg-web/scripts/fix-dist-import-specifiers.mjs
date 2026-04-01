#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const distDir = path.join(packageRoot, "dist");

const FILE_EXTENSIONS = new Set([".js", ".d.ts"]);
const SPECIFIER_PATTERN =
	/((?:import|export)\s[^'"]*?from\s*|import\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g;

function rewriteSpecifiers(contents) {
	return contents.replace(SPECIFIER_PATTERN, (match, prefix, specifier) => {
		if (path.extname(specifier)) return match;
		return `${prefix}"${specifier}.js"`;
	});
}

function rewriteFile(filePath) {
	const original = fs.readFileSync(filePath, "utf8");
	const rewritten = rewriteSpecifiers(original);
	if (rewritten !== original) {
		fs.writeFileSync(filePath, rewritten, "utf8");
	}
}

function walk(dirPath) {
	for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
		const entryPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			walk(entryPath);
			continue;
		}
		const matchedExt = Array.from(FILE_EXTENSIONS).find((ext) =>
			entry.name.endsWith(ext),
		);
		if (matchedExt) rewriteFile(entryPath);
	}
}

if (!fs.existsSync(distDir)) {
	console.error(`[ppg-web] dist directory not found: ${distDir}`);
	process.exit(1);
}

walk(distDir);
console.log("[ppg-web] Rewrote dist relative import specifiers for Node ESM.");
