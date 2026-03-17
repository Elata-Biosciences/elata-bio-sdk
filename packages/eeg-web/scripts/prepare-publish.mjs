#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(pkgDir, "..", "..");
const outDir = path.resolve(repoRoot, "eeg-demo", "pkg");
const wasmPath = path.resolve(
	repoRoot,
	"target",
	"wasm32-unknown-unknown",
	"release",
	"eeg_wasm.wasm",
);

function run(cmd, args, cwd = repoRoot) {
	const full = `${cmd} ${args.join(" ")}`;
	console.log(`[eeg-web] ${full}`);
	const res = spawnSync(cmd, args, { cwd, stdio: "inherit" });
	if (res.error) {
		if (res.error.code === "ENOENT") {
			throw new Error(`Missing command '${cmd}'. Install it and retry.`);
		}
		throw res.error;
	}
	if (res.status !== 0) {
		throw new Error(`Command failed (${res.status}): ${full}`);
	}
}

try {
	run("rustup", ["target", "add", "wasm32-unknown-unknown"]);
	run("cargo", [
		"build",
		"-p",
		"eeg-wasm",
		"--target",
		"wasm32-unknown-unknown",
		"--release",
	]);
	run("wasm-bindgen", [wasmPath, "--out-dir", outDir, "--target", "web"]);
	run("bash", ["./scripts/sync-wasm.sh"], pkgDir);
	run("pnpm", ["run", "build"], pkgDir);
} catch (err) {
	console.error(`[eeg-web] ${err instanceof Error ? err.message : String(err)}`);
	process.exitCode = 1;
}
