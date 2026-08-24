#!/usr/bin/env node
// Build elata-biosignal-features-wasm into wasm/ (adapted from
// packages/rppg-web/scripts/build-demo.mjs, minus the demo bundling step).
// Emits two wasm-bindgen targets:
//   wasm/       --target web    (production: bundlers, workers, browsers)
//   wasm/node/  --target nodejs (CJS glue: node consumers + in-jest parity)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const webOutDir = path.resolve(packageRoot, "wasm");
const nodeOutDir = path.resolve(packageRoot, "wasm", "node");
const wasmPath = path.resolve(
	repoRoot,
	"target",
	"wasm32-unknown-unknown",
	"release",
	"biosignal_features_wasm.wasm",
);

function run(cmd, args, cwd = repoRoot) {
	const full = `${cmd} ${args.join(" ")}`;
	console.log(`[biosignal-analytics] ${full}`);
	const res = spawnSync(cmd, args, { cwd, stdio: "inherit" });
	if (res.error) {
		if (res.error && res.error.code === "ENOENT") {
			throw new Error(`Missing command '${cmd}'. Install it and retry.`);
		}
		throw res.error;
	}
	if (res.status !== 0) {
		throw new Error(`Command failed (${res.status}): ${full}`);
	}
}

function hasCommand(cmd) {
	const res = spawnSync(cmd, ["--version"], { stdio: "ignore" });
	return !res.error && res.status === 0;
}

/** Workspace `rust-version`; cargo's own error for this is a bare exit 101. */
const MIN_RUST = [1, 94, 0];

function assertRustVersion() {
	const res = spawnSync("rustc", ["--version"], { encoding: "utf8" });
	if (res.error || res.status !== 0) return; // let cargo report a missing toolchain
	const match = /(\d+)\.(\d+)\.(\d+)/.exec(res.stdout ?? "");
	if (!match) return;
	const found = [Number(match[1]), Number(match[2]), Number(match[3])];
	const tooOld = found.some((part, i) => {
		if (part !== MIN_RUST[i]) return part < MIN_RUST[i];
		return false;
	});
	if (!tooOld) return;
	throw new Error(
		[
			`rustc ${found.join(".")} is older than the workspace rust-version ${MIN_RUST.join(".")}.`,
			"A Homebrew rustc often shadows rustup's — try:",
			'  PATH="$HOME/.cargo/bin:$PATH" RUSTUP_TOOLCHAIN=stable pnpm run build:wasm',
		].join("\n"),
	);
}

try {
	mkdirSync(webOutDir, { recursive: true });
	mkdirSync(nodeOutDir, { recursive: true });
	assertRustVersion();
	if (hasCommand("rustup")) {
		run("rustup", ["target", "add", "wasm32-unknown-unknown"]);
	}
	run("cargo", [
		"build",
		"-p",
		"elata-biosignal-features-wasm",
		"--target",
		"wasm32-unknown-unknown",
		"--release",
	]);
	if (!existsSync(wasmPath)) {
		throw new Error(`Built wasm not found at ${wasmPath}`);
	}
	if (!hasCommand("wasm-bindgen")) {
		run("cargo", ["install", "-f", "wasm-bindgen-cli"]);
	}
	run("wasm-bindgen", [wasmPath, "--out-dir", webOutDir, "--target", "web"]);
	run("wasm-bindgen", [
		wasmPath,
		"--out-dir",
		nodeOutDir,
		"--target",
		"nodejs",
	]);
	console.log("[biosignal-analytics] wasm artifacts written to wasm/");
} catch (err) {
	console.error(
		`[biosignal-analytics] ${err instanceof Error ? err.message : String(err)}`,
	);
	process.exitCode = 1;
}
