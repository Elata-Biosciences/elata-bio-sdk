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

function shouldAppendJs(specifier) {
	const ext = path.extname(specifier);
	return !ext;
}

function rewriteSpecifiers(contents) {
	return contents.replace(SPECIFIER_PATTERN, (match, prefix, specifier) => {
		if (!shouldAppendJs(specifier)) return match;
		const rewritten = `${specifier}.js`;
		return `${prefix}"${rewritten}"`;
	});
}

function rewriteFile(filePath) {
	const original = fs.readFileSync(filePath, "utf8");
	const rewritten = rewriteSpecifiers(original);
	if (rewritten !== original) {
		fs.writeFileSync(filePath, rewritten);
	}
}

function walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full);
			continue;
		}
		const ext = path.extname(entry.name);
		const isDts = entry.name.endsWith(".d.ts");
		if (FILE_EXTENSIONS.has(ext) || isDts) {
			rewriteFile(full);
		}
	}
}

if (!fs.existsSync(distDir)) {
	console.error("dist directory not found:", distDir);
	process.exit(1);
}

walk(distDir);
