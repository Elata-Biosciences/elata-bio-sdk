/**
 * `score_recovery@1` — post-activation recovery composite. Requires a
 * detected activation epoch (peak HR >= baseline median + 5 bpm), else the
 * score is withheld with `no_activation_detected`. Contributors:
 * −z time-to-half, +z recovery slope, +z RMSSD rebound ratio, +z alpha
 * rebound (when EEG is present); same renormalization/sigmoid/withhold
 * discipline as activation.
 */

import type { PersonalBaseline } from "./baseline.js";
import {
	buildContributor,
	compositeValue,
	type ContributorInput,
	type HeadlineScoreV1,
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
 * Detect the activation epoch from a 1 Hz HR trace: the contiguous span
 * around the peak sample where HR stays above the baseline median, provided
 * the peak clears `median + 5 bpm`. Returns null otherwise.
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

export interface RecoveryInput {
	/** Null when no activation epoch was detected. */
	activationEpoch: ActivationEpoch | null;
	/** Seconds to recover half the activation amplitude (lower is better). */
	timeToHalfS: RecoveryMetricInput;
	/** Post-activation return slope (higher is better). */
	recoverySlope: RecoveryMetricInput;
	/** Post/pre RMSSD rebound ratio (higher is better). */
	rmssdReboundRatio: RecoveryMetricInput;
	/** Post/pre alpha rebound (optional EEG contributor). */
	alphaRebound: RecoveryMetricInput;
	measurementQuality: number;
}

export function scoreRecovery(input: RecoveryInput): HeadlineScoreV1 {
	const contributorInputs: ContributorInput[] = [
		{
			id: "time-to-half",
			metricId: "session.recovery.time_to_half",
			value: input.timeToHalfS.value,
			baseline: input.timeToHalfS.baseline,
			quality: input.timeToHalfS.quality,
			weight: 0.3,
			negate: true,
		},
		{
			id: "slope",
			metricId: "session.recovery.slope",
			value: input.recoverySlope.value,
			baseline: input.recoverySlope.baseline,
			quality: input.recoverySlope.quality,
			weight: 0.3,
		},
		{
			id: "rmssd-rebound",
			metricId: "pulse.rmssd",
			value: input.rmssdReboundRatio.value,
			baseline: input.rmssdReboundRatio.baseline,
			quality: input.rmssdReboundRatio.quality,
			weight: 0.25,
		},
		{
			id: "alpha-rebound",
			metricId: "eeg.band_power.alpha.relative",
			value: input.alphaRebound.value,
			baseline: input.alphaRebound.baseline,
			quality: input.alphaRebound.quality,
			weight: 0.15,
		},
	];
	const contributors = contributorInputs.map(buildContributor);

	const base = {
		scoreId: "elata.recovery" as const,
		formulaVersion: "score_recovery@1" as const,
		contributors,
		measurementQuality: input.measurementQuality,
	};

	if (input.activationEpoch === null) {
		return { ...base, value: null, withheldReason: "no_activation_detected" };
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
