/**
 * Camera exposure response fitting: given two (compensation, luma) samples,
 * estimate the local sensitivity (Δluma / Δcompensation) so a consumer can
 * solve directly for a target luma instead of guessing a proportional nudge.
 *
 * This is the measurement the "solve directly for the target" correction in
 * an app's own exposure-tuning decision is built on, the same principle the
 * rPPG exposure-control literature uses (fit the camera's actual response,
 * then invert it), scaled down from a dedicated multi-frame-per-second
 * scheme to a once-a-second luma poll: no new frames are sampled, this just
 * uses the two most recent (compensation, luma) pairs a caller already has.
 *
 * Honest limit: unlike a study that locks exposure to isolate the
 * measurement, a consuming app's camera keeps running continuous
 * autoexposure, so the sensor's own AE algorithm can partly re-compensate
 * between samples, and ambient light can genuinely change for reasons
 * unrelated to the requested compensation. The fit is a best-effort local
 * estimate, not a controlled measurement, so callers should guard against a
 * nonsensical (near-zero or inverted-sign) result rather than trusting every
 * fit blindly.
 */

/** One (compensation, resulting luma) pair, for {@link fitExposureResponse}. */
export interface ExposureSample {
	compensation: number;
	luma: number;
}

/**
 * Minimum |Δcompensation| (EV) between two samples before a slope is trusted.
 * Below this, rounding/step granularity dominates the ratio and a near-zero
 * denominator can produce a wildly wrong slope from two samples that barely
 * differ.
 */
const MIN_FIT_DELTA = 0.05;

/**
 * Local response slope (Δluma / Δcompensation) between two samples, or null
 * when there isn't a trustworthy pair yet: no previous sample, non-finite
 * input, or a compensation delta too small to divide by safely.
 */
export function fitExposureResponse(
	prev: ExposureSample | null,
	curr: ExposureSample,
): number | null {
	if (!prev) return null;
	if (!Number.isFinite(prev.compensation) || !Number.isFinite(prev.luma)) return null;
	if (!Number.isFinite(curr.compensation) || !Number.isFinite(curr.luma)) return null;
	const dComp = curr.compensation - prev.compensation;
	if (Math.abs(dComp) < MIN_FIT_DELTA) return null;
	return (curr.luma - prev.luma) / dComp;
}
