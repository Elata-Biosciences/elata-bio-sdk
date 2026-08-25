/**
 * `score_readiness@1` — the daily number users will compare against Oura and
 * Muse, which is exactly why its refusal to answer matters more than its
 * formula.
 *
 * The minimum-history policy is the subject of the first block: fourteen
 * distinct qualified days spanning at least fourteen calendar days. Below
 * that the score is null with a counted shortfall, and the last block proves
 * that end to end — raw daily samples through `computeRollingBaseline` and
 * into the score — so the withhold cannot be an artefact of hand-built
 * baselines that a real pipeline would never produce.
 */

import type { PersonalBaseline } from "../insights/baseline.js";
import { sigmoid } from "../insights/contributors.js";
import {
	computeRollingBaseline,
	contextBucketForHour,
	DAY_MS,
	type DailyMetricSample,
	type HistoryCoverage,
} from "../insights/longitudinal.js";
import {
	READINESS_MIN_HISTORY_DAYS,
	READINESS_MIN_HISTORY_SPAN_DAYS,
	READINESS_MIN_MQ,
	scoreReadiness,
	type ReadinessInput,
} from "../insights/readiness.js";

const NOW = 1_760_000_000_000;
const MORNING_HOUR = 8;
const MORNING = contextBucketForHour(MORNING_HOUR);

function baseline(
	median: number,
	mad: number,
	contextBucket = MORNING,
	sessionCount = 20,
): PersonalBaseline {
	return {
		metricId: "m",
		contextBucket,
		median,
		mad,
		sessionCount,
		updatedAtMs: NOW,
	};
}

const metric = (
	value: number,
	median: number,
	mad: number,
	contextBucket = MORNING,
	quality = 0.9,
) => ({ value, baseline: baseline(median, mad, contextBucket), quality });

const absent = { value: null, baseline: null, quality: 0 };

function coverage(overrides: Partial<HistoryCoverage> = {}): HistoryCoverage {
	return {
		windowDays: 30,
		qualifiedSamples: 22,
		qualifiedDays: 22,
		spanDays: 28,
		rejectedForQuality: 0,
		rejectedAsOutlier: 0,
		...overrides,
	};
}

function input(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
	return {
		history: coverage(),
		localHour: MORNING_HOUR,
		restingHeartRate: metric(58, 62, 3),
		pulseRateVariability: metric(52, 44, 6),
		respirationRate: metric(13.5, 14.5, 1.2),
		activationBurden: metric(180, 260, 60, "any"),
		recentRecovery: metric(72, 64, 8, "any"),
		measurementQuality: 82,
		...overrides,
	};
}

describe("score_readiness@1 minimum-history policy", () => {
	test("three days of history withholds, with how many more days are needed", () => {
		const score = scoreReadiness(
			input({
				history: coverage({ qualifiedSamples: 3, qualifiedDays: 3, spanDays: 3 }),
			}),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_history");
		expect(score.withheldDetail).toEqual([
			{
				requirement: "qualified_days",
				have: 3,
				need: READINESS_MIN_HISTORY_DAYS,
			},
			{
				requirement: "span_days",
				have: 3,
				need: READINESS_MIN_HISTORY_SPAN_DAYS,
			},
		]);
	});

	test("history is checked before anything else, however perfect the reading", () => {
		// Every contributor is present, high quality, and correctly bucketed.
		const score = scoreReadiness(
			input({
				history: coverage({ qualifiedDays: 5, spanDays: 5 }),
				measurementQuality: 100,
			}),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_history");
		expect(score.contributors.every((c) => c.included)).toBe(true);
	});

	test("exactly the minimum history is admitted (boundary is inclusive)", () => {
		const score = scoreReadiness(
			input({
				history: coverage({
					qualifiedDays: READINESS_MIN_HISTORY_DAYS,
					spanDays: READINESS_MIN_HISTORY_SPAN_DAYS,
				}),
			}),
		);
		expect(score.value).not.toBeNull();
		expect(score.withheldDetail).toBeUndefined();
	});

	test("enough sessions crammed into too few days still withholds", () => {
		const score = scoreReadiness(
			input({
				history: coverage({ qualifiedSamples: 40, qualifiedDays: 20, spanDays: 6 }),
			}),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_history");
		expect(score.withheldDetail).toEqual([
			{
				requirement: "span_days",
				have: 6,
				need: READINESS_MIN_HISTORY_SPAN_DAYS,
			},
		]);
	});
});

describe("score_readiness@1 other withholds", () => {
	test("MQ below the floor withholds", () => {
		const score = scoreReadiness(
			input({ measurementQuality: READINESS_MIN_MQ - 1 }),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_quality");
	});

	test("too little baselined weight withholds insufficient_baseline", () => {
		const score = scoreReadiness(
			input({
				restingHeartRate: absent,
				pulseRateVariability: absent,
				respirationRate: absent,
			}),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_baseline");
	});

	test("no withheld path ever returns a number", () => {
		const cases: ReadinessInput[] = [
			input({ history: coverage({ qualifiedDays: 1, spanDays: 1 }) }),
			input({ measurementQuality: 0 }),
			input({
				restingHeartRate: absent,
				pulseRateVariability: absent,
				respirationRate: absent,
				activationBurden: absent,
				recentRecovery: absent,
			}),
		];
		for (const withheld of cases) {
			const score = scoreReadiness(withheld);
			expect(score.value).toBeNull();
			expect(score.withheldReason).toBeDefined();
			expect(score.value).not.toBe(50);
			expect(score.contributors.length).toBe(5);
		}
	});

	test("an out-of-range local hour is a contract violation, not a bucket guess", () => {
		expect(() => scoreReadiness(input({ localHour: 24 }))).toThrow(RangeError);
		expect(() => scoreReadiness(input({ localHour: -1 }))).toThrow(RangeError);
	});
});

describe("score_readiness@1 time of day selects the baseline, it does not adjust the score", () => {
	test("a morning reading against an all-day baseline is excluded, not tolerated", () => {
		const score = scoreReadiness(
			input({ restingHeartRate: metric(58, 62, 3, "any") }),
		);
		const rhr = score.contributors.find((c) => c.id === "resting-hr");
		expect(rhr?.included).toBe(false);
		expect(rhr?.excludedReason).toBe("baseline_context_mismatch");
	});

	test("all three physiological baselines from the wrong bucket withholds", () => {
		const score = scoreReadiness(
			input({
				restingHeartRate: metric(58, 62, 3, "evening"),
				pulseRateVariability: metric(52, 44, 6, "evening"),
				respirationRate: metric(13.5, 14.5, 1.2, "evening"),
			}),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_baseline");
	});

	test("the multi-day terms are not time-of-day bucketed", () => {
		// Activation burden and recent Recovery are 7-day aggregates; demanding
		// a morning bucket of them would be meaningless.
		const score = scoreReadiness(input({ localHour: 21 }));
		const burden = score.contributors.find((c) => c.id === "activation-burden");
		const recovery = score.contributors.find((c) => c.id === "recent-recovery");
		expect(burden?.included).toBe(true);
		expect(recovery?.included).toBe(true);
	});

	test("the same reading at a different hour is compared to a different baseline", () => {
		const evening = scoreReadiness(
			input({
				localHour: 21,
				restingHeartRate: metric(58, 62, 3, "evening"),
				pulseRateVariability: metric(52, 44, 6, "evening"),
				respirationRate: metric(13.5, 14.5, 1.2, "evening"),
			}),
		);
		// Same numbers, correctly bucketed both times: the bucket chooses the
		// comparison, it does not shift the answer by itself.
		expect(evening.value).toBe(scoreReadiness(input()).value);
	});
});

describe("score_readiness@1 composition", () => {
	const zOf = (value: number, median: number, mad: number) =>
		(value - median) / (1.4826 * mad);

	const zRhr = -zOf(58, 62, 3);
	const zPrv = zOf(52, 44, 6);
	const zResp = -zOf(13.5, 14.5, 1.2);
	const zBurden = -zOf(180, 260, 60);
	const zRecovery = zOf(72, 64, 8);

	test("the documented weights produce the documented value", () => {
		const score = scoreReadiness(input());
		const weighted =
			0.25 * zRhr + 0.3 * zPrv + 0.15 * zResp + 0.15 * zBurden + 0.15 * zRecovery;
		expect(score.value).toBe(Math.round(100 * sigmoid(0.8 * weighted)));
		expect(score.scoreId).toBe("elata.readiness");
		expect(score.formulaVersion).toBe("score_readiness@1");
		expect(
			score.contributors.reduce((sum, c) => sum + c.weight, 0),
		).toBeCloseTo(1, 10);
	});

	test("weights renormalize over the included subset, not around a neutral fill", () => {
		const score = scoreReadiness(input({ recentRecovery: absent }));
		const renormalized =
			(0.25 * zRhr + 0.3 * zPrv + 0.15 * zResp + 0.15 * zBurden) / 0.85;
		const neutralFill =
			0.25 * zRhr + 0.3 * zPrv + 0.15 * zResp + 0.15 * zBurden + 0.15 * 0;
		expect(score.value).toBe(Math.round(100 * sigmoid(0.8 * renormalized)));
		expect(Math.round(100 * sigmoid(0.8 * renormalized))).not.toBe(
			Math.round(100 * sigmoid(0.8 * neutralFill)),
		);
		expect(score.value).not.toBe(Math.round(100 * sigmoid(0.8 * neutralFill)));
	});

	test("a withheld recent Recovery is dropped, never read as a mid-range one", () => {
		// Recovery withholds a lot; if a null were mapped to 50 it would drag
		// every Readiness toward the middle.
		const withheld = scoreReadiness(input({ recentRecovery: absent }));
		const midRange = scoreReadiness(input({ recentRecovery: metric(64, 64, 8, "any") }));
		expect(withheld.value).not.toBe(midRange.value);
		const contributor = withheld.contributors.find(
			(c) => c.id === "recent-recovery",
		);
		expect(contributor?.included).toBe(false);
		expect(contributor?.excludedReason).toBe("inputs_missing");
	});

	test("directions: lower resting HR and higher PRV read as more ready", () => {
		const rested = scoreReadiness(input());
		const strained = scoreReadiness(
			input({
				restingHeartRate: metric(68, 62, 3),
				pulseRateVariability: metric(33, 44, 6),
				respirationRate: metric(16.5, 14.5, 1.2),
			}),
		);
		expect(rested.value as number).toBeGreaterThan(strained.value as number);
		expect(strained.value as number).toBeLessThan(50);
	});

	test("a heavy recent activation burden lowers the score", () => {
		const heavy = scoreReadiness(
			input({ activationBurden: metric(430, 260, 60, "any") }),
		);
		expect(heavy.value as number).toBeLessThan(scoreReadiness(input()).value as number);
	});

	test("MQ always travels with the score", () => {
		expect(scoreReadiness(input()).measurementQuality).toBe(82);
		expect(
			scoreReadiness(
				input({
					history: coverage({ qualifiedDays: 2, spanDays: 2 }),
					measurementQuality: 55,
				}),
			).measurementQuality,
		).toBe(55);
	});
});

describe("score_readiness@1 end to end from raw daily samples", () => {
	function samples(
		values: readonly number[],
		startDaysAgo = 0,
	): DailyMetricSample[] {
		return values.map((value, index) => ({
			atEpochMs: NOW - (startDaysAgo + index) * DAY_MS,
			value,
			quality: 0.9,
		}));
	}

	function rolling(metricId: string, values: readonly number[]) {
		return computeRollingBaseline({
			metricId,
			contextBucket: MORNING,
			samples: samples(values),
			nowEpochMs: NOW,
			minDays: 1,
			minSpanDays: 1,
		});
	}

	const hrValues = Array.from({ length: 20 }, (_, i) => 61 + (i % 5));
	const prvValues = Array.from({ length: 20 }, (_, i) => 43 + (i % 5));
	const respValues = Array.from({ length: 20 }, (_, i) => 14 + (i % 3) * 0.5);

	test("real rolling baselines drive a real score", () => {
		const hr = rolling("pulse.heart_rate", hrValues);
		const prv = rolling("pulse.rmssd", prvValues);
		const resp = rolling("pulse.respiration_rate", respValues);

		const score = scoreReadiness(
			input({
				history: hr.coverage,
				restingHeartRate: { value: 58, baseline: hr.baseline, quality: 0.9 },
				pulseRateVariability: { value: 52, baseline: prv.baseline, quality: 0.9 },
				respirationRate: { value: 13.5, baseline: resp.baseline, quality: 0.9 },
			}),
		);
		expect(hr.coverage.qualifiedDays).toBe(20);
		expect(score.value).not.toBeNull();
		expect(score.withheldReason).toBeUndefined();
		expect(score.contributors.every((c) => c.included)).toBe(true);
	});

	test("three days of real samples withholds on history, not on baselines", () => {
		// The distinction matters: "come back in eleven days" is a different
		// message from "your baselines are unusable".
		const hr = computeRollingBaseline({
			metricId: "pulse.heart_rate",
			contextBucket: MORNING,
			samples: samples([61, 63, 62]),
			nowEpochMs: NOW,
		});
		expect(hr.baseline).toBeNull();

		const score = scoreReadiness(
			input({
				history: hr.coverage,
				restingHeartRate: { value: 58, baseline: hr.baseline, quality: 0.9 },
				pulseRateVariability: absent,
				respirationRate: absent,
			}),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_history");
		expect(score.withheldDetail?.[0]).toEqual({
			requirement: "qualified_days",
			have: 3,
			need: READINESS_MIN_HISTORY_DAYS,
		});
	});
});
