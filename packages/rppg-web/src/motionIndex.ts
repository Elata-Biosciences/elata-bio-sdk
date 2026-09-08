/**
 * How much the face actually moved between two frames, from face-mesh landmarks.
 *
 * A head-box framing gate only knows whether the SDK's head BOX is centred;
 * it says nothing about motion that keeps the box roughly in place (a nod, a
 * tilt, talking), which is exactly the motion the rPPG literature identifies
 * as most disruptive to signal quality (speaking and head-shake degrade HR
 * estimation even when framing looks fine). A landmark-based index answers a
 * different question than the box does: not "is the face positioned
 * correctly" but "did the face just move."
 *
 * Deliberately NOT face-box-based and NOT limited to the frame centre: every
 * one of the 468 mesh points contributes, so motion at the jaw or brow (which
 * can leave the box's own centroid nearly unchanged) still registers.
 */

import type { LandmarkLike } from "./roiProfile";

/**
 * Mean per-landmark Euclidean displacement between two frames, in normalized
 * (0..1 of frame) coordinates, scaled to roughly 0..1 for "still" through
 * "significant movement."
 *
 * Only x/y are compared (see {@link LandmarkLike}): MediaPipe's z is
 * depth-relative-to-a-reference point and far noisier frame-to-frame than
 * x/y, so including it would inflate the score on a face that is visually
 * still. This mirrors the literature's own convention (motion indices built
 * from yaw/pitch/x-y landmark deltas, not raw 3D displacement).
 *
 * Null on either frame (no face detected, or the first frame with nothing to
 * compare against) returns 0: "no evidence of motion," not "maximum motion."
 * A dropped detection is not itself motion, and treating it as such would
 * falsely gate a capture the instant the face model has one bad frame.
 */
export function landmarkMotion(
	prev: readonly LandmarkLike[] | null,
	curr: readonly LandmarkLike[] | null,
): number {
	if (!prev || !curr || prev.length === 0 || curr.length !== prev.length)
		return 0;
	let sum = 0;
	for (let i = 0; i < curr.length; i++) {
		const dx = curr[i].x - prev[i].x;
		const dy = curr[i].y - prev[i].y;
		sum += Math.sqrt(dx * dx + dy * dy);
	}
	const mean = sum / curr.length;
	// Calibration: normal micro-jitter while genuinely still sits under ~0.001
	// (mean per-point displacement, normalized frame units) at a 300ms poll
	// interval; a deliberate head turn or nod is well over 0.01. 0.02 as the
	// point where the score saturates to 1 leaves headroom above "clearly
	// moving" for genuinely large motion, rather than clipping real variation
	// into one bucket. Not derived from a measured dataset; a placeholder
	// scale chosen to be well-separated from observed stillness, tightened
	// later against real signal-quality correlation if `motion_mean` from the
	// WASM backend and this score are ever compared side by side.
	const SATURATE_AT = 0.02;
	return Math.max(0, Math.min(1, mean / SATURATE_AT));
}
