/**
 * Window-by-window analysis must equal one-shot analysis.
 *
 * This package has no streaming analyzer — there is no `createStreamingAnalyzer`
 * and no `src/streaming`; `analyzeEeg` slices windows out of a buffer it holds
 * whole. So there is nothing here to compare a streaming path against. What
 * there is, and what any future streaming path would rest on, is the claim
 * that a window's features depend on that window and nothing else: not on the
 * analyzer's history, not on the order windows arrive in, not on the samples
 * on either side of it. If that holds, feeding a signal window by window gives
 * the same answers as analyzing it in one batch; if it does not, incremental
 * enrichment would silently disagree with a recompute.
 *
 * Runs against the real wasm-bindgen build (`wasm/node`), because the jsdom
 * mock returns constants and would make every comparison here trivially true.
 * Skips loudly when the artifacts are absent, exactly as the parity suite does.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { syntheticEegInterleaved } from "../testing/synthetic.js";

const GLUE_PATH = path.resolve(
	__dirname,
	"..",
	"..",
	"wasm",
	"node",
	"biosignal_features_wasm.js",
);
const hasWasm = fs.existsSync(GLUE_PATH);

if (!hasWasm) {
	// biome-ignore lint/suspicious/noConsole: deliberate loud skip signal.
	console.warn(
		`[biosignal-analytics] SKIPPING streaming equivalence: ${GLUE_PATH} missing — run pnpm run build:wasm`,
	);
}

interface RawAnalyzer {
	analyze_window(interleaved: Float32Array): string;
	update_layout(sampleRateHz: number, channelCount: number): void;
	config_id(): string;
	free(): void;
}

interface NodeGlue {
	WasmEegWindowAnalyzer: new (
		sampleRateHz: number,
		channelCount: number,
		configJson?: string | null,
	) => RawAnalyzer;
}

const SAMPLE_RATE_HZ = 256;
const CHANNELS = 2;
const DURATION_S = 24;
const WINDOW_S = 10;
const STEP_S = 2;

const describeWasm = hasWasm ? describe : describe.skip;

describeWasm("window features depend only on the window", () => {
	// biome-ignore lint/style/noCommonJs: the nodejs-target glue is CJS by design.
	const glue = require(GLUE_PATH) as NodeGlue;

	const { samples } = syntheticEegInterleaved({
		seed: 7,
		sampleRateHz: SAMPLE_RATE_HZ,
		durationS: DURATION_S,
		channelCount: CHANNELS,
		// Mains contamination makes the quality/line-noise features vary window
		// to window, so an analyzer carrying state would show up here.
		mainsAmplitudeUv: 6,
	});

	const windowFrames = WINDOW_S * SAMPLE_RATE_HZ;
	const stepFrames = STEP_S * SAMPLE_RATE_HZ;
	const totalFrames = samples.length / CHANNELS;
	const starts: number[] = [];
	for (
		let start = 0;
		start + windowFrames <= totalFrames;
		start += stepFrames
	) {
		starts.push(start);
	}

	/** A window as a standalone buffer, copied out of the long signal. */
	const windowAt = (startFrame: number): Float32Array =>
		samples.slice(
			startFrame * CHANNELS,
			(startFrame + windowFrames) * CHANNELS,
		);

	const withAnalyzer = <T>(run: (analyzer: RawAnalyzer) => T): T => {
		const analyzer = new glue.WasmEegWindowAnalyzer(
			SAMPLE_RATE_HZ,
			CHANNELS,
			null,
		);
		try {
			return run(analyzer);
		} finally {
			analyzer.free();
		}
	};

	/** One long-lived analyzer fed every window in order. */
	const streaming = (order: readonly number[]): Map<number, string> =>
		withAnalyzer((analyzer) => {
			const out = new Map<number, string>();
			for (const start of order) {
				out.set(start, analyzer.analyze_window(windowAt(start)));
			}
			return out;
		});

	/** A fresh analyzer per window — the one-shot batch reference. */
	const perWindow = (order: readonly number[]): Map<number, string> => {
		const out = new Map<number, string>();
		for (const start of order) {
			out.set(
				start,
				withAnalyzer((analyzer) => analyzer.analyze_window(windowAt(start))),
			);
		}
		return out;
	};

	it("produces more than one window, with content that actually differs", () => {
		expect(starts.length).toBeGreaterThan(4);
		const results = perWindow(starts);
		expect(new Set(results.values()).size).toBe(starts.length);
	});

	it("gives a long-lived analyzer the same answers as a fresh one per window", () => {
		const incremental = streaming(starts);
		const batch = perWindow(starts);
		for (const start of starts) {
			expect(incremental.get(start)).toEqual(batch.get(start));
		}
	});

	it("does not depend on the order windows arrive in", () => {
		const forward = streaming(starts);
		const backward = streaming([...starts].reverse());
		const shuffled = streaming([...starts].sort((a, b) => (a % 3) - (b % 3)));
		for (const start of starts) {
			expect(backward.get(start)).toEqual(forward.get(start));
			expect(shuffled.get(start)).toEqual(forward.get(start));
		}
	});

	it("does not depend on the samples on either side of the window", () => {
		// The same window, cut from a longer signal that differs everywhere
		// outside it, must analyze identically.
		const padded = new Float32Array(samples.length + windowFrames * CHANNELS);
		padded.fill(500); // wildly out-of-range neighbours
		const offsetFrames = windowFrames / 2;
		padded.set(samples, offsetFrames * CHANNELS);

		for (const start of starts) {
			const fromLongSignal = withAnalyzer((analyzer) =>
				analyzer.analyze_window(
					padded.subarray(
						(start + offsetFrames) * CHANNELS,
						(start + offsetFrames + windowFrames) * CHANNELS,
					),
				),
			);
			expect(fromLongSignal).toEqual(
				withAnalyzer((analyzer) => analyzer.analyze_window(windowAt(start))),
			);
		}
	});

	it("re-analyzing the same window twice returns byte-identical features", () => {
		withAnalyzer((analyzer) => {
			const window = windowAt(starts[2]);
			const first = analyzer.analyze_window(window);
			// Interleave other windows, then come back to it.
			analyzer.analyze_window(windowAt(starts[0]));
			analyzer.analyze_window(windowAt(starts.at(-1) as number));
			expect(analyzer.analyze_window(window)).toEqual(first);
		});
	});
});
