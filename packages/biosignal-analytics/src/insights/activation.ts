/**
 * `score_activation@1` — sigmoid composite of robust-z contributors vs the
 * personal baseline: zHR (0.4), −z RMSSD (0.3), z EEG beta ratio (0.3);
 * weights renormalized over included contributors. Withheld when the
 * included original weight is < 0.5 or MQ < 40.
 */

import type { PersonalBaseline } from "./baseline.js";
import {
	buildContributor,
	compositeValue,
	type HeadlineScoreV1,
} from "./contributors.js";

export const ACTIVATION_MIN_MQ = 40;

export interface ActivationMetricInput {
	/** Session-aggregate value; null when the modality is absent. */
	value: number | null;
	baseline: PersonalBaseline | null;
	/** 0..1 quality of the underlying measurement. */
	quality: number;
}

export interface ActivationInput {
	/** Session mean heart rate (bpm). */
	heartRate: ActivationMetricInput;
	/** Session RMSSD (ms) — contributes inversely. */
	rmssd: ActivationMetricInput;
	/** Session mean beta_rel/(alpha_rel+theta_rel). */
	eegBetaRatio: ActivationMetricInput;
	/** The session's measurement-quality value (0-100). */
	measurementQuality: number;
}

export function scoreActivation(input: ActivationInput): HeadlineScoreV1 {
	const contributors = [
		buildContributor({
			id: "hr",
			metricId: "pulse.heart_rate",
			value: input.heartRate.value,
			baseline: input.heartRate.baseline,
			quality: input.heartRate.quality,
			weight: 0.4,
		}),
		buildContributor({
			id: "prv",
			metricId: "pulse.rmssd",
			value: input.rmssd.value,
			baseline: input.rmssd.baseline,
			quality: input.rmssd.quality,
			weight: 0.3,
			negate: true,
		}),
		buildContributor({
			id: "eeg-beta",
			metricId: "eeg.ratio.alpha_beta",
			value: input.eegBetaRatio.value,
			baseline: input.eegBetaRatio.baseline,
			quality: input.eegBetaRatio.quality,
			weight: 0.3,
		}),
	];

	const base = {
		scoreId: "elata.activation" as const,
		formulaVersion: "score_activation@1" as const,
		contributors,
		measurementQuality: input.measurementQuality,
	};

	if (input.measurementQuality < ACTIVATION_MIN_MQ) {
		return { ...base, value: null, withheldReason: "insufficient_quality" };
	}
	const value = compositeValue(contributors);
	if (value === null) {
		return { ...base, value: null, withheldReason: "insufficient_baseline" };
	}
	return { ...base, value };
}
