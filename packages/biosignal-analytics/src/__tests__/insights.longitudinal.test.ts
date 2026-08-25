/**
 * Rolling personal baselines (`rolling_baseline@1`) — the longitudinal layer
 * Readiness and Resilience stand on.
 *
 * The withholding behaviour is the point of these tests: a rolling baseline
 * built from three days of data must say so rather than hand back a confident
 * median. Outlier handling is asserted by construction (a spike must not move
 * the median) rather than by a hard-coded number.
 */

import { percentileSorted } from "../statistics/summary.js";
import { MAD_SCALE } from "../statistics/robust.js";
import { isBaselineUsable, robustZFromBaseline } from "../insights/baseline.js";
import { buildContributor } from "../insights/contributors.js";
import {
	computeRollingBaseline,
	contextBucketForHour,
	DAY_MS,
	describePersonalRange,
	HAMPEL_OUTLIER_Z,
	ROLLING_BASELINE_MIN_DAYS,
	ROLLING_BASELINE_MIN_QUALITY,
	ROLLING_BASELINE_MIN_SPAN_DAYS,
	ROLLING_BASELINE_WINDOW_DAYS,
	type DailyMetricSample,
} from "../insights/longitudinal.js";

const NOW = 1_760_000_000_000;

/** One sample per day, `days` days back from NOW, newest first. */
function dailySamples(
	values: readonly number[],
	quality = 1,
	startDaysAgo = 0,
): DailyMetricSample[] {
	return values.map((value, index) => ({
		atEpochMs: NOW - (startDaysAgo + index) * DAY_MS,
		value,
		quality,
	}));
}

const build = (samples: readonly DailyMetricSample[], overrides = {}) =>
	computeRollingBaseline({
		metricId: "pulse.heart_rate",
		contextBucket: "morning",
		samples,
		nowEpochMs: NOW,
		...overrides,
	});

describe("computeRollingBaseline withholding", () => {
	test("no samples at all withholds inputs_missing, not a median of nothing", () => {
		const result = build([]);
		expect(result.baseline).toBeNull();
		expect(result.withheldReason).toBe("inputs_missing");
		expect(result.coverage.qualifiedSamples).toBe(0);
		expect(result.coverage.qualifiedDays).toBe(0);
	});

	test("three days of data withholds insufficient_history with a shortfall", () => {
		const result = build(dailySamples([60, 62, 61]));
		expect(result.baseline).toBeNull();
		expect(result.withheldReason).toBe("insufficient_history");
		const days = result.shortfall?.find((s) => s.requirement === "qualified_days");
		expect(days).toEqual({
			requirement: "qualified_days",
			have: 3,
			need: ROLLING_BASELINE_MIN_DAYS,
		});
		const span = result.shortfall?.find((s) => s.requirement === "span_days");
		expect(span).toEqual({
			requirement: "span_days",
			have: 3,
			need: ROLLING_BASELINE_MIN_SPAN_DAYS,
		});
	});

	test("exactly the minimum day count is admitted (boundary is inclusive)", () => {
		const values = Array.from(
			{ length: ROLLING_BASELINE_MIN_DAYS },
			(_, i) => 60 + i,
		);
		const result = build(dailySamples(values));
		expect(result.withheldReason).toBeUndefined();
		expect(result.baseline).not.toBeNull();
		expect(result.coverage.qualifiedDays).toBe(ROLLING_BASELINE_MIN_DAYS);
	});

	test("many samples crammed into few days fail the span requirement", () => {
		// 12 samples, all inside 2 calendar days: enough rows, not enough history.
		const samples: DailyMetricSample[] = [];
		for (let i = 0; i < 12; i++) {
			samples.push({
				atEpochMs: NOW - (i % 2) * DAY_MS - i * 60_000,
				value: 60 + i,
				quality: 1,
			});
		}
		const result = build(samples);
		expect(result.baseline).toBeNull();
		expect(result.withheldReason).toBe("insufficient_history");
		expect(result.coverage.qualifiedSamples).toBe(12);
		expect(result.coverage.qualifiedDays).toBe(2);
	});

	test("samples older than the window do not rescue a thin recent window", () => {
		const recent = dailySamples([60, 61, 62]);
		const ancient = dailySamples(
			[58, 59, 60, 61, 62, 63, 64, 65, 66, 67],
			1,
			ROLLING_BASELINE_WINDOW_DAYS + 1,
		);
		const result = build([...recent, ...ancient]);
		expect(result.baseline).toBeNull();
		expect(result.withheldReason).toBe("insufficient_history");
		expect(result.coverage.qualifiedSamples).toBe(3);
	});

	test("future-dated samples are ignored", () => {
		const values = Array.from({ length: 10 }, (_, i) => 60 + i);
		const withFuture = [
			...dailySamples(values),
			{ atEpochMs: NOW + 5 * DAY_MS, value: 999, quality: 1 },
		];
		const result = build(withFuture);
		expect(result.coverage.qualifiedSamples).toBe(10);
		expect(result.baseline?.median).toBe(build(dailySamples(values)).baseline?.median);
	});

	test("low-quality samples are rejected and counted, never averaged in", () => {
		const good = dailySamples(Array.from({ length: 10 }, () => 60));
		const junk = dailySamples(
			[200, 200, 200],
			ROLLING_BASELINE_MIN_QUALITY - 0.01,
			10,
		);
		const result = build([...good, ...junk]);
		expect(result.coverage.rejectedForQuality).toBe(3);
		expect(result.coverage.qualifiedSamples).toBe(10);
		expect(result.baseline?.median).toBe(60);
	});

	test("quality floor is inclusive at the boundary", () => {
		const samples = dailySamples(
			Array.from({ length: 8 }, () => 60),
			ROLLING_BASELINE_MIN_QUALITY,
		);
		expect(build(samples).coverage.rejectedForQuality).toBe(0);
		expect(build(samples).baseline).not.toBeNull();
	});

	test("dropping too many outliers can itself withhold the baseline", () => {
		// 7 days of history, but 3 of them are wild spikes: the retained 4 days
		// fall under the floor, and we say so instead of quietly using them.
		const samples = [
			...dailySamples([60, 60, 61, 59]),
			...dailySamples([5000, 5100, 4900], 1, 4),
		];
		const result = build(samples);
		expect(result.coverage.rejectedAsOutlier).toBeGreaterThan(0);
		expect(result.baseline).toBeNull();
		expect(result.withheldReason).toBe("insufficient_history");
	});
});

describe("computeRollingBaseline statistics", () => {
	const values = [58, 59, 60, 60, 61, 62, 63, 64, 65, 90];

	test("median/MAD/personal ranges come from the retained samples", () => {
		const result = build(dailySamples(values));
		const baseline = result.baseline;
		expect(baseline).not.toBeNull();
		if (baseline === null) return;

		// Pre-pass median 61.5, scaled MAD 2.9652: 90 sits at z ≈ 9.6 and is the
		// only sample past the Hampel bound, so the retained set drops it.
		expect(MAD_SCALE * 2).toBeCloseTo(2.9652, 4);
		expect(Math.abs(90 - 61.5) / (MAD_SCALE * 2)).toBeGreaterThan(
			HAMPEL_OUTLIER_Z,
		);
		expect(result.coverage.rejectedAsOutlier).toBe(1);
		const retained = values.filter((value) => value !== 90).sort((a, b) => a - b);

		expect(baseline.median).toBeCloseTo(percentileSorted(retained, 50), 10);
		expect(baseline.range.p10).toBeCloseTo(percentileSorted(retained, 10), 10);
		expect(baseline.range.p25).toBeCloseTo(percentileSorted(retained, 25), 10);
		expect(baseline.range.p75).toBeCloseTo(percentileSorted(retained, 75), 10);
		expect(baseline.range.p90).toBeCloseTo(percentileSorted(retained, 90), 10);
		expect(baseline.range.p10).toBeLessThanOrEqual(baseline.range.p25);
		expect(baseline.range.p75).toBeLessThanOrEqual(baseline.range.p90);
	});

	test("a single wild spike does not move the median", () => {
		const clean = Array.from({ length: 12 }, (_, i) => 60 + (i % 3));
		const spiked = [...clean];
		spiked[5] = 100_000;
		const cleanBaseline = build(dailySamples(clean)).baseline;
		const spikedResult = build(dailySamples(spiked));
		expect(spikedResult.coverage.rejectedAsOutlier).toBe(1);
		expect(spikedResult.baseline?.median).toBe(cleanBaseline?.median);
	});

	test("a degenerate (zero-spread) window still produces a baseline, MAD 0", () => {
		const result = build(dailySamples(Array.from({ length: 10 }, () => 60)));
		expect(result.baseline?.mad).toBe(0);
		expect(result.coverage.rejectedAsOutlier).toBe(0);
		// Downstream, that flags degenerate rather than inventing a z.
		const z = robustZFromBaseline(70, result.baseline!);
		expect(z.degenerate).toBe(true);
	});

	test("the rolling baseline plugs straight into the contributor machinery", () => {
		const result = build(dailySamples([58, 59, 60, 61, 62, 63, 64, 65, 66, 67]));
		const baseline = result.baseline!;
		expect(isBaselineUsable(baseline)).toBe(true);
		expect(baseline.sessionCount).toBe(10);
		expect(baseline.metricId).toBe("pulse.heart_rate");
		expect(baseline.contextBucket).toBe("morning");
		expect(baseline.windowDays).toBe(ROLLING_BASELINE_WINDOW_DAYS);
		const contributor = buildContributor({
			id: "hr",
			metricId: "pulse.heart_rate",
			value: 70,
			baseline,
			quality: 1,
			weight: 1,
		});
		expect(contributor.included).toBe(true);
		expect(contributor.z).toBeGreaterThan(0);
	});

	test("updatedAtMs is the newest retained sample, not wall clock", () => {
		const samples = dailySamples([58, 59, 60, 61, 62, 63, 64, 65, 66, 67], 1, 2);
		const result = build(samples);
		expect(result.baseline?.updatedAtMs).toBe(NOW - 2 * DAY_MS);
	});
});

describe("contextBucketForHour", () => {
	test("buckets the 24 h clock into four named windows", () => {
		expect(contextBucketForHour(0)).toBe("night");
		expect(contextBucketForHour(5)).toBe("night");
		expect(contextBucketForHour(6)).toBe("morning");
		expect(contextBucketForHour(11)).toBe("morning");
		expect(contextBucketForHour(12)).toBe("afternoon");
		expect(contextBucketForHour(17)).toBe("afternoon");
		expect(contextBucketForHour(18)).toBe("evening");
		expect(contextBucketForHour(23)).toBe("evening");
	});

	test("rejects hours outside 0..23 rather than guessing a bucket", () => {
		expect(() => contextBucketForHour(24)).toThrow();
		expect(() => contextBucketForHour(-1)).toThrow();
		expect(() => contextBucketForHour(1.5)).toThrow();
	});
});

describe("describePersonalRange", () => {
	const range = { p10: 55, p25: 58, p75: 65, p90: 70 };

	test("places a value in its personal range band", () => {
		expect(describePersonalRange(50, range)).toBe("below_p10");
		expect(describePersonalRange(56, range)).toBe("p10_p25");
		expect(describePersonalRange(60, range)).toBe("p25_p75");
		expect(describePersonalRange(67, range)).toBe("p75_p90");
		expect(describePersonalRange(80, range)).toBe("above_p90");
	});

	test("band boundaries are inclusive on the lower edge", () => {
		expect(describePersonalRange(55, range)).toBe("p10_p25");
		expect(describePersonalRange(58, range)).toBe("p25_p75");
		expect(describePersonalRange(65, range)).toBe("p75_p90");
		expect(describePersonalRange(70, range)).toBe("above_p90");
	});
});
