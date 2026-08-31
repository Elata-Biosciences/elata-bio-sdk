/**
 * Real-WASM-in-node parity for `prv_*@1` and `activation_epoch@1`.
 *
 * Two independent claims, deliberately kept apart:
 *
 * 1. WASM vs the PYTHON ORACLE — the wasm32 build reproduces the numpy/scipy
 *    golden fixtures within the manifest tolerances. This is the correctness
 *    claim.
 * 2. WASM vs NATIVE RUST — the wasm32 build returns the same numbers as the
 *    native build for the same inputs. This is the portability claim, and it
 *    is checked against `target/wasm-native-parity/prv_activation_native.json`
 *    written by `cargo test -p elata-biosignal-features-wasm`. That snapshot
 *    is generated from the code under test on purpose: it is not asked to say
 *    whether the numbers are RIGHT, only whether the two builds AGREE.
 *
 * Bit-for-bit equality is deliberately NOT asserted, because it does not hold
 * and asserting it would be a lie about what the two targets guarantee. LLVM
 * contracts `a * b + c` into a fused multiply-add where the host ISA has one
 * and wasm32 does not, so a value as simple as the activation threshold
 * (`level + k * scale`) can differ by one ulp. Measured worst cases across
 * every fixture case:
 *
 * - pure arithmetic (medians, sample std, trapezoid areas, slopes, thresholds):
 *   2.2e-16 relative — one ulp, from FMA contraction. Asserted at 1e-14.
 * - FFT/`cos`-derived band powers, where host and wasm32 libm differ in the
 *   last ulp of `cos` and the difference amplifies through the windowed
 *   transform: 2.3e-8 relative. Asserted at 1e-6.
 *
 * Both are still far tighter than the oracle tolerances (1e-5 for the bands),
 * so a genuine portability bug fails here well before it could reach the
 * correctness suite.
 *
 * Skips (loudly) when the wasm artifacts or the native snapshot are absent —
 * run `pnpm run build:wasm` and `cargo test -p elata-biosignal-features-wasm`;
 * the repo verify gates always do.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
	expectClose,
	loadGoldenFixture,
	type GoldenFixture,
} from "../testing/fixtures.js";

const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "fixtures");
const GLUE_PATH = path.resolve(
	__dirname,
	"..",
	"..",
	"wasm",
	"node",
	"biosignal_features_wasm.js",
);
const NATIVE_SNAPSHOT_PATH = path.resolve(
	__dirname,
	"..",
	"..",
	"..",
	"..",
	"target",
	"wasm-native-parity",
	"prv_activation_native.json",
);

const read = (file: string): string => fs.readFileSync(file, "utf8");
const hasWasm = fs.existsSync(GLUE_PATH);
const hasNative = fs.existsSync(NATIVE_SNAPSHOT_PATH);

if (!hasWasm) {
	// biome-ignore lint/suspicious/noConsole: deliberate loud skip signal.
	console.warn(
		`[biosignal-analytics] SKIPPING pulse/activation wasm parity: ${GLUE_PATH} missing — run pnpm run build:wasm`,
	);
}
if (hasWasm && !hasNative) {
	// biome-ignore lint/suspicious/noConsole: deliberate loud skip signal.
	console.warn(
		`[biosignal-analytics] SKIPPING wasm-vs-native parity: ${NATIVE_SNAPSHOT_PATH} missing — run cargo test -p elata-biosignal-features-wasm`,
	);
}

interface PrvAnalyzerHandle {
	analyze_intervals(intervalsMs: Float64Array): string;
	config_id(): string;
	free(): void;
}

interface ActivationAnalyzerHandle {
	analyze_series(values: Float64Array): string;
	config_id(): string;
	free(): void;
}

interface NodeGlue {
	WasmPrvAnalyzer: new (configJson?: string | null) => PrvAnalyzerHandle;
	WasmActivationEpochAnalyzer: new (
		sampleRateHz: number,
		configJson?: string | null,
	) => ActivationAnalyzerHandle;
}

type Json = Record<string, unknown>;

const describeWasm = hasWasm ? describe : describe.skip;

describeWasm("PRV + activation_epoch through the real WASM build", () => {
	// biome-ignore lint/style/noCommonJs: the nodejs-target glue is CJS by design.
	const glue = require(GLUE_PATH) as NodeGlue;

	function analyzePrv(intervalsMs: number[]): Json {
		const analyzer = new glue.WasmPrvAnalyzer(null);
		try {
			return JSON.parse(
				analyzer.analyze_intervals(new Float64Array(intervalsMs)),
			) as Json;
		} finally {
			analyzer.free();
		}
	}

	function analyzeActivation(values: number[], sampleRateHz: number): Json {
		const analyzer = new glue.WasmActivationEpochAnalyzer(sampleRateHz, null);
		try {
			return JSON.parse(
				analyzer.analyze_series(new Float64Array(values)),
			) as Json;
		} finally {
			analyzer.free();
		}
	}

	function optional(
		actual: unknown,
		expected: unknown,
		tolerance: { rtol?: number; atol?: number },
		context: string,
	): void {
		if (expected === null) {
			expect(actual).toBeNull();
			return;
		}
		expect(actual).not.toBeNull();
		expectClose(actual as number, expected as number, tolerance, context);
	}

	// ------------------------------------------- 1. WASM vs Python oracle --

	test("prv_time_domain@1 matches the numpy oracle", () => {
		const fixture: GoldenFixture = loadGoldenFixture(
			read,
			FIXTURES_DIR,
			"pulse/prv_time_domain.json",
		);
		const atol = fixture.tolerances.atolMs;
		const rtol = fixture.tolerances.rtol;
		for (const testCase of fixture.cases) {
			const result = analyzePrv(testCase.input.ibisMs as number[]);
			const expected = testCase.expected;
			const timeDomain = result.timeDomain as Json;
			expect(timeDomain.ppIntervalCount).toBe(expected.ppIntervalCount);
			for (const key of [
				"meanNnMs",
				"sdnnMs",
				"rmssdMs",
				"sdsdMs",
				"sd1Ms",
				"sd2Ms",
			] as const) {
				optional(
					timeDomain[key],
					expected[key],
					{ rtol, atol },
					`${testCase.name} ${key}`,
				);
			}
			for (const key of [
				"pnn20Percent",
				"pnn50Percent",
				"meanPulseRateBpm",
			] as const) {
				optional(
					timeDomain[key],
					expected[key],
					{ rtol, atol: 1e-9 },
					`${testCase.name} ${key}`,
				);
			}
		}
	});

	test("prv_time_domain@1 still reproduces the retired hrv_time_domain fixture", () => {
		const fixture: GoldenFixture = loadGoldenFixture(
			read,
			FIXTURES_DIR,
			"pulse/hrv_time_domain.json",
		);
		const atol = fixture.tolerances.atolMs;
		for (const testCase of fixture.cases) {
			const result = analyzePrv(testCase.input.ibisMs as number[]);
			const timeDomain = result.timeDomain as Json;
			expect(timeDomain.ppIntervalCount).toBe(testCase.expected.ibiCount);
			for (const key of ["meanNnMs", "sdnnMs", "rmssdMs"] as const) {
				optional(
					timeDomain[key],
					testCase.expected[key],
					{ atol },
					`${testCase.name} ${key}`,
				);
			}
		}
	});

	test("prv_frequency_domain@1 matches the scipy oracle, withholding included", () => {
		const fixture: GoldenFixture = loadGoldenFixture(
			read,
			FIXTURES_DIR,
			"pulse/prv_frequency_domain.json",
		);
		const rtol = fixture.tolerances.rtol;
		const atol = fixture.tolerances.atolMs2;
		for (const testCase of fixture.cases) {
			const result = analyzePrv(testCase.input.ibisMs as number[]);
			const expected = testCase.expected;
			const band = result.frequencyDomain as Json;
			expect(band.ppIntervalCount).toBe(expected.ppIntervalCount);
			for (const key of ["lfMs2", "hfMs2"] as const) {
				optional(band[key], expected[key], { rtol, atol }, `${testCase.name} ${key}`);
			}
			optional(
				band.lfHfRatio,
				expected.lfHfRatio,
				{ rtol: fixture.tolerances.ratioRtol, atol: 1e-9 },
				`${testCase.name} lfHfRatio`,
			);
			// The REASON is part of the contract, not just the null.
			for (const key of [
				"lfWithheldReason",
				"hfWithheldReason",
				"ratioWithheldReason",
			] as const) {
				expect(`${testCase.name} ${key}=${String(band[key])}`).toBe(
					`${testCase.name} ${key}=${String(expected[key])}`,
				);
			}
		}
	});

	test("activation_epoch@1 matches the numpy oracle", () => {
		const fixture: GoldenFixture = loadGoldenFixture(
			read,
			FIXTURES_DIR,
			"activation/activation_epoch.json",
		);
		const rtol = fixture.tolerances.rtol;
		const atol = fixture.tolerances.atol;
		for (const testCase of fixture.cases) {
			const result = analyzeActivation(
				testCase.input.values as number[],
				testCase.input.sampleRateHz as number,
			);
			const expected = testCase.expected;
			expect(result.withheldReason ?? null).toBe(expected.withheldReason ?? null);

			const epoch = result.epoch as Json | null;
			const expectedEpoch = expected.epoch as Json | null;
			if (expectedEpoch === null) {
				expect(epoch).toBeNull();
				continue;
			}
			expect(epoch).not.toBeNull();
			for (const key of [
				"startSeconds",
				"endSeconds",
				"peakValue",
				"peakSeconds",
				"timeToPeakSeconds",
				"riseRatePerSecond",
				"areaAboveBaseline",
			] as const) {
				expectClose(
					(epoch as Json)[key] as number,
					expectedEpoch[key] as number,
					{ rtol, atol },
					`${testCase.name} epoch ${key}`,
				);
			}
			const recovery = (epoch as Json).recovery as Json | null;
			const expectedRecovery = expectedEpoch.recovery as Json | null;
			if (expectedRecovery === null) {
				expect(recovery).toBeNull();
				expect((epoch as Json).recoveryWithheldReason).toBe(
					expectedEpoch.recoveryWithheldReason,
				);
				continue;
			}
			expect(recovery).not.toBeNull();
			for (const key of [
				"timeToHalfRecoverySeconds",
				"timeToBaselineSeconds",
			] as const) {
				optional(
					(recovery as Json)[key],
					expectedRecovery[key],
					{ rtol, atol },
					`${testCase.name} recovery ${key}`,
				);
			}
			expect((recovery as Json).recoveryCompleted).toBe(
				expectedRecovery.recoveryCompleted,
			);
			expectClose(
				(recovery as Json).recoverySlopePerSecond as number,
				expectedRecovery.recoverySlopePerSecond as number,
				{ rtol, atol },
				`${testCase.name} recovery slope`,
			);
		}
	});

	test("the closed-form trapezoid case is reproduced exactly", () => {
		const fixture: GoldenFixture = loadGoldenFixture(
			read,
			FIXTURES_DIR,
			"activation/activation_epoch.json",
		);
		const testCase = fixture.cases.find(
			(c) => c.name === "piecewise_linear_trapezoid",
		);
		expect(testCase).toBeDefined();
		const analytic = (testCase as unknown as { analytic: Json }).analytic;
		const result = analyzeActivation(
			(testCase as GoldenFixture["cases"][number]).input.values as number[],
			1.0,
		);
		const epoch = result.epoch as Json;
		const recovery = epoch.recovery as Json;
		// Every one of these is a hand-computed value, not an oracle output.
		expect(epoch.peakValue).toBe(analytic.peakValue);
		expect(epoch.peakSeconds).toBe(analytic.peakSeconds);
		expect(epoch.timeToPeakSeconds).toBe(analytic.timeToPeakSeconds);
		expect(epoch.riseRatePerSecond).toBe(analytic.riseRatePerSecond);
		expect(epoch.areaAboveBaseline).toBe(analytic.areaAboveBaseline);
		expect(recovery.timeToHalfRecoverySeconds).toBe(
			analytic.timeToHalfRecoverySeconds,
		);
		expect(recovery.timeToBaselineSeconds).toBe(analytic.timeToBaselineSeconds);
	});

	test("provenance crosses the boundary on every payload", () => {
		const prvAnalyzer = new glue.WasmPrvAnalyzer(null);
		const prv = JSON.parse(
			prvAnalyzer.analyze_intervals(new Float64Array([800, 810, 795, 805])),
		) as Json;
		expect(prv.schema).toBe("elata.prv-summary/v1");
		expect(prv.configId).toBe(prvAnalyzer.config_id());
		expect(
			(prv.algorithmVersions as Record<string, string>).prv_time_domain,
		).toBe("prv_time_domain@1");
		prvAnalyzer.free();

		const activationAnalyzer = new glue.WasmActivationEpochAnalyzer(1.0, null);
		const activation = JSON.parse(
			activationAnalyzer.analyze_series(new Float64Array(new Array(400).fill(10))),
		) as Json;
		expect(activation.schema).toBe("elata.activation-epoch/v1");
		expect(activation.configId).toBe(activationAnalyzer.config_id());
		expect(
			(activation.algorithmVersions as Record<string, string>).activation_epoch,
		).toBe("activation_epoch@1");
		activationAnalyzer.free();
	});

	// -------------------------------------------- 2. WASM vs native Rust --

	const maybeNative = hasNative ? test : test.skip;

	/** Keys whose values pass through the FFT / a `cos` window. */
	const TRANSCENDENTAL_KEYS = new Set(["lfMs2", "hfMs2", "lfHfRatio"]);
	/** Measured worst case 2.3e-8 (libm `cos` ulps amplified by the FFT). */
	const FFT_RTOL = 1e-6;
	/** Measured worst case 2.2e-16 — one ulp, from FMA contraction. */
	const ARITHMETIC_RTOL = 1e-14;

	function compare(actual: unknown, expected: unknown, context: string): void {
		if (typeof expected === "number" && typeof actual === "number") {
			const key = context.slice(context.lastIndexOf(".") + 1);
			const rtol = TRANSCENDENTAL_KEYS.has(key) ? FFT_RTOL : ARITHMETIC_RTOL;
			expectClose(actual, expected, { rtol, atol: 1e-15 }, context);
			return;
		}
		if (expected !== null && typeof expected === "object") {
			expect(actual).not.toBeNull();
			expect(typeof actual).toBe("object");
			const expectedObject = expected as Json;
			const actualObject = actual as Json;
			expect(Object.keys(actualObject).sort()).toEqual(
				Object.keys(expectedObject).sort(),
			);
			for (const key of Object.keys(expectedObject)) {
				compare(actualObject[key], expectedObject[key], `${context}.${key}`);
			}
			return;
		}
		expect(`${context}=${String(actual)}`).toBe(`${context}=${String(expected)}`);
	}

	maybeNative("PRV: wasm32 agrees with native Rust to within an ulp", () => {
		const snapshot = JSON.parse(read(NATIVE_SNAPSHOT_PATH)) as {
			prv: { fixture: string; name: string; intervalsMs: number[]; result: Json }[];
		};
		expect(snapshot.prv.length).toBeGreaterThan(0);
		for (const entry of snapshot.prv) {
			const wasmResult = analyzePrv(entry.intervalsMs);
			compare(wasmResult, entry.result, `${entry.fixture}:${entry.name}`);
		}
	});

	maybeNative(
		"activation_epoch: wasm32 agrees with native Rust to within an ulp",
		() => {
			const snapshot = JSON.parse(read(NATIVE_SNAPSHOT_PATH)) as {
				activation: {
					name: string;
					values: number[];
					sampleRateHz: number;
					result: Json;
				}[];
			};
			expect(snapshot.activation.length).toBeGreaterThan(0);
			for (const entry of snapshot.activation) {
				const wasmResult = analyzeActivation(entry.values, entry.sampleRateHz);
				compare(wasmResult, entry.result, `activation:${entry.name}`);
			}
		},
	);
});
