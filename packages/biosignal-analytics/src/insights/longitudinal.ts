/**
 * `rolling_baseline@1` — the longitudinal layer under Readiness and
 * Resilience: a rolling 30-day personal baseline with 25/75 and 10/90
 * personal ranges, explicit minimum-history gating, and robust (Hampel)
 * outlier rejection.
 *
 * Three rules make this honest rather than merely convenient:
 *
 * 1. **Minimum history is a gate, not a hint.** Below the floor the baseline
 *    is `null` with a machine-readable shortfall saying how much more data is
 *    needed. There is no "best effort" median from three days.
 * 2. **Days, not rows.** Ten sessions in one afternoon are ten samples but
 *    one day of history, so both a distinct-day count and a calendar span are
 *    required. Cramming cannot buy history.
 * 3. **Outliers are rejected, then counted.** A single artefactual spike must
 *    not move a personal median, and the number dropped is reported so a
 *    baseline built mostly by rejection is visible rather than silent.
 *
 * The emitted `RollingBaseline` extends `PersonalBaseline`, so it drops
 * straight into `buildContributor` and the existing robust-z machinery.
 */

import { MAD_SCALE } from "../statistics/robust.js";
import { percentileSorted } from "../statistics/summary.js";
import type { PersonalBaseline } from "./baseline.js";
import type { WithheldRequirement } from "./contributors.js";

export const DAY_MS = 86_400_000;

/** Rolling window length for personal baselines. */
export const ROLLING_BASELINE_WINDOW_DAYS = 30;

/** Distinct calendar days that must carry a qualified sample. */
export const ROLLING_BASELINE_MIN_DAYS = 7;

/** Calendar days the retained samples must span (anti-cramming). */
export const ROLLING_BASELINE_MIN_SPAN_DAYS = 7;

/** Samples below this measurement quality never enter a baseline. */
export const ROLLING_BASELINE_MIN_QUALITY = 0.4;

/**
 * Hampel rejection bound in robust-z units. 3.5 is the conventional Hampel
 * identifier threshold: strict enough to drop artefactual spikes, loose
 * enough to keep genuine physiological excursions.
 */
export const HAMPEL_OUTLIER_Z = 3.5;

export interface DailyMetricSample {
	/** Wall-clock ms of the session/day aggregate this sample summarizes. */
	atEpochMs: number;
	value: number;
	/** 0..1 quality of the aggregate (typically session MQ / 100). */
	quality: number;
}

/** Personal reference bands, in the metric's own unit. */
export interface PersonalRange {
	p10: number;
	p25: number;
	p75: number;
	p90: number;
}

export interface RollingBaseline extends PersonalBaseline {
	/** Length of the rolling window the baseline was cut from. */
	windowDays: number;
	range: PersonalRange;
	/** Distinct calendar days contributing (<= sessionCount). */
	dayCount: number;
	/** Calendar days spanned, first retained sample to last, inclusive. */
	spanDays: number;
}

export interface HistoryCoverage {
	windowDays: number;
	/** Samples retained after quality and outlier rejection. */
	qualifiedSamples: number;
	/** Distinct calendar days among the retained samples. */
	qualifiedDays: number;
	/** Calendar days spanned by the retained samples, inclusive. */
	spanDays: number;
	rejectedForQuality: number;
	rejectedAsOutlier: number;
}

export type RollingBaselineWithheldReason =
	| "inputs_missing"
	| "insufficient_history";

export interface RollingBaselineResult {
	metricId: string;
	contextBucket: string;
	/** Always emitted, including when the baseline is withheld. */
	coverage: HistoryCoverage;
	/** Null when the window carries too little qualified history. */
	baseline: RollingBaseline | null;
	withheldReason?: RollingBaselineWithheldReason;
	/** How much more data is needed; present only when withheld. */
	shortfall?: readonly WithheldRequirement[];
}

export interface RollingBaselineOptions {
	metricId: string;
	/** e.g. a `contextBucketForHour` value, or "any". */
	contextBucket: string;
	samples: readonly DailyMetricSample[];
	/** Right edge of the rolling window (wall-clock ms). */
	nowEpochMs: number;
	windowDays?: number;
	minDays?: number;
	minSpanDays?: number;
	minQuality?: number;
}

/** UTC day index; baselines bucket by calendar day, not by timestamp. */
function dayIndex(epochMs: number): number {
	return Math.floor(epochMs / DAY_MS);
}

function medianSorted(sorted: readonly number[]): number {
	return percentileSorted(sorted, 50);
}

function madOf(values: readonly number[], center: number): number {
	const deviations = values
		.map((value) => Math.abs(value - center))
		.sort((a, b) => a - b);
	return medianSorted(deviations);
}

/**
 * Rolling personal baseline over the trailing `windowDays`. Emits `null` with
 * a shortfall when the retained history is below the minimum-history policy.
 */
export function computeRollingBaseline(
	options: RollingBaselineOptions,
): RollingBaselineResult {
	const windowDays = options.windowDays ?? ROLLING_BASELINE_WINDOW_DAYS;
	const minDays = options.minDays ?? ROLLING_BASELINE_MIN_DAYS;
	const minSpanDays = options.minSpanDays ?? ROLLING_BASELINE_MIN_SPAN_DAYS;
	const minQuality = options.minQuality ?? ROLLING_BASELINE_MIN_QUALITY;

	const windowStartMs = options.nowEpochMs - windowDays * DAY_MS;
	const inWindow = options.samples.filter(
		(sample) =>
			Number.isFinite(sample.value) &&
			sample.atEpochMs >= windowStartMs &&
			sample.atEpochMs <= options.nowEpochMs,
	);

	const qualified = inWindow.filter((sample) => sample.quality >= minQuality);
	const rejectedForQuality = inWindow.length - qualified.length;

	// Hampel pass: median/MAD over the qualified set, then drop |z| > 3.5.
	// A degenerate (zero) MAD cannot discriminate, so nothing is rejected.
	const values = qualified.map((sample) => sample.value);
	const sortedAll = [...values].sort((a, b) => a - b);
	const prePassMedian = values.length > 0 ? medianSorted(sortedAll) : 0;
	const prePassScaledMad =
		values.length > 0 ? MAD_SCALE * madOf(values, prePassMedian) : 0;
	const retained =
		prePassScaledMad > 0
			? qualified.filter(
					(sample) =>
						Math.abs((sample.value - prePassMedian) / prePassScaledMad) <=
						HAMPEL_OUTLIER_Z,
				)
			: qualified;
	const rejectedAsOutlier = qualified.length - retained.length;

	const days = new Set(retained.map((sample) => dayIndex(sample.atEpochMs)));
	const dayIndices = [...days].sort((a, b) => a - b);
	const spanDays =
		dayIndices.length === 0
			? 0
			: dayIndices[dayIndices.length - 1] - dayIndices[0] + 1;

	const coverage: HistoryCoverage = {
		windowDays,
		qualifiedSamples: retained.length,
		qualifiedDays: days.size,
		spanDays,
		rejectedForQuality,
		rejectedAsOutlier,
	};

	const head = {
		metricId: options.metricId,
		contextBucket: options.contextBucket,
	};

	if (retained.length === 0) {
		return {
			...head,
			coverage,
			baseline: null,
			withheldReason: "inputs_missing",
			shortfall: [
				{ requirement: "qualified_days", have: 0, need: minDays },
				{ requirement: "span_days", have: 0, need: minSpanDays },
			],
		};
	}

	if (days.size < minDays || spanDays < minSpanDays) {
		const shortfall: WithheldRequirement[] = [];
		if (days.size < minDays) {
			shortfall.push({
				requirement: "qualified_days",
				have: days.size,
				need: minDays,
			});
		}
		if (spanDays < minSpanDays) {
			shortfall.push({
				requirement: "span_days",
				have: spanDays,
				need: minSpanDays,
			});
		}
		return {
			...head,
			coverage,
			baseline: null,
			withheldReason: "insufficient_history",
			shortfall,
		};
	}

	const retainedValues = retained.map((sample) => sample.value);
	const sorted = [...retainedValues].sort((a, b) => a - b);
	const median = medianSorted(sorted);

	return {
		...head,
		coverage,
		baseline: {
			metricId: options.metricId,
			contextBucket: options.contextBucket,
			median,
			mad: madOf(retainedValues, median),
			sessionCount: retained.length,
			updatedAtMs: retained.reduce(
				(newest, sample) => Math.max(newest, sample.atEpochMs),
				Number.NEGATIVE_INFINITY,
			),
			windowDays,
			dayCount: days.size,
			spanDays,
			range: {
				p10: percentileSorted(sorted, 10),
				p25: percentileSorted(sorted, 25),
				p75: percentileSorted(sorted, 75),
				p90: percentileSorted(sorted, 90),
			},
		},
	};
}

export type ContextBucket = "night" | "morning" | "afternoon" | "evening";

/**
 * Time-of-day context bucket for `contextBucketing: "time-of-day"` metrics.
 * Used to pick WHICH personal baseline a reading is compared against — never
 * as a circadian correction factor applied to a score.
 */
export function contextBucketForHour(localHour: number): ContextBucket {
	if (!Number.isInteger(localHour) || localHour < 0 || localHour > 23) {
		throw new RangeError(
			`localHour must be an integer 0..23, got ${localHour}`,
		);
	}
	if (localHour < 6) return "night";
	if (localHour < 12) return "morning";
	if (localHour < 18) return "afternoon";
	return "evening";
}

export type PersonalRangeBand =
	| "below_p10"
	| "p10_p25"
	| "p25_p75"
	| "p75_p90"
	| "above_p90";

/** Where a value sits in the personal range. Lower edges are inclusive. */
export function describePersonalRange(
	value: number,
	range: PersonalRange,
): PersonalRangeBand {
	if (value < range.p10) return "below_p10";
	if (value < range.p25) return "p10_p25";
	if (value < range.p75) return "p25_p75";
	if (value < range.p90) return "p75_p90";
	return "above_p90";
}
