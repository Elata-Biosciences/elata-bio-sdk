/**
 * Real-WASM-in-node parity: loads the wasm-bindgen `--target nodejs` build
 * from wasm/node (CJS, jest-loadable) and asserts `analyze_window` matches
 * the Python-oracle golden fixtures within the manifest tolerances.
 *
 * Skips (loudly) when the wasm artifacts are absent — run
 * `pnpm run build:wasm` first; the repo verify gates always do.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { expectClose, loadGoldenFixture, type GoldenFixture } from "../testing/fixtures.js";

const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "fixtures");
const GLUE_PATH = path.resolve(
	__dirname,
	"..",
	"..",
	"wasm",
	"node",
	"biosignal_features_wasm.js",
);
const read = (file: string): string => fs.readFileSync(file, "utf8");
const hasWasm = fs.existsSync(GLUE_PATH);

if (!hasWasm) {
	// biome-ignore lint/suspicious/noConsole: deliberate loud skip signal.
	console.warn(
		`[biosignal-analytics] SKIPPING wasm parity: ${GLUE_PATH} missing — run pnpm run build:wasm`,
	);
}

interface NodeGlue {
	WasmEegWindowAnalyzer: new (
		sampleRateHz: number,
		channelCount: number,
		configJson?: string | null,
	) => {
		analyze_window(interleaved: Float32Array): string;
		update_layout(sampleRateHz: number, channelCount: number): void;
		config_id(): string;
		free(): void;
	};
}

interface FeaturesJson {
	schema: string;
	configId: string;
	sampleCount: number;
	stats: { mean: number; rms: number; variance: number; std: number; ptp: number }[];
	bandPowersAbs: Record<string, number>[];
	bandPowersRel: Record<string, number>[];
	spectralEntropy: number[];
	dominantFrequencyHz: number[];
	alphaPeakHz: (number | null)[];
	hjorth: { activity: number; mobility: number; complexity: number }[];
	quality: {
		flatlineFraction: number;
		clippedFraction: number;
		extremeAmplitudeFraction: number;
		lineNoiseRatio: number;
		usable: boolean;
	}[];
	psd?: { freqsHz: number[]; perChannel: number[][] };
	algorithmVersions: Record<string, string>;
}

const describeWasm = hasWasm ? describe : describe.skip;

describeWasm("WASM analyze_window vs golden fixtures", () => {
	// biome-ignore lint/style/noCommonJs: the nodejs-target glue is CJS by design.
	const glue = require(GLUE_PATH) as NodeGlue;

	function analyze(samples: number[], sampleRateHz: number): FeaturesJson {
		const analyzer = new glue.WasmEegWindowAnalyzer(sampleRateHz, 1, null);
		try {
			return JSON.parse(analyzer.analyze_window(new Float32Array(samples))) as FeaturesJson;
		} finally {
			analyzer.free();
		}
	}

	function eachCase(
		fixture: GoldenFixture,
		assertCase: (
			result: FeaturesJson,
			expected: Record<string, unknown>,
			name: string,
		) => void,
	): void {
		for (const testCase of fixture.cases) {
			const samples = testCase.input.samples as number[];
			const sampleRateHz = testCase.input.sampleRateHz as number;
			assertCase(analyze(samples, sampleRateHz), testCase.expected, testCase.name);
		}
	}

	test("welch_psd@1 (emitPsd path)", () => {
		const fixture = loadGoldenFixture(read, FIXTURES_DIR, "eeg/welch_psd.json");
		for (const testCase of fixture.cases) {
			const samples = testCase.input.samples as number[];
			const sampleRateHz = testCase.input.sampleRateHz as number;
			const analyzer = new glue.WasmEegWindowAnalyzer(
				sampleRateHz,
				1,
				JSON.stringify({ emitPsd: true }),
			);
			const result = JSON.parse(
				analyzer.analyze_window(new Float32Array(samples)),
			) as FeaturesJson;
			analyzer.free();
			const psd = result.psd;
			expect(psd).toBeDefined();
			const expectedFreqs = testCase.expected.freqsHz as number[];
			const expectedPsd = testCase.expected.psd as number[];
			expect(psd?.freqsHz.length).toBe(expectedFreqs.length);
			const atol = 1e-6 * Math.max(...expectedPsd);
			for (let bin = 0; bin < expectedPsd.length; bin++) {
				expectClose(
					(psd as { perChannel: number[][] }).perChannel[0][bin],
					expectedPsd[bin],
					{ rtol: 1e-3, atol },
					`${testCase.name} psd bin ${bin}`,
				);
			}
		}
	});

	test("eeg_band_power@2 abs/rel", () => {
		const fixture = loadGoldenFixture(read, FIXTURES_DIR, "eeg/band_powers.json");
		eachCase(fixture, (result, expected, name) => {
			const expectedAbs = expected.abs as Record<string, number>;
			const expectedRel = expected.rel as Record<string, number>;
			for (const band of ["delta", "theta", "alpha", "beta", "gamma"]) {
				expectClose(
					result.bandPowersAbs[0][band],
					expectedAbs[band],
					{ rtol: 1e-3, atol: 1e-9 },
					`${name} abs ${band}`,
				);
				expectClose(
					result.bandPowersRel[0][band],
					expectedRel[band],
					{ rtol: 1e-3, atol: 1e-9 },
					`${name} rel ${band}`,
				);
			}
		});
	});

	test("spectral_entropy@1 + dominant_frequency@1", () => {
		const fixture = loadGoldenFixture(read, FIXTURES_DIR, "eeg/spectral_entropy.json");
		eachCase(fixture, (result, expected, name) => {
			expectClose(
				result.spectralEntropy[0],
				expected.spectralEntropy as number,
				{ rtol: 1e-3 },
				`${name} entropy`,
			);
			expect(result.dominantFrequencyHz[0]).toBeCloseTo(
				expected.dominantFrequencyHz as number,
				6,
			);
		});
	});

	test("alpha_peak@2 (including null cases)", () => {
		const fixture = loadGoldenFixture(read, FIXTURES_DIR, "eeg/alpha_peak.json");
		eachCase(fixture, (result, expected, name) => {
			const expectedPeak = expected.alphaPeakHz as number | null;
			if (expectedPeak === null) {
				expect(result.alphaPeakHz[0]).toBeNull();
			} else {
				expect(result.alphaPeakHz[0]).not.toBeNull();
				expectClose(
					result.alphaPeakHz[0] as number,
					expectedPeak,
					{ atol: 0.25 },
					`${name} alpha peak`,
				);
			}
		});
	});

	test("hjorth@1 + window_stats@1", () => {
		const fixture = loadGoldenFixture(read, FIXTURES_DIR, "eeg/hjorth.json");
		eachCase(fixture, (result, expected, name) => {
			const expectedHjorth = expected.hjorth as Record<string, number>;
			for (const key of ["activity", "mobility", "complexity"] as const) {
				expectClose(
					result.hjorth[0][key],
					expectedHjorth[key],
					{ rtol: 1e-4 },
					`${name} hjorth ${key}`,
				);
			}
			const expectedStats = expected.windowStats as Record<string, number>;
			for (const key of ["mean", "rms", "variance", "std", "ptp"] as const) {
				expectClose(
					result.stats[0][key],
					expectedStats[key],
					{ rtol: 1e-4, atol: 1e-9 },
					`${name} stats ${key}`,
				);
			}
		});
	});

	test("eeg_quality_flags@1", () => {
		const fixture = loadGoldenFixture(read, FIXTURES_DIR, "eeg/quality_flags.json");
		eachCase(fixture, (result, expected, name) => {
			const quality = result.quality[0];
			for (const key of [
				"flatlineFraction",
				"clippedFraction",
				"extremeAmplitudeFraction",
			] as const) {
				expectClose(quality[key], expected[key] as number, { atol: 1e-4 }, `${name} ${key}`);
			}
			expectClose(
				quality.lineNoiseRatio,
				expected.lineNoiseRatio as number,
				{ rtol: 1e-3, atol: 1e-6 },
				`${name} lineNoiseRatio`,
			);
			expect(quality.usable).toBe(expected.usable);
		});
	});

	test("config_id is stable and config-sensitive", () => {
		const a = new glue.WasmEegWindowAnalyzer(256, 1, null);
		const b = new glue.WasmEegWindowAnalyzer(256, 4, null);
		const c = new glue.WasmEegWindowAnalyzer(
			256,
			1,
			JSON.stringify({ welch: { segmentSeconds: 2 } }),
		);
		expect(a.config_id()).toBe(b.config_id());
		expect(a.config_id()).not.toBe(c.config_id());
		expect(JSON.parse(a.analyze_window(new Float32Array(512))).algorithmVersions).toMatchObject({
			welch_psd: "welch_psd@1",
			eeg_band_power: "eeg_band_power@2",
			alpha_peak: "alpha_peak@2",
		});
		a.free();
		b.free();
		c.free();
	});
});
