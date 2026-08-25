/**
 * Memory is bounded by the in-flight window, not by session length.
 *
 * The endurance suite proves a long session stays under the soft limit. That
 * is necessary but not sufficient: a slow leak proportional to duration would
 * still pass it. This suite records the same signal for wildly different
 * durations and asserts the buffer highwater does not grow with the session —
 * a 48x longer recording must not cost meaningfully more memory.
 */

import { BIOSIGNAL_LIMITS } from "../protocol/messages";
import { createRecorderHarness } from "../testing/recorderHarness";
import { createSyntheticSource } from "../testing/syntheticSource";

jest.setTimeout(180_000);

interface RunResult {
	seconds: number;
	highwaterBytes: number;
	totalChunks: number;
	maxInFlight: number;
}

async function record(seconds: number): Promise<RunResult> {
	const harness = createRecorderHarness({ hostOptions: { retainPayloads: false } });
	const source = createSyntheticSource({
		seed: 99,
		eeg: { channelCount: 4, waveform: "simple" },
		rppgMetrics: { rateHz: 1 },
		ppgMetrics: { rateHz: 0.5 },
	});
	await harness.start();
	await harness.startSource(source);

	const sliceSeconds = 60;
	let highwaterBytes = 0;
	let maxInFlight = 0;
	for (let slice = 0; slice < seconds / sliceSeconds; slice++) {
		source.pump(sliceSeconds * 1000);
		await harness.advance(sliceSeconds * 1000);
		for (const event of harness.events) {
			if (event.t === "progress") {
				highwaterBytes = Math.max(highwaterBytes, event.bufferedBytes);
				maxInFlight = Math.max(maxInFlight, event.inFlight);
			}
		}
		harness.events.length = 0; // keep the recorded events flat, not the buffer
	}
	await source.stop();
	await harness.finalize();

	const session = [...harness.host.sessions.values()][0];
	return {
		seconds,
		highwaterBytes,
		totalChunks: session?.stats.totalChunks ?? 0,
		maxInFlight,
	};
}

describe("buffer growth versus session length", () => {
	const SHORT_SECONDS = 10 * 60; // 10 virtual minutes
	const LONG_SECONDS = 8 * 60 * 60; // 8 virtual hours — 48x longer
	let short: RunResult;
	let long: RunResult;

	beforeAll(async () => {
		short = await record(SHORT_SECONDS);
		long = await record(LONG_SECONDS);
	});

	it("records proportionally more chunks for the longer session", () => {
		// Guards the premise: the long run really is ~48x the work.
		const ratio = long.totalChunks / short.totalChunks;
		expect(ratio).toBeGreaterThan(40);
		expect(long.totalChunks).toBeGreaterThan(1000);
	});

	it("does not grow the buffer highwater with session length", () => {
		// The architectural claim: retention tracks the in-flight window, so a
		// 48x longer session must not cost meaningfully more memory. A modest
		// factor absorbs chunk-boundary phase differences; anything
		// proportional to duration would blow past it immediately.
		expect(long.highwaterBytes).toBeLessThanOrEqual(short.highwaterBytes * 1.5);
	});

	it("keeps both runs far below the soft buffer limit", () => {
		expect(short.highwaterBytes).toBeGreaterThan(0);
		expect(long.highwaterBytes).toBeLessThan(BIOSIGNAL_LIMITS.softBufferBytes / 10);
	});

	it("keeps in-flight chunks within the window across all streams", () => {
		// The window is enforced PER STREAM (`inFlightCount(streamId) <
		// window`), while the progress event reports the GLOBAL count. With
		// three concurrent streams the global figure can legitimately exceed
		// the per-stream window, so the meaningful ceiling is window × streams
		// — still a hard bound, and still independent of session length.
		const streams = 3; // eeg + rppg-metrics + ppg-metrics
		const ceiling = BIOSIGNAL_LIMITS.defaultInFlightWindow * streams;
		expect(short.maxInFlight).toBeLessThanOrEqual(ceiling);
		expect(long.maxInFlight).toBeLessThanOrEqual(ceiling);
		// And the long run must not drift above the short one.
		expect(long.maxInFlight).toBeLessThanOrEqual(
			Math.max(short.maxInFlight, BIOSIGNAL_LIMITS.defaultInFlightWindow),
		);
	});
});
