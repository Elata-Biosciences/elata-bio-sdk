/**
 * `score_measurement_quality@1` —
 * `MQ = 100 * (0.4*coverage + 0.35*signal + 0.25*stability)` where
 * signal = quality-weighted mean of the available signal components and
 * stability = `exp(-discontinuities/5) * exp(-reconnects/3)`.
 * Hard withhold below 60 s of valid data. No baseline needed.
 */

import type { HeadlineScoreV1, ScoreContributor } from "./contributors.js";

export const MQ_MIN_VALID_DURATION_S = 60;

export interface SignalComponent {
	/** e.g. "eeg", "rppg", "ppg". */
	id: string;
	metricId: string;
	/** 0..1 signal score (e.g. 1 - eeg.artifact_coverage). */
	value: number;
	/** 0..1 weight within the signal term (defaults to 1). */
	quality?: number;
}

export interface MeasurementQualityInput {
	/** 0..1 (session.coverage). */
	coverage: number;
	signals: readonly SignalComponent[];
	discontinuities: number;
	reconnects: number;
	validDurationS: number;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export function scoreMeasurementQuality(
	input: MeasurementQualityInput,
): HeadlineScoreV1 {
	const coverage = clamp01(input.coverage);
	const stability =
		Math.exp(-Math.max(0, input.discontinuities) / 5) *
		Math.exp(-Math.max(0, input.reconnects) / 3);

	const contributors: ScoreContributor[] = [
		{
			id: "coverage",
			metricId: "session.coverage",
			z: null,
			weight: 0.4,
			quality: 1,
			included: true,
		},
		...input.signals.map((signal) => ({
			id: `signal:${signal.id}`,
			metricId: signal.metricId,
			z: null,
			weight: 0.35,
			quality: clamp01(signal.quality ?? 1),
			included: true,
		})),
		{
			id: "stability",
			metricId: "stream.discontinuities",
			z: null,
			weight: 0.25,
			quality: 1,
			included: true,
		},
	];

	if (input.signals.length === 0) {
		return {
			scoreId: "elata.measurement_quality",
			formulaVersion: "score_measurement_quality@1",
			value: null,
			withheldReason: "inputs_missing",
			contributors,
			measurementQuality: 0,
		};
	}

	let signalWeight = 0;
	let signalAcc = 0;
	for (const signal of input.signals) {
		const weight = clamp01(signal.quality ?? 1);
		signalAcc += weight * clamp01(signal.value);
		signalWeight += weight;
	}
	const signalScore = signalWeight > 0 ? signalAcc / signalWeight : 0;

	const value = Math.round(
		100 * (0.4 * coverage + 0.35 * signalScore + 0.25 * stability),
	);

	if (input.validDurationS < MQ_MIN_VALID_DURATION_S) {
		return {
			scoreId: "elata.measurement_quality",
			formulaVersion: "score_measurement_quality@1",
			value: null,
			withheldReason: "insufficient_quality",
			contributors,
			measurementQuality: value,
		};
	}

	return {
		scoreId: "elata.measurement_quality",
		formulaVersion: "score_measurement_quality@1",
		value,
		contributors,
		measurementQuality: value,
	};
}
