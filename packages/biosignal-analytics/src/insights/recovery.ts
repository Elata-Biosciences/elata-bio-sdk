/**
 * `score_recovery@2` — post-activation recovery, composed over a real
 * `activation_epoch@1` analysis from the Rust engine.
 *
 * @1 took four loose numbers and a three-field epoch stub, and was never
 * wired to anything that produced them. @2 takes the engine's analysis
 * verbatim (see `activationEpoch.ts`) and derives the epoch-side contributors
 * from it, so there is exactly one definition of "the activation" and no
 * opportunity for a caller to assemble a recovery out of unrelated numbers.
 * @1 stays registered so any observation already stored under it keeps its
 * meaning; nothing computes it any more.
 *
 * Contributors (design weights, renormalized over the included subset):
 *
 * | id                | weight | source                             | sense |
 * |-------------------|--------|------------------------------------|-------|
 * | time-to-half      | 0.30   | recovery.timeToHalfRecoverySeconds | lower is better |
 * | recovery-slope    | 0.25   | recovery.recoverySlopePerSecond    | more negative is better |
 * | time-to-baseline  | 0.15   | recovery.timeToBaselineSeconds     | lower is better |
 * | rmssd-rebound     | 0.20   | post/pre RMSSD ratio (pulse)       | higher is better |
 * | alpha-rebound     | 0.10   | post/pre relative alpha (EEG)      | higher is better |
 *
 * Withheld, in order:
 *
 * - `inputs_missing` — no analysis, or the engine could not even establish a
 *   baseline (`insufficientSamples` / `baselineTooShort`).
 * - `no_activation_detected` — a baseline existed and nothing qualified.
 * - `recovery_incomplete` — an activation happened but the recording ended
 *   before recovery could be observed, or it was observed and never reached
 *   half recovery. There is no recovery to rate, so no number is offered.
 * - `insufficient_quality` — session MQ below `RECOVERY_MIN_MQ`.
 * - `insufficient_baseline` — under half the design weight survived baseline
 *   and quality gating.
 *
 * A PARTIAL recovery still scores: reaching half recovery but not baseline
 * drops the `time-to-baseline` term and renormalizes the rest. Half recovery
 * is the point at which the curve's shape is actually established.
 */

import type {
	ActivationEpochAnalysisV1,
	ActivationRecoveryV1,
} from "./activationEpoch.js";
import type { PersonalBaseline } from "./baseline.js";
import {
	type ContributorInput,
	type HeadlineScoreV1,
	buildContributor,
	compositeValue,
} from "./contributors.js";

export const RECOVERY_MIN_MQ = 40;

/** Peak HR must exceed the HR baseline median by this much (bpm). */
export const ACTIVATION_EPOCH_MIN_DELTA_BPM = 5;

export interface ActivationEpoch {
	startUs: number;
	endUs: number;
	peakBpm: number;
}

/**
 * Lightweight HR-trace epoch locator: the contiguous span around the peak
 * where HR stays above the baseline median, provided the peak clears
 * `median + 5 bpm`.
 *
 * This is a positional helper only. It does NOT satisfy `scoreRecovery`,
 * which needs the recovery limb (`activation_epoch@1`); it exists for callers
 * that just need to know where in a session the activation sat.
 */
export function detectActivationEpoch(
	hrTrace: readonly { tUs: number; bpm: number }[],
	hrBaseline: PersonalBaseline | null,
): ActivationEpoch | null {
	if (hrBaseline === null || hrTrace.length === 0) return null;
	let peakIndex = 0;
	for (let i = 1; i < hrTrace.length; i++) {
		if (hrTrace[i].bpm > hrTrace[peakIndex].bpm) peakIndex = i;
	}
	const peak = hrTrace[peakIndex];
	if (peak.bpm < hrBaseline.median + ACTIVATION_EPOCH_MIN_DELTA_BPM)
		return null;

	let start = peakIndex;
	while (start > 0 && hrTrace[start - 1].bpm > hrBaseline.median) start--;
	let end = peakIndex;
	while (end < hrTrace.length - 1 && hrTrace[end + 1].bpm > hrBaseline.median)
		end++;
	return {
		startUs: hrTrace[start].tUs,
		endUs: hrTrace[end].tUs,
		peakBpm: peak.bpm,
	};
}

export interface RecoveryMetricInput {
	value: number | null;
	baseline: PersonalBaseline | null;
	quality: number;
}

/** Personal baselines for the epoch-derived recovery metrics. */
export interface RecoveryBaselines {
	/** Baseline for `session.recovery.time_to_half` (seconds). */
	timeToHalfRecoveryS: PersonalBaseline | null;
	/** Baseline for `session.recovery.slope` (signed, per second). */
	recoverySlopePerSecond: PersonalBaseline | null;
	/** Baseline for `session.recovery.time_to_baseline` (seconds). */
	timeToBaselineS: PersonalBaseline | null;
}

export interface RecoveryInput {
	/**
	 * `activation_epoch@1` output for this session. Null when the engine did
	 * not run at all (no suitable trace, engine unavailable).
	 */
	analysis: ActivationEpochAnalysisV1 | null;
	baselines: RecoveryBaselines;
	/**
	 * 0..1 quality of the trace the epoch was cut from — typically the
	 * coverage-weighted quality of the pulse stream over the epoch. Applies to
	 * all three epoch-derived contributors.
	 */
	epochQuality: number;
	/** Post/pre RMSSD rebound ratio, from the pulse engine. */
	rmssdRebound: RecoveryMetricInput;
	/** Post/pre relative-alpha rebound, from the EEG engine (optional). */
	alphaRebound: RecoveryMetricInput;
	/** The session's Measurement Quality (0-100). */
	measurementQuality: number;
}

function contributorInputs(
	input: RecoveryInput,
	recovery: ActivationRecoveryV1 | null,
): ContributorInput[] {
	return [
		{
			id: "time-to-half",
			metricId: "session.recovery.time_to_half",
			value: recovery?.timeToHalfRecoverySeconds ?? null,
			baseline: input.baselines.timeToHalfRecoveryS,
			quality: input.epochQuality,
			weight: 0.3,
			negate: true,
		},
		{
			id: "recovery-slope",
			metricId: "session.recovery.slope",
			value: recovery?.recoverySlopePerSecond ?? null,
			baseline: input.baselines.recoverySlopePerSecond,
			quality: input.epochQuality,
			weight: 0.25,
			// The slope is negative while recovering; more negative is faster.
			negate: true,
		},
		{
			id: "time-to-baseline",
			metricId: "session.recovery.time_to_baseline",
			value: recovery?.timeToBaselineSeconds ?? null,
			baseline: input.baselines.timeToBaselineS,
			quality: input.epochQuality,
			weight: 0.15,
			negate: true,
		},
		{
			id: "rmssd-rebound",
			metricId: "pulse.rmssd",
			value: input.rmssdRebound.value,
			baseline: input.rmssdRebound.baseline,
			quality: input.rmssdRebound.quality,
			weight: 0.2,
		},
		{
			id: "alpha-rebound",
			metricId: "eeg.band_power.alpha.relative",
			value: input.alphaRebound.value,
			baseline: input.alphaRebound.baseline,
			quality: input.alphaRebound.quality,
			weight: 0.1,
		},
	];
}

export function scoreRecovery(input: RecoveryInput): HeadlineScoreV1 {
	const epoch = input.analysis?.epoch ?? null;
	const recovery = epoch?.recovery ?? null;
	const contributors = contributorInputs(input, recovery).map(buildContributor);

	const base = {
		scoreId: "elata.recovery" as const,
		formulaVersion: "score_recovery@2" as const,
		contributors,
		measurementQuality: input.measurementQuality,
	};

	if (input.analysis === null) {
		return { ...base, value: null, withheldReason: "inputs_missing" };
	}
	if (epoch === null) {
		// The engine distinguishes "we could not look" from "we looked and
		// there was nothing"; so does the score.
		const reason =
			input.analysis.withheldReason === "noQualifyingActivation"
				? "no_activation_detected"
				: "inputs_missing";
		return { ...base, value: null, withheldReason: reason };
	}
	if (recovery === null || recovery.timeToHalfRecoverySeconds === null) {
		return { ...base, value: null, withheldReason: "recovery_incomplete" };
	}
	if (input.measurementQuality < RECOVERY_MIN_MQ) {
		return { ...base, value: null, withheldReason: "insufficient_quality" };
	}
	const value = compositeValue(contributors);
	if (value === null) {
		return { ...base, value: null, withheldReason: "insufficient_baseline" };
	}
	return { ...base, value };
}
