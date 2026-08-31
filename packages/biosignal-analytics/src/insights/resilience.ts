/**
 * `score_resilience@1` — regulation capacity, i.e. how well this person
 * returns to their own baseline across weeks rather than within one session.
 *
 * ## Minimum-history policy
 *
 * Three floors, all checked before anything else, and all reported together
 * so a user learns everything that is still missing in one message rather
 * than one floor at a time:
 *
 * - **21 distinct qualified days** in the rolling window.
 * - **21 calendar days** of span, so three intense days cannot pass as three
 *   weeks.
 * - **6 recovered activation episodes**. This is the floor the other two
 *   cannot substitute for: regulation capacity is measured by how someone
 *   comes back down, so three quiet weeks with nothing to come back down
 *   from contain no evidence about it at all. A score from that data would be
 *   a number about calm, presented as a number about resilience.
 *
 * Six episodes over three weeks is a judgement call — enough that one bad
 * night does not set the trend, few enough to be reachable by someone who
 * records a couple of sessions a week.
 *
 * ## Contributors (design weights, renormalized over the included subset)
 *
 * | id                   | weight | quantity                              | sense |
 * |----------------------|--------|---------------------------------------|-------|
 * | recovery-speed-trend | 0.30   | trend in time-to-half over the window | falling is better |
 * | prolonged-activation | 0.25   | fraction of episodes running long     | fewer is better |
 * | baseline-stability   | 0.20   | steadiness of the rolling baseline    | steadier is better |
 * | autonomic-flexibility| 0.25   | spread of the personal PRV range      | wider is better |
 *
 * ## Why these are still compared to a personal baseline
 *
 * Each contributor is already a normalized quantity — a slope, a rate, a
 * dispersion — so it is tempting to map it straight onto a score with a fixed
 * curve. That mapping would be invented: nothing establishes what a "good"
 * recovery-speed trend is in absolute terms, and any constant chosen for it
 * would be a population assumption dressed as a measurement.
 *
 * So they are z-scored against the person's own earlier windows, like every
 * other score here. The consequence is worth stating plainly: Resilience
 * withholds `insufficient_baseline` until those longitudinal baselines exist,
 * which in practice is well beyond the three-week history floor. That is a
 * real limitation and a deliberate one — the alternative is a confident
 * number resting on a constant somebody picked.
 *
 * The two withholds stay distinguishable on purpose. `insufficient_history`
 * means "keep recording, here is how much more". `insufficient_baseline`
 * means "there is nothing yet to compare you against"; telling that user to
 * come back in N days would be wrong.
 *
 * ## Withheld, in order
 *
 * - `insufficient_history` — any of the three floors, with every unmet one
 *   counted in `withheldDetail`.
 * - `insufficient_quality` — window-median MQ below `RESILIENCE_MIN_MQ`.
 * - `insufficient_baseline` — under half the design weight survived gating.
 */

import type { PersonalBaseline } from "./baseline.js";
import {
	type ContributorInput,
	type HeadlineScoreV1,
	type WithheldRequirement,
	buildContributor,
	compositeValue,
} from "./contributors.js";
import type { HistoryCoverage } from "./longitudinal.js";

/** Median Measurement Quality across the window, below which nothing is said. */
export const RESILIENCE_MIN_MQ = 40;

/** Distinct qualified days required in the rolling window. */
export const RESILIENCE_MIN_HISTORY_DAYS = 21;

/** Calendar days the history must span. */
export const RESILIENCE_MIN_HISTORY_SPAN_DAYS = 21;

/** Recovered activation episodes required before regulation can be judged. */
export const RESILIENCE_MIN_EPISODES = 6;

export interface ResilienceMetricInput {
	/** Window value; null when it could not be computed. */
	value: number | null;
	/** Rolling baseline of the SAME quantity over the person's earlier windows. */
	baseline: PersonalBaseline | null;
	/** 0..1 quality of the underlying aggregate. */
	quality: number;
}

export interface ResilienceInput {
	/** Coverage of the rolling window these quantities were computed over. */
	history: HistoryCoverage;
	/**
	 * Activation episodes in the window that reached at least half recovery —
	 * i.e. episodes that could contribute evidence about coming back down.
	 */
	recoveredActivationEpisodes: number;
	/**
	 * Trend in time-to-half-recovery across the window (seconds per day).
	 * Negative means recovering faster over time, so it contributes inversely.
	 */
	recoverySpeedTrend: ResilienceMetricInput;
	/**
	 * Fraction of activation episodes whose recovery ran long against the
	 * person's own distribution. Contributes inversely.
	 */
	prolongedActivationRate: ResilienceMetricInput;
	/**
	 * Steadiness of the rolling resting baseline (higher is steadier, e.g.
	 * `1 - mad/median` of the rolling resting-HR baseline).
	 */
	baselineStability: ResilienceMetricInput;
	/**
	 * Spread of the personal PRV distribution, e.g. `(p90 - p10) / median` of
	 * the rolling RMSSD baseline. A wider usable range is more flexibility.
	 */
	autonomicFlexibility: ResilienceMetricInput;
	/** Median Measurement Quality across the window (0-100). */
	measurementQuality: number;
}

function contributorInputs(input: ResilienceInput): ContributorInput[] {
	return [
		{
			id: "recovery-speed-trend",
			metricId: "session.recovery.time_to_half",
			value: input.recoverySpeedTrend.value,
			baseline: input.recoverySpeedTrend.baseline,
			quality: input.recoverySpeedTrend.quality,
			weight: 0.3,
			negate: true,
		},
		{
			id: "prolonged-activation",
			metricId: "session.activation.area_above_baseline",
			value: input.prolongedActivationRate.value,
			baseline: input.prolongedActivationRate.baseline,
			quality: input.prolongedActivationRate.quality,
			weight: 0.25,
			negate: true,
		},
		{
			id: "baseline-stability",
			metricId: "pulse.heart_rate",
			value: input.baselineStability.value,
			baseline: input.baselineStability.baseline,
			quality: input.baselineStability.quality,
			weight: 0.2,
		},
		{
			id: "autonomic-flexibility",
			metricId: "pulse.rmssd",
			value: input.autonomicFlexibility.value,
			baseline: input.autonomicFlexibility.baseline,
			quality: input.autonomicFlexibility.quality,
			weight: 0.25,
		},
	];
}

/** Unmet longitudinal requirements, empty when the policy is satisfied. */
export function resilienceHistoryShortfall(
	history: HistoryCoverage,
	recoveredActivationEpisodes: number,
): WithheldRequirement[] {
	const shortfall: WithheldRequirement[] = [];
	if (history.qualifiedDays < RESILIENCE_MIN_HISTORY_DAYS) {
		shortfall.push({
			requirement: "qualified_days",
			have: history.qualifiedDays,
			need: RESILIENCE_MIN_HISTORY_DAYS,
		});
	}
	if (history.spanDays < RESILIENCE_MIN_HISTORY_SPAN_DAYS) {
		shortfall.push({
			requirement: "span_days",
			have: history.spanDays,
			need: RESILIENCE_MIN_HISTORY_SPAN_DAYS,
		});
	}
	if (recoveredActivationEpisodes < RESILIENCE_MIN_EPISODES) {
		shortfall.push({
			requirement: "recovered_activation_episodes",
			have: recoveredActivationEpisodes,
			need: RESILIENCE_MIN_EPISODES,
		});
	}
	return shortfall;
}

export function scoreResilience(input: ResilienceInput): HeadlineScoreV1 {
	const contributors = contributorInputs(input).map(buildContributor);

	const base = {
		scoreId: "elata.resilience" as const,
		formulaVersion: "score_resilience@1" as const,
		contributors,
		measurementQuality: input.measurementQuality,
	};

	const shortfall = resilienceHistoryShortfall(
		input.history,
		input.recoveredActivationEpisodes,
	);
	if (shortfall.length > 0) {
		return {
			...base,
			value: null,
			withheldReason: "insufficient_history",
			withheldDetail: shortfall,
		};
	}
	if (input.measurementQuality < RESILIENCE_MIN_MQ) {
		return { ...base, value: null, withheldReason: "insufficient_quality" };
	}
	const value = compositeValue(contributors);
	if (value === null) {
		return { ...base, value: null, withheldReason: "insufficient_baseline" };
	}
	return { ...base, value };
}
