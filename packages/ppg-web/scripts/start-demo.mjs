#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoDir = path.join(packageRoot, "demo");
const buildScript = path.join(packageRoot, "scripts", "build-demo.mjs");
const eegWasmEntry = path.join(demoDir, "eeg-wasm", "eeg_wasm.js");
const port = String(process.env.PORT ?? 8081);
const quick = process.argv.includes("--quick");
const serverCommand =
	process.platform === "win32"
		? {
				command: "corepack.cmd",
				args: ["pnpm", "dlx", "http-server", demoDir, "-p", port, "--silent"],
				shell: true,
			}
		: {
				command: "corepack",
				args: ["pnpm", "dlx", "http-server", demoDir, "-p", port, "--silent"],
				shell: false,
			};

if (!quick) {
	const build = spawnSync(process.execPath, [buildScript], {
		cwd: packageRoot,
		stdio: "inherit",
	});
	if (build.status !== 0) {
		process.exit(build.status ?? 1);
	}
}

if (!existsSync(eegWasmEntry)) {
	console.warn(
		"[ppg-web] EEG WASM assets are missing from demo/eeg-wasm. " +
			"Muse S Athena devices will warn or fail to decode until EEG artifacts are built.",
	);
}

const server = spawn(
	serverCommand.command,
	serverCommand.args,
	{
		cwd: packageRoot,
		stdio: "inherit",
		shell: serverCommand.shell,
	},
);

server.on("error", (error) => {
	console.error(
		`[ppg-web] Failed to start demo server via corepack: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
});

server.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 0);
});
