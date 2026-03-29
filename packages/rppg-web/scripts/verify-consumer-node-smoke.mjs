#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	rmSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const tempRoot = mkdtempSync(path.join(tmpdir(), "rppg-web-consumer-node-"));
const npmCacheDir = path.join(tempRoot, "npm-cache");

mkdirSync(npmCacheDir, { recursive: true });

function run(cmd, args, cwd, capture = false, envOverride) {
	const env = envOverride ? { ...process.env, ...envOverride } : process.env;
	const result = spawnSync(cmd, args, {
		cwd,
		encoding: "utf8",
		stdio: capture ? "pipe" : "inherit",
		env,
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		const details = capture
			? `\n${result.stdout ?? ""}\n${result.stderr ?? ""}`
			: "";
		throw new Error(`Command failed (${result.status}): ${cmd} ${args.join(" ")}${details}`);
	}
	return result.stdout ?? "";
}

function packPackage() {
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
	if (!filename) {
		throw new Error("Could not find tarball name in npm pack output.");
	}
	const tarballPath = path.join(packageRoot, filename);
	if (!existsSync(tarballPath)) {
		throw new Error(`Expected tarball not found: ${tarballPath}`);
	}
	const destination = path.join(tempRoot, filename);
	renameSync(tarballPath, destination);
	return destination;
}

function extractTarball(tarballPath, destinationDir) {
	mkdirSync(destinationDir, { recursive: true });
	run(
		"tar",
		["-xzf", tarballPath, "-C", destinationDir, "--strip-components=1", "package"],
		packageRoot,
	);
}

function writeConsumerApp(appDir) {
	mkdirSync(appDir, { recursive: true });
	writeFileSync(
		path.join(appDir, "package.json"),
		JSON.stringify(
			{
				name: "rppg-web-consumer-node-smoke",
				private: true,
				type: "module",
			},
			null,
			2,
		) + "\n",
	);
	writeFileSync(
		path.join(appDir, "app.mjs"),
		`import assert from "node:assert/strict";
import {
  RppgProcessor,
  createRppgAppAdapter,
  createUnavailableBackend,
  normalizeRppgError,
} from "@elata-biosciences/rppg-web";

const processor = new RppgProcessor(createUnavailableBackend(), 30, 5);
const metrics = processor.getMetrics();
assert.equal(metrics.bpm, null);
assert.equal(metrics.confidence, 0);
assert.equal(metrics.signal_quality, 0);

const adapter = createRppgAppAdapter({ nowMs: () => 1000 });
const diagnostics = {
  backendMode: "unavailable",
  estimationAvailable: false,
  faceTrackingMode: "video_frame",
  roiSource: "fallback_roi",
  processorMethod: "rgb_meta",
  totalSamplesReceived: 0,
  windowSampleCount: 0,
  windowDurationMs: 0,
  lastSampleTimestampMs: null,
  lastSampleAgeMs: null,
  lastSample: null,
  processorIssues: [],
  issues: ["backend_unavailable"],
  processorFailure: null,
  state: {
    status: "degraded",
    phase: "startup",
    terminal: false,
    reason: "backend_unavailable",
    errorCode: null,
    errorStage: null,
  },
  lastError: null,
  framesSeen: 0,
  framesWithFaceRoi: 0,
  framesWithFallbackRoi: 0,
  framesWithMultiRoi: 0,
  samplesPushed: 0,
  droppedFrames: 0,
  lastDropReason: null,
  lastTimestampMs: null,
  lastIntensity: null,
  lastSkinRatio: null,
  lastClipRatio: null,
  lastMotion: null,
  lastProcessorMethod: null,
  lastRoiSource: null,
};

const snapshot = adapter.getSnapshot({
  state: diagnostics.state,
  lastError: null,
  getMetrics: () => metrics,
  getDiagnostics: () => diagnostics,
  getTraceSnapshot: () => processor.getTraceSnapshot(8),
});

assert.equal(snapshot.status, "degraded");
assert.equal(snapshot.canPublish, false);
assert.equal(snapshot.normalizedError?.code, "backend_unavailable");

const normalized = normalizeRppgError(null, diagnostics);
assert.equal(normalized?.code, "backend_unavailable");

console.log("[rppg-web] Consumer Node smoke passed.");
`,
	);
}

try {
	const tarballPath = packPackage();
	const appDir = path.join(tempRoot, "app");
	const moduleDir = path.join(
		appDir,
		"node_modules",
		"@elata-biosciences",
		"rppg-web",
	);
	extractTarball(tarballPath, moduleDir);
	writeConsumerApp(appDir);
	run(process.execPath, ["app.mjs"], appDir);
} catch (error) {
	console.error(
		`[rppg-web] Consumer Node smoke failed: ${
			error instanceof Error ? error.message : String(error)
		}`,
	);
	console.error(`[rppg-web] Preserving temp directory for inspection: ${tempRoot}`);
	process.exitCode = 1;
} finally {
	if (!process.exitCode) {
		rmSync(tempRoot, { recursive: true, force: true });
	}
}
