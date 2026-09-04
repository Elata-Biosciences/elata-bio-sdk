/**
 * How full the calibration ring is, and how strict the reading is being.
 *
 * This is the arithmetic behind a number the reader watches for ten seconds —
 * every symptom addressed below was reported by a real user and none of it
 * was visible from reading a component alone.
 */

import { DEFAULT_BASELINE_CALIBRATOR_CONFIG } from "./baselineCalibrator";

/**
 * Minimum capture confidence to treat a reading as real. Below it, keep the
 * previous metrics and ask for a recapture rather than rendering a garbage
 * score, or letting it skew a baseline / insights.
 */
export const TRUST_FLOOR = 0.4;

/** Minimum accepted samples before a lock, ~5.4s at the 300ms poll. */
export const MIN_LOCK_SAMPLES = DEFAULT_BASELINE_CALIBRATOR_CONFIG.minForStability;

/** Sustained good window required before the reading is taken. */
export const MEASURE_HOLD_MS = 1200;

/** The landing: the finished reading stays on screen this long before committing. */
export const LOCK_HOLD_MS = 900;

/** Where the trust floor eases to, and when. Same numbers the staircase used. */
export const TRUST_FLOOR_MID = 0.35;
export const TRUST_FLOOR_MIN = 0.3;
export const TRUST_EASE_MID_MS = 20_000;
export const TRUST_EASE_END_MS = 35_000;

/**
 * The confidence a reading must reach, at `elapsedMs` into the capture.
 *
 * Continuous, where it used to be a staircase:
 *
 *     if (elapsed > 35_000) setTrustFloor(0.3);
 *     else if (elapsed > 20_000) setTrustFloor(0.35);
 *
 * The floor is the denominator of the ring's confidence term, so those two `if`s
 * multiplied the bar by 1.14 and then by 1.17 at two instants, with nothing about
 * the reading having changed. On a noisy read, where confidence is the term
 * holding everything up, that is a bar sitting still and then leaping twenty
 * points because a clock ticked. It is the "flaky, jumps around" report.
 *
 * The three anchors are exactly the old schedule's values at exactly the times it
 * reached them, so the capture is no stricter at the start and no more permissive
 * at the end than it has ever been. The only change is that it is drawn rather
 * than stepped.
 */
export function trustFloorAt(elapsedMs: number): number {
	if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return TRUST_FLOOR;
	if (elapsedMs >= TRUST_EASE_END_MS) return TRUST_FLOOR_MIN;
	if (elapsedMs <= TRUST_EASE_MID_MS) {
		return TRUST_FLOOR + (TRUST_FLOOR_MID - TRUST_FLOOR) * (elapsedMs / TRUST_EASE_MID_MS);
	}
	const p = (elapsedMs - TRUST_EASE_MID_MS) / (TRUST_EASE_END_MS - TRUST_EASE_MID_MS);
	return TRUST_FLOOR_MID + (TRUST_FLOOR_MIN - TRUST_FLOOR_MID) * p;
}

/**
 * How long a typical capture takes to become lockable.
 *
 * Not invented: it is the number a capture screen prints under its heading,
 * and a consuming app's own test pins the two together so the promise and
 * the budget below cannot drift apart.
 */
export const TYPICAL_CALIBRATION_MS = 10_000;

const TOTAL_MS = TYPICAL_CALIBRATION_MS + MEASURE_HOLD_MS + LOCK_HOLD_MS;
/** Shares of the bar, DERIVED from the real durations rather than chosen. */
export const READINESS_SHARE = TYPICAL_CALIBRATION_MS / TOTAL_MS;
export const MEASURE_SHARE = MEASURE_HOLD_MS / TOTAL_MS;
export const COMMIT_SHARE = LOCK_HOLD_MS / TOTAL_MS;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export interface CaptureProgressInput {
	/** The calibrator's confidence, already high-watered by the caller. */
	confidence: number;
	/** From {@link trustFloorAt}. */
	trustFloor: number;
	/** Accepted samples so far. */
	samples: number;
	/** Accumulated sustained lock-ready time. */
	heldMs: number;
	locked: boolean;
	/** Time since the lock, for the landing. */
	sinceLockMs: number;
}

/**
 * How much of the reading is done, 0..1, INCLUDING both holds.
 *
 * What this replaces had three faults and they compounded:
 *
 *  1. `Math.min(conf / floor, n / MIN_LOCK_SAMPLES)`. A `min` means exactly one
 *     term is moving the bar at any moment, so the fill rate visibly changed
 *     slope the instant the binding term swapped. Nothing on screen explained it.
 *  2. `locked ? 100 : lockReady ? 99 : Math.min(raw, 95)`. 95 is not a place a
 *     reading is ever AT: it was a parking space invented because 100 had to mean
 *     something else. Leaving it was a jump of twenty to forty points.
 *  3. The two holds were invisible. The bar sat at 99 through 2.1 seconds of real
 *     work, which is the hang at the end of every capture.
 *
 * So: no `min`, no clamp, and the holds are part of the same number.
 *
 * The two calibration terms combine with a GEOMETRIC MEAN. It is 1 exactly when
 * both are 1, so the bar still cannot claim done early; it is monotone in each;
 * and unlike `min` it MOVES on both at all times, which is the fix for the slope
 * change. The three shares sum to 1, so the bar reaches 1 exactly when the
 * landing completes, which is when the capture commits.
 */
export function captureProgress(i: CaptureProgressInput): number {
	const conf = clamp01(i.trustFloor > 0 ? i.confidence / i.trustFloor : 0);
	const enough = clamp01(i.samples / MIN_LOCK_SAMPLES);
	const readiness = Math.sqrt(conf * enough);
	const hold = clamp01(i.heldMs / MEASURE_HOLD_MS);
	const commit = i.locked ? clamp01(i.sinceLockMs / LOCK_HOLD_MS) : 0;
	return clamp01(READINESS_SHARE * readiness + MEASURE_SHARE * hold + COMMIT_SHARE * commit);
}

/**
 * Has the calibrator thrown its samples away and started over?
 *
 * The SDK does this deliberately: after ten rejects in a row before sample 18 it
 * empties its buffer, so an early bad average cannot wedge the whole capture
 * (`baselineCalibrator.ts`). A DECREASING sample count is the only observable of
 * it, and nothing else in that class can decrease one.
 *
 * It matters because of what the reader sees: the count collapses to zero, the
 * ring's high-water mark holds the number where it was, and the bar then sits
 * perfectly still for five seconds or more with nothing saying why. That silence
 * is the "laggy, stuck" half of the report. The ring is right not to retreat; it
 * was wrong to say nothing.
 */
export function restartDetected(samples: number, previousSamples: number): boolean {
	return samples < previousSamples;
}
