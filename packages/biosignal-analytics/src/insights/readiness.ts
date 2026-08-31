/**
 * `score_readiness@1` — the daily / pre-task number, read against the
 * person's own rolling baselines.
 *
 * This is the score users will hold up next to an Oura or Muse readiness
 * number, so the part that has to be right is not the weighting — it is when
 * the score declines to exist.
 *
 * ## Minimum-history policy (explicit, and checked first)
 *
 * Readiness requires **14 distinct qualified days** of history spanning at
 * least **14 calendar days**, inside the 30-day rolling window. Below either
 * floor the score is `null` with `insufficient_history` and a counted
 * `withheldDetail`, so a caller can say "eleven more days" rather than
 * "not enough data".
 *
 * Two calendar floors rather than one sample count, because the failure they
 * guard against is different in each direction. The day count stops three
 * days of data producing a confident number. The span stops twenty sessions
 * recorded over one intense weekend from passing as three weeks of history —
 * a rolling baseline built that way describes a weekend, not a person.
 *
 * Fourteen is a judgement call, not a derived constant. It is short enough
 * that a committed user reaches it inside a fortnight and long enough to
 * cover both halves of a week; a shorter floor would let weekday/weekend
 * structure masquerade as a change in state. The history check runs BEFORE
 * measurement quality and before any contributor arithmetic, so no amount of
 * signal quality today can buy history that does not exist.
 *
 * ## Contributors (design weights, renormalized over the included subset)
 *
 * | id                | weight | metric                    | sense |
 * |-------------------|--------|---------------------------|-------|
 * | resting-hr        | 0.25   | pulse.heart_rate          | lower is higher |
 * | prv               | 0.30   | pulse.rmssd               | higher is higher |
 * | respiration       | 0.15   | pulse.respiration_rate    | lower is higher |
 * | activation-burden | 0.15   | session.activation.area…  | less is higher |
 * | recent-recovery   | 0.15   | elata.recovery            | higher is higher |
 *
 * ## Time of day chooses the comparison; it never adjusts the answer
 *
 * `localHour` selects a context bucket, and the three physiological terms
 * require their baseline to have been cut from that same bucket — an 8 a.m.
 * resting HR compared against an all-day baseline is a different measurement,
 * so the mismatch excludes the contributor rather than being tolerated.
 *
 * What it explicitly is NOT is a circadian correction: there is no term that
 * adds points for the hour, because any such term would be a model of a
 * typical person's day applied to a specific person's morning. The multi-day
 * terms (activation burden, recent Recovery) are deliberately not bucketed;
 * they summarize whole days and a time-of-day demand on them is meaningless.
 *
 * ## Withheld, in order
 *
 * - `insufficient_history` — below the day or span floor, with the shortfall.
 * - `insufficient_quality` — today's MQ below `READINESS_MIN_MQ`.
 * - `insufficient_baseline` — under half the design weight survived baseline,
 *   quality and context gating.
 */

import type { PersonalBaseline } from "./baseline.js";
import {
	type ContributorInput,
	type HeadlineScoreV1,
	type WithheldRequirement,
	buildContributor,
	compositeValue,
} from "./contributors.js";
import { type HistoryCoverage, contextBucketForHour } from "./longitudinal.js";

export const READINESS_MIN_MQ = 40;

/** Distinct qualified days of history required before Readiness is offered. */
export const READINESS_MIN_HISTORY_DAYS = 14;

/** Calendar days that history must span (anti-cramming). */
export const READINESS_MIN_HISTORY_SPAN_DAYS = 14;

export interface ReadinessMetricInput {
	/** Today's value; null when the measure is absent. */
	value: number | null;
	/** Typically a `RollingBaseline`, which satisfies `PersonalBaseline`. */
	baseline: PersonalBaseline | null;
	/** 0..1 quality of the underlying measurement. */
	quality: number;
}

export interface ReadinessInput {
	/**
	 * Coverage of the history behind these baselines — normally the `coverage`
	 * block from the resting-HR `computeRollingBaseline` result, since resting
	 * HR is the term most likely to be present on every qualifying day.
	 */
	history: HistoryCoverage;
	/** Local hour (0..23) the reading was taken at. Selects the bucket. */
	localHour: number;
	/** Resting heart rate (bpm); contributes inversely. */
	restingHeartRate: ReadinessMetricInput;
	/** Pulse-rate variability (RMSSD, ms). */
	pulseRateVariability: ReadinessMetricInput;
	/** Respiration rate (breaths/min); contributes inversely. */
	respirationRate: ReadinessMetricInput;
	/**
	 * Recent activation burden — e.g. the trailing-7-day sum of
	 * `session.activation.area_above_baseline`. Contributes inversely.
	 */
	activationBurden: ReadinessMetricInput;
	/**
	 * Most recent Recovery score (0-100), against the person's own rolling
	 * baseline of Recovery scores. `value: null` when Recovery was withheld —
	 * which drops the term rather than reading as a mid-range recovery.
	 */
	recentRecovery: ReadinessMetricInput;
	/** Measurement Quality (0-100) of the reading behind today's values. */
	measurementQuality: number;
}

function contributorInputs(
	input: ReadinessInput,
	bucket: string,
): ContributorInput[] {
	return [
		{
			id: "resting-hr",
			metricId: "pulse.heart_rate",
			value: input.restingHeartRate.value,
			baseline: input.restingHeartRate.baseline,
			quality: input.restingHeartRate.quality,
			weight: 0.25,
			negate: true,
			requiredContextBucket: bucket,
		},
		{
			id: "prv",
			metricId: "pulse.rmssd",
			value: input.pulseRateVariability.value,
			baseline: input.pulseRateVariability.baseline,
			quality: input.pulseRateVariability.quality,
			weight: 0.3,
			requiredContextBucket: bucket,
		},
		{
			id: "respiration",
			metricId: "pulse.respiration_rate",
			value: input.respirationRate.value,
			baseline: input.respirationRate.baseline,
			quality: input.respirationRate.quality,
			weight: 0.15,
			negate: true,
			requiredContextBucket: bucket,
		},
		{
			id: "activation-burden",
			metricId: "session.activation.area_above_baseline",
			value: input.activationBurden.value,
			baseline: input.activationBurden.baseline,
			quality: input.activationBurden.quality,
			weight: 0.15,
			negate: true,
		},
		{
			id: "recent-recovery",
			metricId: "elata.recovery",
			value: input.recentRecovery.value,
			baseline: input.recentRecovery.baseline,
			quality: input.recentRecovery.quality,
			weight: 0.15,
		},
	];
}

/** Unmet minimum-history requirements, empty when the policy is satisfied. */
export function readinessHistoryShortfall(
	history: HistoryCoverage,
): WithheldRequirement[] {
	const shortfall: WithheldRequirement[] = [];
	if (history.qualifiedDays < READINESS_MIN_HISTORY_DAYS) {
		shortfall.push({
			requirement: "qualified_days",
			have: history.qualifiedDays,
			need: READINESS_MIN_HISTORY_DAYS,
		});
	}
	if (history.spanDays < READINESS_MIN_HISTORY_SPAN_DAYS) {
		shortfall.push({
			requirement: "span_days",
			have: history.spanDays,
			need: READINESS_MIN_HISTORY_SPAN_DAYS,
		});
	}
	return shortfall;
}

export function scoreReadiness(input: ReadinessInput): HeadlineScoreV1 {
	// Throws on an out-of-range hour: a bad clock is a caller bug, and
	// silently bucketing it would compare a reading to the wrong baseline.
	const bucket = contextBucketForHour(input.localHour);
	const contributors = contributorInputs(input, bucket).map(buildContributor);

	const base = {
		scoreId: "elata.readiness" as const,
		formulaVersion: "score_readiness@1" as const,
		contributors,
		measurementQuality: input.measurementQuality,
	};

	const shortfall = readinessHistoryShortfall(input.history);
	if (shortfall.length > 0) {
		return {
			...base,
			value: null,
			withheldReason: "insufficient_history",
			withheldDetail: shortfall,
		};
	}
	if (input.measurementQuality < READINESS_MIN_MQ) {
		return { ...base, value: null, withheldReason: "insufficient_quality" };
	}
	const value = compositeValue(contributors);
	if (value === null) {
		return { ...base, value: null, withheldReason: "insufficient_baseline" };
	}
	return { ...base, value };
}
