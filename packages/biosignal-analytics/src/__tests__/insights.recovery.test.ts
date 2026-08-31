/**
 * `score_recovery@2` — the score over a real `activation_epoch@1` analysis.
 *
 * The withholding cases come first on purpose. Recovery is the score most
 * likely to be asked for when there is nothing to answer with: no activation
 * happened, or one did and the recording stopped before it came back down.
 * Both must say so.
 *
 * The last block feeds the Rust engine's own golden fixture through the
 * score, so the TypeScript input contract is checked against the shape the
 * engine actually emits rather than against a shape invented here. It skips
 * with a note if that fixture has not landed yet.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { PersonalBaseline } from "../insights/baseline.js";
import { sigmoid } from "../insights/contributors.js";
import type { ActivationEpochAnalysisV1 } from "../insights/activationEpoch.js";
import {
	ACTIVATION_EPOCH_MIN_DELTA_BPM,
	detectActivationEpoch,
	RECOVERY_MIN_MQ,
	scoreRecovery,
	type RecoveryInput,
} from "../insights/recovery.js";

function baseline(median: number, mad: number, sessionCount = 10): PersonalBaseline {
	return {
		metricId: "m",
		contextBucket: "any",
		median,
		mad,
		sessionCount,
		updatedAtMs: 0,
	};
}

/** A complete, recovered activation in the `activation_epoch@1` shape. */
function analysis(
	overrides: Partial<ActivationEpochAnalysisV1> = {},
	recoveryOverrides: Partial<
		NonNullable<NonNullable<ActivationEpochAnalysisV1["epoch"]>["recovery"]>
	> = {},
): ActivationEpochAnalysisV1 {
	return {
		sampleRateHz: 1,
		sampleCount: 400,
		durationSeconds: 400,
		baseline: {
			startSeconds: 0,
			endSeconds: 59,
			sampleCount: 60,
			level: 10,
			scale: 1,
			activationThreshold: 12,
		},
		epoch: {
			startSeconds: 101,
			endSeconds: 339,
			durationSeconds: 238,
			sampleCount: 239,
			peakValue: 50,
			peakSeconds: 140,
			timeToPeakSeconds: 39,
			riseRatePerSecond: 1,
			areaAboveBaseline: 5599.375,
			recovery: {
				observedSeconds: 259,
				halfRecoveryTarget: 30,
				baselineReturnTarget: 14,
				timeToHalfRecoverySeconds: 120,
				timeToBaselineSeconds: 184,
				recoveryCompleted: true,
				recoverySlopePerSecond: -0.1956521739130435,
				residualFraction: 0,
				...recoveryOverrides,
			},
			recoveryWithheldReason: null,
		},
		withheldReason: null,
		...overrides,
	};
}

const baselines = {
	timeToHalfRecoveryS: baseline(150, 30),
	recoverySlopePerSecond: baseline(-0.12, 0.04),
	timeToBaselineS: baseline(240, 50),
};

function input(overrides: Partial<RecoveryInput> = {}): RecoveryInput {
	return {
		analysis: analysis(),
		baselines,
		epochQuality: 0.9,
		rmssdRebound: { value: 1.15, baseline: baseline(1.0, 0.08), quality: 0.9 },
		alphaRebound: { value: 1.1, baseline: baseline(1.0, 0.1), quality: 0.8 },
		measurementQuality: 80,
		...overrides,
	};
}

describe("score_recovery@2 withholding", () => {
	test("no analysis at all is inputs_missing, never a neutral 50", () => {
		const score = scoreRecovery(input({ analysis: null }));
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("inputs_missing");
		// Drill-down is still emitted so the UI can show what was and wasn't there.
		expect(score.contributors.length).toBe(5);
	});

	test("an engine that could not even establish a baseline is inputs_missing", () => {
		for (const reason of ["insufficientSamples", "baselineTooShort"] as const) {
			const score = scoreRecovery(
				input({
					analysis: analysis({
						baseline: null,
						epoch: null,
						withheldReason: reason,
					}),
				}),
			);
			expect(score.value).toBeNull();
			expect(score.withheldReason).toBe("inputs_missing");
		}
	});

	test("a session where nothing qualified as activation is no_activation_detected", () => {
		const score = scoreRecovery(
			input({
				analysis: analysis({
					epoch: null,
					withheldReason: "noQualifyingActivation",
				}),
			}),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("no_activation_detected");
	});

	test("recording ended before recovery could be observed is recovery_incomplete", () => {
		// `peak_at_recording_end`: the engine emits an epoch but no recovery block.
		const truncated = analysis();
		const score = scoreRecovery(
			input({
				analysis: {
					...truncated,
					epoch: {
						...truncated.epoch!,
						recovery: null,
						recoveryWithheldReason: "postEpochWindowTooShort",
					},
				},
			}),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("recovery_incomplete");
	});

	test("an activation that never came back down is recovery_incomplete", () => {
		// `plateau_never_recovers`: a recovery block exists, but half recovery
		// was never reached, so there is no recovery to rate.
		const score = scoreRecovery(
			input({
				analysis: analysis(
					{},
					{
						timeToHalfRecoverySeconds: null,
						timeToBaselineSeconds: null,
						recoveryCompleted: false,
						recoverySlopePerSecond: 0,
						residualFraction: 1,
					},
				),
			}),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("recovery_incomplete");
	});

	test("MQ below the floor withholds even with a textbook recovery", () => {
		const score = scoreRecovery(
			input({ measurementQuality: RECOVERY_MIN_MQ - 1 }),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_quality");
		expect(score.measurementQuality).toBe(RECOVERY_MIN_MQ - 1);
	});

	test("MQ exactly at the floor is admitted (boundary is inclusive)", () => {
		const score = scoreRecovery(input({ measurementQuality: RECOVERY_MIN_MQ }));
		expect(score.value).not.toBeNull();
	});

	test("too little baselined weight withholds insufficient_baseline", () => {
		// Only the alpha rebound (0.10) has a usable baseline.
		const score = scoreRecovery(
			input({
				baselines: {
					timeToHalfRecoveryS: null,
					recoverySlopePerSecond: null,
					timeToBaselineS: null,
				},
				rmssdRebound: { value: 1.15, baseline: null, quality: 0.9 },
			}),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_baseline");
	});

	test("a low-quality epoch excludes every epoch-derived contributor", () => {
		const score = scoreRecovery(input({ epochQuality: 0.2 }));
		for (const id of ["time-to-half", "recovery-slope", "time-to-baseline"]) {
			const contributor = score.contributors.find((c) => c.id === id);
			expect(contributor?.included).toBe(false);
			expect(contributor?.excludedReason).toBe("insufficient_quality");
		}
		// Remaining weight is 0.30 < the 0.5 floor.
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_baseline");
	});

	test("no withheld path ever returns a number", () => {
		const withheldInputs: RecoveryInput[] = [
			input({ analysis: null }),
			input({
				analysis: analysis({ epoch: null, withheldReason: "noQualifyingActivation" }),
			}),
			input({ measurementQuality: 0 }),
			input({ epochQuality: 0 }),
		];
		for (const withheld of withheldInputs) {
			const score = scoreRecovery(withheld);
			expect(score.value).toBeNull();
			expect(score.withheldReason).toBeDefined();
			expect(score.value).not.toBe(50);
		}
	});
});

describe("score_recovery@2 composition", () => {
	const zOf = (value: number, median: number, mad: number) =>
		(value - median) / (1.4826 * mad);

	const zHalf = -zOf(120, 150, 30);
	const zSlope = -zOf(-0.1956521739130435, -0.12, 0.04);
	const zToBaseline = -zOf(184, 240, 50);
	const zRmssd = zOf(1.15, 1.0, 0.08);
	const zAlpha = zOf(1.1, 1.0, 0.1);

	test("the documented weights produce the documented value", () => {
		const score = scoreRecovery(input());
		const weighted =
			0.3 * zHalf + 0.25 * zSlope + 0.15 * zToBaseline + 0.2 * zRmssd + 0.1 * zAlpha;
		expect(score.value).toBe(Math.round(100 * sigmoid(0.8 * weighted)));
		expect(score.formulaVersion).toBe("score_recovery@2");
		expect(score.scoreId).toBe("elata.recovery");
		expect(score.contributors.every((c) => c.included)).toBe(true);
	});

	test("a fast, complete recovery scores above the midpoint", () => {
		// Every contributor points the same way; the direction of the score is
		// the part a sign error would break silently.
		expect(scoreRecovery(input()).value).toBeGreaterThan(50);
	});

	test("a slow recovery scores below the midpoint", () => {
		const slow = scoreRecovery(
			input({
				analysis: analysis(
					{},
					{
						timeToHalfRecoverySeconds: 240,
						timeToBaselineSeconds: 380,
						recoverySlopePerSecond: -0.02,
					},
				),
				rmssdRebound: { value: 0.8, baseline: baseline(1.0, 0.08), quality: 0.9 },
				alphaRebound: { value: 0.85, baseline: baseline(1.0, 0.1), quality: 0.8 },
			}),
		);
		expect(slow.value).not.toBeNull();
		expect(slow.value as number).toBeLessThan(50);
	});

	test("a steeper (more negative) slope is a better recovery", () => {
		const steeper = scoreRecovery(
			input({ analysis: analysis({}, { recoverySlopePerSecond: -0.4 }) }),
		);
		const shallower = scoreRecovery(
			input({ analysis: analysis({}, { recoverySlopePerSecond: -0.05 }) }),
		);
		expect(steeper.value as number).toBeGreaterThan(shallower.value as number);
	});

	test("a partial recovery still scores, without the time-to-baseline term", () => {
		const partial = scoreRecovery(
			input({
				analysis: analysis(
					{},
					{
						timeToBaselineSeconds: null,
						recoveryCompleted: false,
						residualFraction: 0.3,
					},
				),
			}),
		);
		expect(partial.value).not.toBeNull();
		const ttb = partial.contributors.find((c) => c.id === "time-to-baseline");
		expect(ttb?.included).toBe(false);
		expect(ttb?.excludedReason).toBe("inputs_missing");
	});

	test("weights renormalize over the included subset, not around a neutral fill", () => {
		const withoutTtb = scoreRecovery(
			input({
				analysis: analysis({}, { timeToBaselineSeconds: null }),
			}),
		);
		const renormalized =
			(0.3 * zHalf + 0.25 * zSlope + 0.2 * zRmssd + 0.1 * zAlpha) / 0.85;
		const neutralFill =
			0.3 * zHalf + 0.25 * zSlope + 0.15 * 0 + 0.2 * zRmssd + 0.1 * zAlpha;

		expect(withoutTtb.value).toBe(Math.round(100 * sigmoid(0.8 * renormalized)));
		// The neutral-fill answer is a genuinely different number, so this
		// assertion has teeth rather than being trivially satisfied.
		expect(Math.round(100 * sigmoid(0.8 * renormalized))).not.toBe(
			Math.round(100 * sigmoid(0.8 * neutralFill)),
		);
		expect(withoutTtb.value).not.toBe(Math.round(100 * sigmoid(0.8 * neutralFill)));
	});

	test("every contributor exposes its weight, z and quality", () => {
		const score = scoreRecovery(input());
		const total = score.contributors.reduce((sum, c) => sum + c.weight, 0);
		expect(total).toBeCloseTo(1, 10);
		for (const contributor of score.contributors) {
			expect(typeof contributor.weight).toBe("number");
			expect(typeof contributor.quality).toBe("number");
			expect(contributor.metricId).toMatch(/^[a-z]/);
			if (contributor.included) expect(typeof contributor.z).toBe("number");
		}
	});

	test("MQ always travels with the score, withheld or not", () => {
		expect(scoreRecovery(input()).measurementQuality).toBe(80);
		expect(
			scoreRecovery(input({ analysis: null, measurementQuality: 71 }))
				.measurementQuality,
		).toBe(71);
	});
});

describe("score_recovery@2 against the activation_epoch@1 golden fixture", () => {
	const fixturePath = path.resolve(
		__dirname,
		"..",
		"..",
		"fixtures",
		"activation",
		"activation_epoch.json",
	);
	const present = fs.existsSync(fixturePath);
	const cases: { name: string; expected: ActivationEpochAnalysisV1 }[] = present
		? (
				JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
					cases: { name: string; expected: ActivationEpochAnalysisV1 }[];
				}
			).cases
		: [];

	// The Rust engine owns activation_epoch@1; this asserts the TS input
	// contract lines up with what it emits. Skipped with a note until it lands.
	const maybe = present ? test : test.skip;

	maybe("every fixture case maps to a score or an explained withhold", () => {
		expect(cases.length).toBeGreaterThan(0);
		for (const testCase of cases) {
			const score = scoreRecovery(input({ analysis: testCase.expected }));
			if (score.value === null) {
				expect(score.withheldReason).toBeDefined();
			} else {
				expect(score.value).toBeGreaterThanOrEqual(0);
				expect(score.value).toBeLessThanOrEqual(100);
			}
			expect(score.contributors.length).toBe(5);
		}
	});

	maybe("the engine's own withhold reasons map to score withholds", () => {
		const byName = new Map(cases.map((c) => [c.name, c.expected]));
		const expectations: [string, string][] = [
			["flat_noise_no_activation", "no_activation_detected"],
			["brief_spike_below_sustain_floor", "no_activation_detected"],
			["baseline_too_short", "inputs_missing"],
			["single_sample", "inputs_missing"],
			["empty", "inputs_missing"],
			["plateau_never_recovers", "recovery_incomplete"],
			["peak_at_recording_end", "recovery_incomplete"],
		];
		for (const [name, reason] of expectations) {
			const analysisCase = byName.get(name);
			if (analysisCase === undefined) continue;
			const score = scoreRecovery(input({ analysis: analysisCase }));
			expect([name, score.value]).toEqual([name, null]);
			expect([name, score.withheldReason]).toEqual([name, reason]);
		}
	});

	maybe("a clean recovered activation from the fixture scores", () => {
		const clean = cases.find((c) => c.name === "piecewise_linear_trapezoid");
		if (clean === undefined) return;
		const score = scoreRecovery(input({ analysis: clean.expected }));
		expect(score.value).not.toBeNull();
		expect(score.withheldReason).toBeUndefined();
	});
});

describe("detectActivationEpoch", () => {
	const hrBaseline = baseline(60, 3);
	const trace = [
		{ tUs: 0, bpm: 61 },
		{ tUs: 1_000_000, bpm: 72 },
		{ tUs: 2_000_000, bpm: 88 },
		{ tUs: 3_000_000, bpm: 75 },
		{ tUs: 4_000_000, bpm: 59 },
	];

	test("finds the contiguous above-median span around the peak", () => {
		expect(detectActivationEpoch(trace, hrBaseline)).toEqual({
			startUs: 0,
			endUs: 3_000_000,
			peakBpm: 88,
		});
	});

	test("returns null when the peak misses median + 5 bpm", () => {
		const flat = trace.map((point) => ({ ...point, bpm: 62 }));
		expect(detectActivationEpoch(flat, hrBaseline)).toBeNull();
		expect(detectActivationEpoch(trace, null)).toBeNull();
		expect(detectActivationEpoch([], hrBaseline)).toBeNull();
		expect(ACTIVATION_EPOCH_MIN_DELTA_BPM).toBe(5);
	});
});
