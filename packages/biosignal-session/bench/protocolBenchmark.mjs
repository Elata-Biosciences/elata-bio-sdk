#!/usr/bin/env node
/**
 * Protocol benchmark matrix for the biosignal session recorder.
 *
 * Drives the *committed* engine — `RecorderCore` (dist/browser.js) talking to
 * `createMemoryHost` over `createLoopbackPortPair`, fed by
 * `createSyntheticSource` (dist/testing.js) — across
 *
 *   chunk target {64 KiB, 256 KiB, 1 MiB} × in-flight window {2, 4, 8}
 *
 * for the wide (`regular-wide-f32@1`) layout, on two source profiles: the
 * consumer headset profile (4 ch @ 256 Hz), and a high-density profile
 * (16 ch @ 1000 Hz) where the byte target binds before the 30 s duration cap.
 *
 * Measured per cell:
 *   - encode ms/chunk — median of `encodeWideF32Chunk` + `checksumOf` timed on
 *     the cell's exact chunk geometry (the same calls `RecorderCore` makes).
 *   - ACK round-trip latency — wall ms from the client's `chunk/commit`
 *     `postMessage` to delivery of the matching `ok` reply, steady state only.
 *     The host is in-memory, so this is checksum re-verification + catalog
 *     bookkeeping; a real OPFS+IndexedDB host adds durability cost on top.
 *   - sustained MiB/s — committed payload bytes over *pipeline time*: the
 *     summed wall time of every `RecorderCore` call and every port delivery on
 *     both ends. Synthetic waveform generation is excluded, so this is the
 *     recorder+host cost of moving bytes, not a source benchmark.
 *   - peak in-flight buffer bytes — the client's retained (unACKed) byte
 *     highwater, reconstructed exactly as `bufferedBytes` at ACK time plus the
 *     chunk that ACK just released.
 *   - total chunks — as counted by the host, per stream.
 *
 * Each cell also runs a **host-stall probe**: the host is paused mid-session
 * for long enough to fill the in-flight window, then resumed. That is the only
 * regime in which the window is observable — with a same-thread host, ACKs
 * return before the next chunk closes, so the window never fills in steady
 * state.
 *
 * Time inside the recorder is a fake clock (retry/backoff/heartbeat), so
 * virtual session minutes cost seconds of real time; every measurement above
 * is real wall time from `node:perf_hooks`.
 *
 * Run:  node bench/protocolBenchmark.mjs           (after `pnpm build`)
 *       node bench/protocolBenchmark.mjs --quick   (shorter runs, smoke)
 */

import { performance } from "node:perf_hooks";
import {
	RecorderCore,
	checksumOf,
	encodeWideF32Chunk,
} from "../dist/browser.js";
import {
	createFakeClock,
	createLoopbackPortPair,
	createMemoryHost,
	createSyntheticSource,
} from "../dist/testing.js";

const KIB = 1024;
const MIB = 1024 * 1024;

const CHUNK_TARGETS = [64 * KIB, 256 * KIB, 1 * MIB];
const IN_FLIGHT_WINDOWS = [2, 4, 8];
/** The shipped chunk duration cap (`BIOSIGNAL_LIMITS.chunkMaxDurationUs`). */
const CHUNK_MAX_DURATION_US = 30_000_000;
/** The shipped soft buffer limit, for the headroom line. */
const SOFT_BUFFER_BYTES = 32 * MIB;
/** Virtual push cadence of the synthetic source. */
const BATCH_MS = 250;
/** Encode timings per cell (median reported — rejects GC outliers). */
const ENCODE_SAMPLES = 25;

const quick = process.argv.includes("--quick");

const PROFILES = [
	{
		id: "headset",
		label: "4 ch @ 256 Hz EEG + rppg-metrics @ 1 Hz",
		channelCount: 4,
		sampleRateHz: 256,
		durationSec: quick ? 180 : 900,
	},
	{
		id: "high-density",
		label: "16 ch @ 1000 Hz EEG + rppg-metrics @ 1 Hz",
		channelCount: 16,
		sampleRateHz: 1000,
		durationSec: quick ? 120 : 300,
	},
];

/** Rows per closed chunk under `sampleBuffer`'s policy (byte target ∨ 30 s). */
function capacityRows(chunkTargetBytes, channelCount, sampleRateHz) {
	return Math.max(
		1,
		Math.min(
			Math.floor(chunkTargetBytes / (channelCount * 4)),
			Math.floor((CHUNK_MAX_DURATION_US * sampleRateHz) / 1_000_000),
		),
	);
}

/** Drain the microtask queue completely (loopback delivery is a microtask). */
function drain() {
	return new Promise((resolve) => setImmediate(resolve));
}

function percentile(sorted, fraction) {
	if (sorted.length === 0) return Number.NaN;
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(fraction * sorted.length) - 1),
	);
	return sorted[index];
}

/**
 * Median wall ms of `encodeWideF32Chunk` + `checksumOf` on a chunk of exactly
 * `rows` rows × `channelCount` channels — the cell's real chunk geometry.
 */
function measureEncodeMs(rows, channelCount) {
	const channelNames = Array.from(
		{ length: channelCount },
		(_, index) => `EEG${index + 1}`,
	);
	const columns = channelNames.map((_, channel) => {
		const column = new Float32Array(rows);
		for (let row = 0; row < rows; row++) {
			column[row] = Math.sin((row + channel) * 0.01) * 20 + channel;
		}
		return column;
	});
	const identity = {
		sessionId: "bench-session",
		streamId: "bench-stream",
		arrowSchemaId: "regular-wide-f32@1",
	};
	for (let i = 0; i < 5; i++) {
		checksumOf(encodeWideF32Chunk(channelNames, columns, identity));
	}
	const samples = [];
	for (let i = 0; i < ENCODE_SAMPLES; i++) {
		const startedAt = performance.now();
		checksumOf(encodeWideF32Chunk(channelNames, columns, identity));
		samples.push(performance.now() - startedAt);
	}
	samples.sort((a, b) => a - b);
	return percentile(samples, 0.5);
}

async function runCell(profile, chunkTargetBytes, inFlightWindow) {
	const clock = createFakeClock();
	const host = createMemoryHost({
		nowMs: () => clock.monotonicNow(),
		nowUtcMs: () => clock.utcNow(),
		// Descriptors and stats are kept; payload bytes are not retained so a
		// 15-minute run does not hold the whole session in memory.
		retainPayloads: false,
	});
	const [rawClientPort, rawHostPort] = createLoopbackPortPair();

	let pipelineMs = 0;
	let rttEnabled = true;
	let commitSends = 0;
	const sentAtMs = new Map();
	const ackRtts = [];

	/** Wrap a port so deliveries are timed and commit round trips are paired. */
	const instrument = (port, { onSend, onDeliver }) => {
		let handler = null;
		return {
			postMessage(message, transfer) {
				onSend?.(message);
				port.postMessage(message, transfer);
			},
			get onmessage() {
				return handler;
			},
			set onmessage(next) {
				handler = next;
				port.onmessage =
					next === null
						? null
						: (event) => {
								onDeliver?.(event.data);
								const startedAt = performance.now();
								try {
									next(event);
								} finally {
									pipelineMs += performance.now() - startedAt;
								}
							};
			},
			start() {
				port.start?.();
			},
			close() {
				port.close?.();
			},
		};
	};

	const clientPort = instrument(rawClientPort, {
		onSend(message) {
			if (message?.op === "chunk/commit") {
				commitSends += 1;
				sentAtMs.set(message.id, performance.now());
			}
		},
		onDeliver(message) {
			const startedAt = sentAtMs.get(message?.id);
			if (startedAt === undefined) return;
			sentAtMs.delete(message.id);
			// Round trips spanning the stall probe are not steady state.
			if (rttEnabled) ackRtts.push(performance.now() - startedAt);
		},
	});
	host.attach(instrument(rawHostPort, {}));

	let peakInFlightBytes = 0;
	let maxInFlightChunks = 0;
	let steadyPeakInFlightBytes = 0;
	let steadyMaxInFlightChunks = 0;
	let lastCommittedBytes = 0;
	const errors = [];
	const core = new RecorderCore({
		emit(message) {
			if (message.t === "progress") {
				const releasedBytes = message.committedBytes - lastCommittedBytes;
				lastCommittedBytes = message.committedBytes;
				// Retention just before this ACK released its chunk.
				const retained = message.bufferedBytes + releasedBytes;
				peakInFlightBytes = Math.max(peakInFlightBytes, retained);
				maxInFlightChunks = Math.max(maxInFlightChunks, message.inFlight);
				if (rttEnabled) {
					steadyPeakInFlightBytes = Math.max(steadyPeakInFlightBytes, retained);
					steadyMaxInFlightChunks = Math.max(
						steadyMaxInFlightChunks,
						message.inFlight,
					);
				}
			} else if (message.t === "error" && !message.retryable) {
				errors.push(
					`${message.code}${message.detail ? `: ${message.detail}` : ""}`,
				);
			}
		},
		now: () => clock.monotonicNow(),
		jitter: () => 0,
	});

	const call = (message) => {
		const startedAt = performance.now();
		try {
			core.handle(message);
		} finally {
			pipelineMs += performance.now() - startedAt;
		}
	};
	const tick = () => {
		const startedAt = performance.now();
		try {
			core.tick();
		} finally {
			pipelineMs += performance.now() - startedAt;
		}
	};

	let streamCounter = 0;
	const sink = {
		clock: { nowUs: () => (clock.monotonicNow() - 10_000) * 1000 },
		openStream(draft) {
			const clientStreamId = `cs-${++streamCounter}`;
			call({ t: "stream/open", clientStreamId, draft });
			const channels = draft.channels.length;
			return {
				streamId: clientStreamId,
				pushRegular(rowMajor, rows, sampleIndex0, timeUs0) {
					call({
						t: "samples",
						clientStreamId,
						sampleIndex0,
						timeUs0,
						rows,
						channels,
						data: rowMajor.slice().buffer,
					});
				},
				pushIrregular(timesUs, rowMajor, rows) {
					call({
						t: "irregular",
						clientStreamId,
						rows,
						timesUs: timesUs.slice().buffer,
						data: rowMajor.slice().buffer,
					});
				},
				pushMetricRow(timeUs, row) {
					call({ t: "metricRow", clientStreamId, timeUs, row });
				},
				hintDiscontinuity(reason) {
					call({ t: "discontinuityHint", clientStreamId, reason });
				},
				close(endUs) {
					call({ t: "stream/close", clientStreamId, endUs });
				},
			};
		},
		event(event) {
			call({ t: "event", events: [event] });
		},
		clockObservation(observation) {
			call({ t: "clock", observations: [observation] });
		},
		status() {},
	};

	call({
		t: "init",
		port: clientPort,
		config: { chunkTargetBytes, inFlightWindow },
	});
	await drain();
	call({
		t: "session/start",
		spec: {
			label: `bench-${profile.id}`,
			startedAtUtcMs: clock.utcNow(),
			startedAtMonotonicMs: clock.monotonicNow(),
			sources: [
				{
					kind: "synthetic",
					name: "bench",
					adapter: "synthetic@1",
					sdkPackages: [
						{ name: "@elata-biosciences/biosignal-session", version: "0.1.0" },
					],
				},
			],
			provenance: {
				recorderVersion: "0.1.0",
				protocolVersion: 1,
				sdkPackages: [],
			},
		},
	});
	await drain();

	const source = createSyntheticSource({
		seed: 4242,
		eeg: {
			channelCount: profile.channelCount,
			sampleRateHz: profile.sampleRateHz,
			// Payload bytes are identical either way; the cheap waveform keeps
			// generation (which is excluded from pipeline time) out of the way.
			waveform: "simple",
		},
		rppgMetrics: { rateHz: 1 },
		ppgMetrics: false,
		batchMs: BATCH_MS,
	});
	await source.start(sink);
	await drain();

	const rows = capacityRows(
		chunkTargetBytes,
		profile.channelCount,
		profile.sampleRateHz,
	);
	const chunkSeconds = rows / profile.sampleRateHz;
	// Long enough to fill the window and close one more chunk behind it, and
	// short enough to stay under the control-op rate limit after resume.
	const steps = Math.round((profile.durationSec * 1000) / BATCH_MS);
	const stallStartStep = Math.floor(steps / 2);
	const stallSec = Math.min(
		120,
		Math.floor(profile.durationSec * 0.3),
		Math.ceil(chunkSeconds * (inFlightWindow + 1)) + 1,
	);
	const stallSteps = Math.round((stallSec * 1000) / BATCH_MS);

	// Steady-state metrics are collected strictly before the stall: retry
	// backoff keeps draining for a while after a resume, which is real
	// behaviour but not steady state.
	for (let step = 0; step < steps; step++) {
		if (step === stallStartStep) {
			rttEnabled = false;
			host.pause();
		}
		if (step === stallStartStep + stallSteps) {
			host.resume();
			await drain();
		}
		source.pump(BATCH_MS);
		clock.advance(BATCH_MS);
		tick();
		await drain();
	}
	// A short profile may end while still paused.
	host.resume();
	await drain();

	await source.stop();
	await drain();
	call({ t: "session/stop", mode: "finalize" });
	await drain();
	for (let i = 0; i < 600 && core.state() === "finalizing"; i++) {
		clock.advance(500);
		tick();
		await drain();
	}

	let eegChunks = 0;
	let eegBytes = 0;
	let totalChunks = 0;
	for (const stream of host.streams.values()) {
		totalChunks += stream.stats.chunkCount;
		if (stream.modality === "eeg") {
			eegChunks = stream.stats.chunkCount;
			eegBytes = stream.stats.byteCount;
		}
	}
	const committedBytes = host.committedBytes();
	const sortedRtts = [...ackRtts].sort((a, b) => a - b);
	const bytesPerChunk = eegChunks > 0 ? eegBytes / eegChunks : 0;

	return {
		state: core.state(),
		errors,
		rowsPerChunk: rows,
		chunkSeconds,
		boundBy:
			Math.floor(chunkTargetBytes / (profile.channelCount * 4)) <=
			Math.floor((CHUNK_MAX_DURATION_US * profile.sampleRateHz) / 1_000_000)
				? "bytes"
				: "30 s",
		resends: commitSends - totalChunks,
		ackP50Ms: percentile(sortedRtts, 0.5),
		ackP95Ms: percentile(sortedRtts, 0.95),
		ackSamples: sortedRtts.length,
		mibPerSecond: committedBytes / MIB / (pipelineMs / 1000),
		// Fraction of one core the recorder+host consume to keep up with a
		// real-time session of this profile.
		realtimeCpuPercent: (pipelineMs / (profile.durationSec * 1000)) * 100,
		committedMib: committedBytes / MIB,
		peakInFlightBytes,
		maxInFlightChunks,
		steadyPeakInFlightBytes,
		steadyMaxInFlightChunks,
		stallSec,
		eegChunks,
		bytesPerChunk,
		totalChunks,
		committedBytes,
		pipelineMs,
	};
}

function formatBytes(bytes) {
	if (bytes >= MIB) return `${(bytes / MIB).toFixed(2)} MiB`;
	return `${(bytes / KIB).toFixed(0)} KiB`;
}

function row(cells) {
	return `| ${cells.join(" | ")} |`;
}

function formatTables(profile, cells) {
	const lines = [];
	lines.push(
		`### ${profile.label}`,
		"",
		`${profile.durationSec} s virtual session, wide layout (\`regular-wide-f32@1\`), 30 s duration cap, ~${cells[0].committedMib.toFixed(1)} MiB committed per run.`,
		"",
		"**Steady state**",
		"",
		row([
			"chunk target",
			"window",
			"rows/chunk",
			"chunk s",
			"payload/chunk",
			"closed by",
			"chunks",
			"encode ms/chunk",
			"encode MiB/s",
			"ACK p50 ms",
			"ACK p95 ms",
			"pipeline MiB/s",
			"CPU % of realtime",
			"peak in-flight",
		]),
		row(new Array(14).fill("---")),
	);
	for (const cell of cells) {
		lines.push(
			row([
				cell.targetLabel,
				cell.window,
				cell.rowsPerChunk,
				cell.chunkSeconds.toFixed(2),
				formatBytes(cell.bytesPerChunk),
				cell.boundBy,
				cell.eegChunks,
				cell.encodeMs.toFixed(3),
				cell.encodeMibPerSecond.toFixed(0),
				cell.ackP50Ms.toFixed(3),
				cell.ackP95Ms.toFixed(3),
				cell.mibPerSecond.toFixed(0),
				cell.realtimeCpuPercent.toFixed(3),
				formatBytes(cell.steadyPeakInFlightBytes),
			]),
		);
	}
	lines.push(
		"",
		"**Host-stall probe** (host paused mid-session, then resumed — the only regime in which the window fills)",
		"",
		row([
			"chunk target",
			"window",
			"stall s",
			"max unACKed chunks",
			"resends",
			"retained highwater",
			"% of 32 MiB soft limit",
		]),
		row(new Array(7).fill("---")),
	);
	for (const cell of cells) {
		lines.push(
			row([
				cell.targetLabel,
				cell.window,
				cell.stallSec,
				cell.maxInFlightChunks,
				cell.resends,
				formatBytes(cell.peakInFlightBytes),
				`${((cell.peakInFlightBytes / SOFT_BUFFER_BYTES) * 100).toFixed(1)} %`,
			]),
		);
	}
	lines.push("");
	return lines.join("\n");
}

async function main() {
	console.log("# biosignal-session protocol benchmark");
	console.log("");
	console.log(
		`node ${process.version} · ${process.platform}/${process.arch} · ${new Date().toISOString().slice(0, 10)}${quick ? " · --quick" : ""}`,
	);
	console.log("");

	for (const profile of PROFILES) {
		// Encode cost depends only on chunk geometry, so measure it once per
		// target on a quiet heap rather than after each cell's session run.
		const encodeMsByTarget = new Map();
		for (const chunkTargetBytes of CHUNK_TARGETS) {
			const rows = capacityRows(
				chunkTargetBytes,
				profile.channelCount,
				profile.sampleRateHz,
			);
			encodeMsByTarget.set(
				chunkTargetBytes,
				measureEncodeMs(rows, profile.channelCount),
			);
		}

		// Warm-up: JIT the whole pipeline so the first measured cell is not
		// systematically slower than the rest. Result discarded.
		process.stderr.write(`… ${profile.id} warm-up\n`);
		await runCell(profile, 256 * KIB, 4);

		const cells = [];
		for (const chunkTargetBytes of CHUNK_TARGETS) {
			for (const window of IN_FLIGHT_WINDOWS) {
				process.stderr.write(
					`… ${profile.id} target=${chunkTargetBytes / KIB}KiB window=${window}\n`,
				);
				const result = await runCell(profile, chunkTargetBytes, window);
				if (result.state !== "complete") {
					throw new Error(
						`cell did not complete: state=${result.state} errors=${result.errors.join(" | ")}`,
					);
				}
				if (result.errors.length > 0) {
					throw new Error(`fatal errors in cell: ${result.errors.join(" | ")}`);
				}
				const encodeMs = encodeMsByTarget.get(chunkTargetBytes);
				cells.push({
					...result,
					encodeMs,
					encodeMibPerSecond: result.bytesPerChunk / MIB / (encodeMs / 1000),
					targetLabel:
						chunkTargetBytes >= MIB
							? `${chunkTargetBytes / MIB} MiB`
							: `${chunkTargetBytes / KIB} KiB`,
					window,
				});
			}
		}
		console.log(formatTables(profile, cells));
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
