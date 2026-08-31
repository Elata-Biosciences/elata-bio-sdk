/**
 * `score_resilience@1` — regulation capacity over weeks.
 *
 * Resilience is the score with the longest runway before it can say
 * anything, so almost all of the behaviour worth testing is refusal. The
 * requirement it has to meet is not just "withhold", but withhold with a
 * shortfall specific enough to tell the user what is still missing: more
 * days, a longer span, or more activations to have recovered from.
 */

import type { PersonalBaseline } from "../insights/baseline.js";
import { sigmoid } from "../insights/contributors.js";
import type { HistoryCoverage } from "../insights/longitudinal.js";
import {
	RESILIENCE_MIN_EPISODES,
	RESILIENCE_MIN_HISTORY_DAYS,
	RESILIENCE_MIN_HISTORY_SPAN_DAYS,
	RESILIENCE_MIN_MQ,
	scoreResilience,
	type ResilienceInput,
} from "../insights/resilience.js";

function baseline(median: number, mad: number, sessionCount = 30): PersonalBaseline {
	return {
		metricId: "m",
		contextBucket: "any",
		median,
		mad,
		sessionCount,
		updatedAtMs: 0,
	};
}

const metric = (value: number, median: number, mad: number, quality = 0.9) => ({
	value,
	baseline: baseline(median, mad),
	quality,
});

const absent = { value: null, baseline: null, quality: 0 };

function coverage(overrides: Partial<HistoryCoverage> = {}): HistoryCoverage {
	return {
		windowDays: 30,
		qualifiedSamples: 26,
		qualifiedDays: 26,
		spanDays: 29,
		rejectedForQuality: 0,
		rejectedAsOutlier: 0,
		...overrides,
	};
}

function input(overrides: Partial<ResilienceInput> = {}): ResilienceInput {
	return {
		history: coverage(),
		recoveredActivationEpisodes: 11,
		recoverySpeedTrend: metric(-1.8, -0.2, 0.8),
		prolongedActivationRate: metric(0.1, 0.22, 0.06),
		baselineStability: metric(0.88, 0.8, 0.05),
		autonomicFlexibility: metric(0.62, 0.5, 0.06),
		measurementQuality: 76,
		...overrides,
	};
}

describe("score_resilience@1 minimum-history policy", () => {
	test("two weeks of history withholds and says how much more is needed", () => {
		const score = scoreResilience(
			input({
				history: coverage({ qualifiedSamples: 14, qualifiedDays: 14, spanDays: 14 }),
				recoveredActivationEpisodes: 4,
			}),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_history");
		expect(score.withheldDetail).toEqual([
			{
				requirement: "qualified_days",
				have: 14,
				need: RESILIENCE_MIN_HISTORY_DAYS,
			},
			{
				requirement: "span_days",
				have: 14,
				need: RESILIENCE_MIN_HISTORY_SPAN_DAYS,
			},
			{
				requirement: "recovered_activation_episodes",
				have: 4,
				need: RESILIENCE_MIN_EPISODES,
			},
		]);
	});

	test("weeks of calm data are still not enough: recovery needs activations", () => {
		// Plenty of days, nothing to have recovered from. Reporting a
		// regulation-capacity number here would be reporting nothing.
		const score = scoreResilience(
			input({ recoveredActivationEpisodes: RESILIENCE_MIN_EPISODES - 1 }),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_history");
		expect(score.withheldDetail).toEqual([
			{
				requirement: "recovered_activation_episodes",
				have: RESILIENCE_MIN_EPISODES - 1,
				need: RESILIENCE_MIN_EPISODES,
			},
		]);
	});

	test("exactly the minimum history and episode count is admitted", () => {
		const score = scoreResilience(
			input({
				history: coverage({
					qualifiedDays: RESILIENCE_MIN_HISTORY_DAYS,
					spanDays: RESILIENCE_MIN_HISTORY_SPAN_DAYS,
				}),
				recoveredActivationEpisodes: RESILIENCE_MIN_EPISODES,
			}),
		);
		expect(score.value).not.toBeNull();
		expect(score.withheldDetail).toBeUndefined();
	});

	test("three intense weeks crammed into one still withholds on span", () => {
		const score = scoreResilience(
			input({
				history: coverage({ qualifiedSamples: 40, qualifiedDays: 24, spanDays: 8 }),
			}),
		);
		expect(score.value).toBeNull();
		expect(score.withheldDetail).toEqual([
			{
				requirement: "span_days",
				have: 8,
				need: RESILIENCE_MIN_HISTORY_SPAN_DAYS,
			},
		]);
	});

	test("history is checked before quality and before any arithmetic", () => {
		const score = scoreResilience(
			input({
				history: coverage({ qualifiedDays: 3, spanDays: 3 }),
				measurementQuality: 100,
			}),
		);
		expect(score.withheldReason).toBe("insufficient_history");
		expect(score.contributors.every((c) => c.included)).toBe(true);
	});
});

describe("score_resilience@1 other withholds", () => {
	test("MQ below the floor withholds", () => {
		const score = scoreResilience(
			input({ measurementQuality: RESILIENCE_MIN_MQ - 1 }),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_quality");
	});

	test("no longitudinal baselines yet is insufficient_baseline, a different message", () => {
		// Enough history to compute this window's terms, not yet enough to
		// compare them to the person's own earlier windows. "Come back in N
		// days" would be the wrong thing to say here.
		const score = scoreResilience(
			input({
				recoverySpeedTrend: { value: -1.8, baseline: null, quality: 0.9 },
				prolongedActivationRate: { value: 0.1, baseline: null, quality: 0.9 },
				baselineStability: { value: 0.88, baseline: null, quality: 0.9 },
			}),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_baseline");
		expect(score.withheldDetail).toBeUndefined();
	});

	test("no withheld path ever returns a number", () => {
		const cases: ResilienceInput[] = [
			input({ history: coverage({ qualifiedDays: 2, spanDays: 2 }) }),
			input({ recoveredActivationEpisodes: 0 }),
			input({ measurementQuality: 0 }),
			input({
				recoverySpeedTrend: absent,
				prolongedActivationRate: absent,
				baselineStability: absent,
			}),
		];
		for (const withheld of cases) {
			const score = scoreResilience(withheld);
			expect(score.value).toBeNull();
			expect(score.withheldReason).toBeDefined();
			expect(score.value).not.toBe(50);
			expect(score.contributors.length).toBe(4);
			expect(score.measurementQuality).toBe(withheld.measurementQuality);
		}
	});
});

describe("score_resilience@1 composition", () => {
	const zOf = (value: number, median: number, mad: number) =>
		(value - median) / (1.4826 * mad);

	const zTrend = -zOf(-1.8, -0.2, 0.8);
	const zProlonged = -zOf(0.1, 0.22, 0.06);
	const zStability = zOf(0.88, 0.8, 0.05);
	const zFlexibility = zOf(0.62, 0.5, 0.06);

	test("the documented weights produce the documented value", () => {
		const score = scoreResilience(input());
		const weighted =
			0.3 * zTrend + 0.25 * zProlonged + 0.2 * zStability + 0.25 * zFlexibility;
		expect(score.value).toBe(Math.round(100 * sigmoid(0.8 * weighted)));
		expect(score.scoreId).toBe("elata.resilience");
		expect(score.formulaVersion).toBe("score_resilience@1");
		expect(
			score.contributors.reduce((sum, c) => sum + c.weight, 0),
		).toBeCloseTo(1, 10);
	});

	test("weights renormalize over the included subset, not around a neutral fill", () => {
		const score = scoreResilience(input({ baselineStability: absent }));
		const renormalized =
			(0.3 * zTrend + 0.25 * zProlonged + 0.25 * zFlexibility) / 0.8;
		const neutralFill =
			0.3 * zTrend + 0.25 * zProlonged + 0.2 * 0 + 0.25 * zFlexibility;
		expect(score.value).toBe(Math.round(100 * sigmoid(0.8 * renormalized)));
		expect(Math.round(100 * sigmoid(0.8 * renormalized))).not.toBe(
			Math.round(100 * sigmoid(0.8 * neutralFill)),
		);
		expect(score.value).not.toBe(Math.round(100 * sigmoid(0.8 * neutralFill)));
	});

	test("directions: recovering faster over time reads as more resilient", () => {
		const improving = scoreResilience(input());
		const worsening = scoreResilience(
			input({ recoverySpeedTrend: metric(1.4, -0.2, 0.8) }),
		);
		expect(improving.value as number).toBeGreaterThan(worsening.value as number);
	});

	test("directions: more prolonged activations and a drifting baseline read lower", () => {
		const steady = scoreResilience(input());
		const prolonged = scoreResilience(
			input({ prolongedActivationRate: metric(0.45, 0.22, 0.06) }),
		);
		const drifting = scoreResilience(
			input({ baselineStability: metric(0.6, 0.8, 0.05) }),
		);
		const rigid = scoreResilience(
			input({ autonomicFlexibility: metric(0.3, 0.5, 0.06) }),
		);
		expect(steady.value as number).toBeGreaterThan(prolonged.value as number);
		expect(steady.value as number).toBeGreaterThan(drifting.value as number);
		expect(steady.value as number).toBeGreaterThan(rigid.value as number);
	});

	test("a person regulating worse across the board scores below the midpoint", () => {
		const struggling = scoreResilience(
			input({
				recoverySpeedTrend: metric(1.4, -0.2, 0.8),
				prolongedActivationRate: metric(0.45, 0.22, 0.06),
				baselineStability: metric(0.6, 0.8, 0.05),
				autonomicFlexibility: metric(0.3, 0.5, 0.06),
			}),
		);
		expect(struggling.value as number).toBeLessThan(50);
	});

	test("every contributor exposes weight, z and quality", () => {
		const score = scoreResilience(input());
		for (const contributor of score.contributors) {
			expect(typeof contributor.weight).toBe("number");
			expect(typeof contributor.quality).toBe("number");
			if (contributor.included) expect(typeof contributor.z).toBe("number");
			else expect(contributor.excludedReason).toBeDefined();
		}
	});

	test("MQ always travels with the score", () => {
		expect(scoreResilience(input()).measurementQuality).toBe(76);
		expect(
			scoreResilience(input({ recoveredActivationEpisodes: 0, measurementQuality: 61 }))
				.measurementQuality,
		).toBe(61);
	});
});
