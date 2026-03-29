#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(tmpdir(), "eeg-web-consumer-node-"));
const npmCacheDir = path.join(tempRoot, "npm-cache");

fs.mkdirSync(npmCacheDir, { recursive: true });

function run(cmd, args, cwd, capture = false, envOverride) {
	const env = envOverride ? { ...process.env, ...envOverride } : process.env;
	const result = spawnSync(cmd, args, {
		cwd,
		encoding: "utf8",
		stdio: capture ? "pipe" : "inherit",
		env,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		const details = capture
			? `\n${result.stdout ?? ""}\n${result.stderr ?? ""}`
			: "";
		throw new Error(
			`Command failed (${result.status}): ${cmd} ${args.join(" ")}${details}`,
		);
	}
	return result.stdout ?? "";
}

function packPackage() {
	// Use npm pack with --ignore-scripts to avoid triggering `prepack`
	// (which can run heavy WASM/demo verification).
	// When invoked from `pnpm pack --dry-run`, pnpm propagates `npm_config_dry_run=true`
	// into nested npm commands; force real packing here.
	const output = run(
		"npm",
		["pack", "--ignore-scripts"],
		packageRoot,
		true,
		{
			npm_config_dry_run: "false",
			NPM_CONFIG_DRY_RUN: "false",
			npm_config_cache: npmCacheDir,
			NPM_CONFIG_CACHE: npmCacheDir,
		},
	);
	// `npm pack` output can become JSON-ified under some pnpm pack contexts.
	// Extract the bare tarball filename robustly (no surrounding quotes).
	const matches = output.match(/([A-Za-z0-9][A-Za-z0-9@._-]*\.tgz)/g);
	const filename = matches?.at(-1);
	if (!filename) throw new Error("Could not find tarball name in pack output.");
	const tarballPath = path.join(packageRoot, filename);
	if (!fs.existsSync(tarballPath)) {
		throw new Error(`Expected tarball not found: ${tarballPath}`);
	}
	const destination = path.join(tempRoot, filename);
	fs.renameSync(tarballPath, destination);
	return destination;
}

function extractTarball(tarballPath, destinationDir) {
	fs.mkdirSync(destinationDir, { recursive: true });
	run(
		"tar",
		["-xzf", tarballPath, "-C", destinationDir, "--strip-components=1", "package"],
		packageRoot,
	);
}

function writeConsumerApp(appDir) {
	fs.mkdirSync(appDir, { recursive: true });
	fs.writeFileSync(
		path.join(appDir, "package.json"),
		JSON.stringify({ name: "eeg-web-consumer-node-smoke", private: true, type: "module" }) +
			"\n",
	);
	fs.writeFileSync(
		path.join(appDir, "app.mjs"),
		`import assert from "node:assert/strict";
import {
  initEegWasm,
  initEegWasmSync,
  createRppgPipeline,
} from "@elata-biosciences/eeg-web";

assert.equal(typeof initEegWasm, "function");
assert.equal(typeof initEegWasmSync, "function");
assert.equal(typeof createRppgPipeline, "function");

console.log("[eeg-web] Consumer Node smoke passed.");
`,
	);
}

const tgzPath = packPackage();
const appDir = path.join(tempRoot, "app");
const moduleDir = path.join(
	appDir,
	"node_modules",
	"@elata-biosciences",
	"eeg-web",
);

try {
	extractTarball(tgzPath, moduleDir);
	writeConsumerApp(appDir);

	run(process.execPath, ["app.mjs"], appDir);
} finally {
	fs.rmSync(tempRoot, { recursive: true, force: true });
}
