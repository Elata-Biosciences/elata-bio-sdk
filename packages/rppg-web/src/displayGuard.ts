/**
 * No-reference display guard for the camera BPM readout.
 *
 * When there is no external reference lock (no headband / finger-count pairing),
 * the displayed BPM can jump to a harmonic — the half-rate sub-harmonic or the
 * double-rate harmonic — of the true pulse. This guard inspects the candidate
 * against the independent estimators (instant peaks, autocorrelation, spectral)
 * and the Bayes tracker, and either lets the candidate through or snaps it back
 * to a stable / corroborated value.
 *
 * Notably, a large jump is *not* "unsupported" when two independent
 * frequency-domain estimators agree on a plausible rate near the candidate:
 * that is a genuine octave recovery and is surfaced as
 * `cluster_corroborated_jump` rather than being reverted.
 */

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export interface NoReferenceDisplayGuardDecision {
	bpm: number;
	applied: boolean;
	reason:
		| "none"
		| "high_harmonic_spike"
		| "low_harmonic_drop"
		| "unsupported_large_jump"
		| "cluster_corroborated_jump";
}

const countNear = (
	values: Array<number | null | undefined>,
	target: number,
	tolerance: number,
) =>
	values.filter(
		(value) =>
			value != null &&
			Number.isFinite(value) &&
			Math.abs(value - target) <= tolerance,
	).length;

const medianValue = (values: number[]) => {
	const sorted = values.slice().sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};

export const applyNoReferenceDisplayGuard = (options: {
	hasReferenceLock?: boolean;
	candidateBpm?: number | null;
	smoothedBpm?: number | null;
	trackerBpm?: number | null;
	trackerConfidence?: number;
	instantBpm?: number | null;
	acfBpm?: number | null;
	spectralBpm?: number | null;
	resolutionConfidence?: number;
	estimatorSpread?: number;
}): NoReferenceDisplayGuardDecision => {
	const candidateBpm = options.candidateBpm ?? null;
	const smoothedBpm = options.smoothedBpm ?? null;
	if (
		options.hasReferenceLock ||
		candidateBpm == null ||
		smoothedBpm == null ||
		!Number.isFinite(candidateBpm) ||
		!Number.isFinite(smoothedBpm)
	) {
		return {
			bpm: candidateBpm ?? smoothedBpm ?? 0,
			applied: false,
			reason: "none",
		};
	}

	const trackerBpm = options.trackerBpm ?? null;
	const trackerConfidence = clamp(options.trackerConfidence ?? 0, 0, 1);
	const instantBpm = options.instantBpm ?? null;
	const acfBpm = options.acfBpm ?? null;
	const spectralBpm = options.spectralBpm ?? null;
	const resolutionConfidence = clamp(options.resolutionConfidence ?? 0, 0, 1);
	const estimatorSpread = Math.max(0, options.estimatorSpread ?? 0);
	const displayDelta = Math.abs(candidateBpm - smoothedBpm);
	const stableFallback =
		trackerBpm != null &&
		Number.isFinite(trackerBpm) &&
		trackerConfidence >= 0.38 &&
		Math.abs(trackerBpm - smoothedBpm) <= 18
			? trackerBpm
			: smoothedBpm;

	const candidateSupport = countNear(
		[instantBpm, acfBpm, spectralBpm, trackerBpm],
		candidateBpm,
		12,
	);
	const stableSupport = countNear(
		[instantBpm, trackerBpm, smoothedBpm],
		stableFallback,
		14,
	);
	const broadStableSupport = countNear(
		[instantBpm, acfBpm, spectralBpm, trackerBpm, smoothedBpm],
		stableFallback,
		14,
	);
	const plausibleEstimators = [instantBpm, acfBpm, spectralBpm].filter(
		(value): value is number =>
			value != null && Number.isFinite(value) && value >= 65 && value <= 125,
	);
	const plausibleRange = plausibleEstimators.length
		? Math.max(...plausibleEstimators) - Math.min(...plausibleEstimators)
		: Number.POSITIVE_INFINITY;
	const correctedEstimatorCluster =
		plausibleEstimators.length >= 2 && plausibleRange <= 20
			? plausibleEstimators
			: acfBpm != null &&
					spectralBpm != null &&
					Number.isFinite(acfBpm) &&
					Number.isFinite(spectralBpm) &&
					acfBpm >= 65 &&
					acfBpm <= 125 &&
					spectralBpm >= 65 &&
					spectralBpm <= 125 &&
					Math.abs(acfBpm - spectralBpm) <= 12
				? [acfBpm, spectralBpm]
				: [];

	if (
		candidateBpm <= 60 &&
		displayDelta >= 24 &&
		correctedEstimatorCluster.length >= 2
	) {
		return {
			bpm: medianValue(correctedEstimatorCluster),
			applied: true,
			reason: "low_harmonic_drop",
		};
	}

	if (
		trackerBpm != null &&
		Number.isFinite(trackerBpm) &&
		trackerConfidence >= 0.68 &&
		Math.abs(candidateBpm - trackerBpm) <= 8
	) {
		return { bpm: candidateBpm, applied: false, reason: "none" };
	}

	if (
		candidateBpm >= 120 &&
		displayDelta >= 24 &&
		estimatorSpread >= 30 &&
		stableSupport >= 2 &&
		candidateSupport <= 2
	) {
		return { bpm: stableFallback, applied: true, reason: "high_harmonic_spike" };
	}

	if (
		candidateBpm <= 55 &&
		displayDelta >= 18 &&
		broadStableSupport >= 2 &&
		((instantBpm != null && Number.isFinite(instantBpm) && instantBpm >= 68) ||
			(trackerBpm != null && Number.isFinite(trackerBpm) && trackerBpm >= 68))
	) {
		const lowDropFallback =
			instantBpm != null &&
			Number.isFinite(instantBpm) &&
			instantBpm >= 68 &&
			instantBpm <= 115
				? instantBpm
				: stableFallback;
		return { bpm: lowDropFallback, applied: true, reason: "low_harmonic_drop" };
	}

	// A jump is not "unsupported" when two independent frequency-domain
	// estimators (ACF + spectral) agree on a plausible rate near the candidate —
	// even with no reference lock. countNear's tight ±12 window often fails to
	// credit this (ACF ~110 and spectral ~90 can both be the right octave yet sit
	// >12 apart), so a correct octave recovery (peaks/tracker pulled up to ~105
	// while the smoothed display still lags at the ~55 sub-harmonic) was being
	// reverted as 'unsupported_large_jump'. When the candidate matches the
	// corroborated cluster, snap it to the cluster median and let it through.
	const corroboratedByCluster =
		correctedEstimatorCluster.length >= 2 &&
		Math.abs(candidateBpm - medianValue(correctedEstimatorCluster)) <= 14;

	const unsupportedLargeJump =
		displayDelta >= 24 &&
		estimatorSpread >= 26 &&
		resolutionConfidence < 0.58 &&
		trackerConfidence < 0.62 &&
		candidateSupport < 3 &&
		!corroboratedByCluster;
	if (unsupportedLargeJump) {
		return {
			bpm: stableFallback,
			applied: true,
			reason: "unsupported_large_jump",
		};
	}

	if (corroboratedByCluster && displayDelta >= 24) {
		// Surface the cluster-corroborated octave directly so the display tracks the
		// independent estimators instead of lingering on the lagged sub-harmonic.
		return {
			bpm: medianValue(correctedEstimatorCluster),
			applied: true,
			reason: "cluster_corroborated_jump",
		};
	}

	return { bpm: candidateBpm, applied: false, reason: "none" };
};
