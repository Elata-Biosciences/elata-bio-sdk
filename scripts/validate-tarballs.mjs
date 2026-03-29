#!/usr/bin/env node

/**
 * Validates pnpm pack --dry-run --json output for published packages.
 * Ensures tarballs contain expected files and no test/dev artifacts leak.
 *
 * Usage: node scripts/validate-tarballs.mjs
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const packages = [
	{
		name: "@elata-biosciences/rppg-web",
		aliases: ["rppg-web", "packages/rppg-web"],
		dir: "packages/rppg-web",
		requiredFiles: [
			"dist/index.js",
			"dist/index.d.ts",
			"pkg/rppg_wasm.js",
			"pkg/rppg_wasm.d.ts",
			"pkg/rppg_wasm_bg.wasm",
			"pkg/rppg_wasm_bg.wasm.d.ts",
			"README.md",
			"package.json",
		],
		forbiddenPatterns: [
			"__tests__",
			".test.ts",
			".test.js",
			"node_modules/",
			"tsconfig",
			"jest.config",
			"coverage/",
			"demo/",
			"scripts/",
			"pkg/.gitkeep",
		],
	},
	{
		name: "@elata-biosciences/eeg-web",
		aliases: ["eeg-web", "packages/eeg-web"],
		dir: "packages/eeg-web",
		requiredFiles: [
			"dist/index.js",
			"dist/index.d.ts",
			"README.md",
			"package.json",
			"wasm/eeg_wasm.js",
			"wasm/eeg_wasm.d.ts",
			"wasm/eeg_wasm_bg.wasm",
			"wasm/eeg_wasm_bg.wasm.d.ts",
		],
		forbiddenPatterns: [
			"__tests__",
			".test.ts",
			".test.js",
			"node_modules/",
			"tsconfig",
			"jest.config",
			"coverage/",
			"wasm/.gitkeep",
		],
	},
	{
		name: "@elata-biosciences/eeg-web-ble",
		aliases: ["eeg-web-ble", "packages/eeg-web-ble", "ble"],
		dir: "packages/eeg-web-ble",
		requiredFiles: [
			"dist/index.js",
			"dist/index.d.ts",
			"README.md",
			"package.json",
		],
		forbiddenPatterns: [
			"__tests__",
			".test.ts",
			".test.js",
			"node_modules/",
			"tsconfig",
			"jest.config",
			"coverage/",
			"scripts/",
			],
	},
	{
		name: "@elata-biosciences/create-elata-demo",
		aliases: ["create-elata-demo", "packages/create-elata-demo"],
		dir: "packages/create-elata-demo",
		allowTypeScriptSources: true,
		requiredFiles: [
			"index.mjs",
			"package.json",
			"templates/rppg-demo/package.json",
			"templates/eeg-demo/package.json",
		],
		forbiddenPatterns: [
			"node_modules/",
			"index.test.mjs",
			"coverage/",
		],
	},
];

const requested = process.argv.slice(2);
const normalizedRequested = new Set(requested.map((entry) => entry.trim()).filter(Boolean));

const selectedPackages =
	normalizedRequested.size === 0
		? packages
		: packages.filter((pkg) => {
				const aliases = new Set([pkg.name, pkg.dir, ...(pkg.aliases ?? [])]);
				for (const entry of normalizedRequested) {
					if (aliases.has(entry)) {
						return true;
					}
				}
				return false;
			});

if (normalizedRequested.size > 0 && selectedPackages.length !== normalizedRequested.size) {
	const known = new Set(
		packages.flatMap((pkg) => [pkg.name, pkg.dir, ...(pkg.aliases ?? [])]),
	);
	for (const entry of normalizedRequested) {
		if (!known.has(entry)) {
			console.error(`Unknown tarball validation target: ${entry}`);
		}
	}
	process.exit(1);
}

let totalErrors = 0;

for (const pkg of selectedPackages) {
	const pkgDir = path.join(root, pkg.dir);
	console.log(`\n--- Validating ${pkg.name} ---`);

	let output;
	try {
		output = execSync("pnpm pack --dry-run --json", {
			cwd: pkgDir,
			encoding: "utf-8",
		});
	} catch (err) {
		console.error(`  FAIL: pnpm pack --dry-run --json failed for ${pkg.name}`);
		console.error(`  ${err.message || err}`);
		totalErrors++;
		continue;
	}

	const jsonStart = output.lastIndexOf("\n{");
	const jsonText = (
		jsonStart >= 0 ? output.slice(jsonStart + 1) : output
	).trim();
	const packJson = JSON.parse(jsonText);
	const fileLines = Array.isArray(packJson.files)
		? packJson.files.map((file) => file.path)
		: [];

	let pkgErrors = 0;

	// Check required files
	for (const required of pkg.requiredFiles) {
		const found = fileLines.some(
			(f) => f === required || f.endsWith("/" + required),
		);
		if (!found) {
			console.error(`  MISSING: ${required}`);
			pkgErrors++;
		}
	}

	// Check forbidden patterns
	for (const file of fileLines) {
		for (const pattern of pkg.forbiddenPatterns) {
			if (file.includes(pattern)) {
				console.error(
					`  LEAKED: ${file} (matches forbidden pattern "${pattern}")`,
				);
				pkgErrors++;
			}
		}
	}

	// Check no .ts source files leaked (only .d.ts and .js should be present)
	for (const file of fileLines) {
		if (
			!pkg.allowTypeScriptSources &&
			file.endsWith(".ts") &&
			!file.endsWith(".d.ts")
		) {
			console.error(`  LEAKED: ${file} (TypeScript source file in tarball)`);
			pkgErrors++;
		}
	}

	if (pkgErrors === 0) {
		console.log(`  OK: ${fileLines.length} files, all checks passed`);
	} else {
		console.error(`  ${pkgErrors} error(s) found`);
	}

	totalErrors += pkgErrors;
}

console.log("");
if (totalErrors > 0) {
	console.error(`Tarball validation failed with ${totalErrors} error(s).`);
	process.exit(1);
} else {
	console.log("All tarball validations passed.");
}
