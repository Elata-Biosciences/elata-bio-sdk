/**
 * Shared headline-score machinery: contributor assembly, weight
 * renormalization over included contributors, and the sigmoid mapping.
 * Withhold discipline: `value: null` with a reason — never a silent 50.
 */

import {
	type PersonalBaseline,
	isBaselineUsable,
	robustZFromBaseline,
} from "./baseline.js";

export interface ScoreContributor {
	id: string;
	metricId: string;
	z: number | null;
	weight: number;
	quality: number;
	included: boolean;
	excludedReason?: string;
}

export type HeadlineScoreId =
	| "elata.measurement_quality"
	| "elata.activation"
	| "elata.recovery"
	| "elata.focus"
	| "elata.readiness"
	| "elata.resilience";

export type WithheldReason =
	| "insufficient_baseline"
	| "insufficient_quality"
	| "no_activation_detected"
	| "inputs_missing"
	/** Longitudinal scores below their minimum-history policy. */
	| "insufficient_history"
	/** Focus without a task to be focused on. */
	| "no_task_context"
	/** The recording ended before the activation had recovered. */
	| "recovery_incomplete";

/**
 * One unmet requirement behind a withheld score, so the UI can say "8 more
 * days" instead of "not enough data".
 */
export interface WithheldRequirement {
	/** Stable machine-readable key, e.g. "qualified_days". */
	requirement: string;
	have: number;
	need: number;
}

export interface HeadlineScoreV1 {
	scoreId: HeadlineScoreId;
	formulaVersion: `${string}@${number}`;
	/** 0-100; null = withheld — never a silent neutral 50. */
	value: number | null;
	withheldReason?: WithheldReason;
	/**
	 * Quantified shortfall behind `withheldReason`. Present only when the
	 * shortfall is countable (history/episode floors), absent otherwise.
	 */
	withheldDetail?: readonly WithheldRequirement[];
	/** Full drill-down, always emitted. */
	contributors: readonly ScoreContributor[];
	/** MQ always attached to any score. */
	measurementQuality: number;
}

/** Contributor quality below this excludes it from a composite score. */
export const CONTRIBUTOR_MIN_QUALITY = 0.4;

/** Included original-weight fraction below this withholds the score. */
export const MIN_INCLUDED_WEIGHT = 0.5;

export const SIGMOID_GAIN = 0.8;

export interface ContributorInput {
	id: string;
	metricId: string;
	/** Session value for the metric; null when the input is missing. */
	value: number | null;
	baseline: PersonalBaseline | null;
	/** 0..1 quality of the underlying measurement. */
	quality: number;
	/** Original design weight. */
	weight: number;
	/** Negate the z (e.g. RMSSD contributes inversely to activation). */
	negate?: boolean;
	/**
	 * When set, the baseline must have been cut from this context bucket (e.g.
	 * "morning"). A morning reading compared against an all-day baseline is a
	 * different measurement, so the mismatch excludes the contributor rather
	 * than being quietly tolerated.
	 */
	requiredContextBucket?: string;
}

/** Assemble a contributor: baseline gating + robust z + inclusion verdict. */
export function buildContributor(input: ContributorInput): ScoreContributor {
	const base = {
		id: input.id,
		metricId: input.metricId,
		weight: input.weight,
		quality: input.quality,
	};
	if (input.value === null) {
		return {
			...base,
			z: null,
			included: false,
			excludedReason: "inputs_missing",
		};
	}
	if (!isBaselineUsable(input.baseline)) {
		return {
			...base,
			z: null,
			included: false,
			excludedReason: "insufficient_baseline",
		};
	}
	if (input.quality < CONTRIBUTOR_MIN_QUALITY) {
		return {
			...base,
			z: null,
			included: false,
			excludedReason: "insufficient_quality",
		};
	}
	if (
		input.requiredContextBucket !== undefined &&
		input.baseline.contextBucket !== input.requiredContextBucket
	) {
		return {
			...base,
			z: null,
			included: false,
			excludedReason: "baseline_context_mismatch",
		};
	}
	const { z, degenerate } = robustZFromBaseline(input.value, input.baseline);
	if (degenerate) {
		return {
			...base,
			z: 0,
			included: false,
			excludedReason: "degenerate_baseline",
		};
	}
	return { ...base, z: input.negate === true ? -z : z, included: true };
}

export function sigmoid(x: number): number {
	return 1 / (1 + Math.exp(-x));
}

/**
 * Weighted composite over included contributors: weights renormalized over
 * the included subset; null when the included original weight is below
 * `MIN_INCLUDED_WEIGHT` of the total.
 */
export function compositeValue(
	contributors: readonly ScoreContributor[],
): number | null {
	const total = contributors.reduce((acc, c) => acc + c.weight, 0);
	const included = contributors.filter((c) => c.included && c.z !== null);
	const includedWeight = included.reduce((acc, c) => acc + c.weight, 0);
	if (total <= 0 || includedWeight / total < MIN_INCLUDED_WEIGHT) {
		return null;
	}
	let weighted = 0;
	for (const contributor of included) {
		weighted +=
			(contributor.weight / includedWeight) * (contributor.z as number);
	}
	return Math.round(100 * sigmoid(SIGMOID_GAIN * weighted));
}
