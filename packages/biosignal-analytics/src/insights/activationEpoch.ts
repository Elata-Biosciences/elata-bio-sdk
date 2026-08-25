/**
 * `activation_epoch@1` — the TypeScript view of the activation-epoch analysis.
 *
 * The analysis itself is computed by the Rust engine (`activation_epoch.rs`
 * in `elata-biosignal-features`); this file declares nothing but the contract
 * its output must satisfy so `scoreRecovery` can compose over it. The shapes
 * and field names mirror `fixtures/activation/activation_epoch.json` field
 * for field, so a drift between the engine and this package fails the fixture
 * test in `insights.recovery.test.ts` rather than being absorbed silently.
 *
 * Time is in SECONDS here, not microseconds: these are durations measured
 * within an epoch, not positions on the session clock, and the engine's
 * fixture states them in seconds. Session-relative µs positions stay with the
 * raw observations.
 *
 * Two conventions matter for reading the recovery block:
 *
 * - `recoverySlopePerSecond` is signed and NEGATIVE for a real recovery (the
 *   trace is falling back toward baseline). A steeper, more negative slope is
 *   a faster recovery, which is why the score negates its z.
 * - `recovery` is `null` when the recording ended too soon to observe any
 *   recovery at all (`recoveryWithheldReason: "postEpochWindowTooShort"`),
 *   while a present block with `timeToHalfRecoverySeconds: null` means an
 *   activation that was observed and never came down. Both are withholds for
 *   the score, but they are different facts and stay distinguishable.
 */

/** Why the engine could not produce an epoch at all. */
export type ActivationEpochWithheldReason =
	/** Fewer samples than the analysis needs. */
	| "insufficientSamples"
	/** The pre-activation window was too short to establish a baseline. */
	| "baselineTooShort"
	/** A baseline existed, but nothing cleared the activation threshold. */
	| "noQualifyingActivation";

/** Why an epoch exists but carries no recovery block. */
export type RecoveryWithheldReason = "postEpochWindowTooShort";

export interface ActivationBaselineV1 {
	startSeconds: number;
	endSeconds: number;
	sampleCount: number;
	/** Robust centre of the pre-activation window. */
	level: number;
	/** Robust spread (scaled MAD) of the pre-activation window. */
	scale: number;
	/** `level + k * scale`; the epoch is the excursion above this. */
	activationThreshold: number;
}

export interface ActivationRecoveryV1 {
	/** Seconds of post-peak recording the recovery was judged over. */
	observedSeconds: number;
	/** Value marking half the excursion recovered. */
	halfRecoveryTarget: number;
	/** Value marking a return to baseline. */
	baselineReturnTarget: number;
	/** Null when half recovery was never reached. */
	timeToHalfRecoverySeconds: number | null;
	/** Null when baseline was never regained. */
	timeToBaselineSeconds: number | null;
	recoveryCompleted: boolean;
	/** Signed; negative while recovering. Steeper (more negative) is faster. */
	recoverySlopePerSecond: number;
	/** 0 = fully recovered, 1 = still at peak excursion when observation ended. */
	residualFraction: number;
}

export interface ActivationEpochV1 {
	startSeconds: number;
	endSeconds: number;
	durationSeconds: number;
	sampleCount: number;
	peakValue: number;
	peakSeconds: number;
	timeToPeakSeconds: number;
	riseRatePerSecond: number;
	areaAboveBaseline: number;
	/** Null when the recording ended before recovery could be observed. */
	recovery: ActivationRecoveryV1 | null;
	recoveryWithheldReason: RecoveryWithheldReason | null;
}

export interface ActivationEpochAnalysisV1 {
	sampleRateHz: number;
	sampleCount: number;
	durationSeconds: number;
	/** Null when no baseline window could be established. */
	baseline: ActivationBaselineV1 | null;
	/** Null when no qualifying activation was found. */
	epoch: ActivationEpochV1 | null;
	withheldReason: ActivationEpochWithheldReason | null;
}
