/**
 * Face-framing guidance: turn a detected face's position/size in the frame into
 * a one-line "move closer / center / sit up" hint. A mis-framed face is *why*
 * SNR drops, so positioning is signal-domain logic that belongs alongside the
 * gating controller and is shared by every consumer (no per-app reimplementation).
 *
 * Pure by design — plain `{ x, y }` points, no MediaPipe import — so it can run
 * anywhere: the SDK derives the box from the FaceLandmarker it already runs for
 * its ROI crop (see {@link MediaPipeFaceFrameSource}), and the {@link RppgGatingController}
 * folds the result into its progressive guidance.
 */

export type FramingCode =
	| "ok"
	| "no_face"
	| "move_closer"
	| "move_back"
	| "center_face"
	| "face_too_high"
	| "face_too_low";

export interface FramingGuidance {
	code: FramingCode;
	/** User-facing, head-relative (unambiguous regardless of camera mount). */
	message: string;
}

/** Normalized face box: x/y top-left, width/height as fractions of the frame. */
export interface FaceBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface FramingThresholds {
	/** Face width fraction below which the face is too far (move closer). */
	minWidth: number;
	/** Face width fraction above which the face is too close (move back). */
	maxWidth: number;
	/** Allowed |center − 0.5| on each axis before we nudge. */
	centerTol: number;
}

// Thresholds are in *head-box* terms (see padFaceBoxToHead): the box we frame
// against is the padded head, not the bare mesh, so a face well-sized for a
// clean rPPG read fills more of the frame. minWidth is deliberately assertive —
// a slacker 0.22 lets a too-far face read "ok" while signal quality sags, so it
// never says "come closer" when it should. Tune on-device if needed.
export const DEFAULT_FRAMING_THRESHOLDS: FramingThresholds = {
	minWidth: 0.34,
	maxWidth: 0.78,
	centerTol: 0.18,
};

export const FRAMING_MESSAGES: Record<FramingCode, string> = {
	ok: "",
	no_face: "Bring your face into the frame",
	move_closer: "Move a little closer to the camera",
	move_back: "Move back a little — you’re too close",
	center_face: "Center your face in the frame",
	face_too_high: "You’re high in frame — lower your head or raise the camera",
	face_too_low: "You’re low in frame — sit up or lower the camera",
};

/**
 * Map a face box to a single framing hint. Distance is corrected before
 * position (no point centering a face that's about to be re-sized), and
 * horizontal before vertical. Returns `ok` when the face is well-framed.
 */
export function faceFramingFromBox(
	box: FaceBox | null,
	t: FramingThresholds = DEFAULT_FRAMING_THRESHOLDS,
): FramingGuidance {
	if (box == null) return { code: "no_face", message: FRAMING_MESSAGES.no_face };

	if (box.width > t.maxWidth)
		return { code: "move_back", message: FRAMING_MESSAGES.move_back };
	if (box.width < t.minWidth)
		return { code: "move_closer", message: FRAMING_MESSAGES.move_closer };

	const cx = box.x + box.width / 2;
	if (Math.abs(cx - 0.5) > t.centerTol) {
		return { code: "center_face", message: FRAMING_MESSAGES.center_face };
	}

	const cy = box.y + box.height / 2;
	if (cy < 0.5 - t.centerTol)
		return { code: "face_too_high", message: FRAMING_MESSAGES.face_too_high };
	if (cy > 0.5 + t.centerTol)
		return { code: "face_too_low", message: FRAMING_MESSAGES.face_too_low };

	return { code: "ok", message: FRAMING_MESSAGES.ok };
}

/**
 * The FaceLandmarker mesh spans brow→chin, cheek→cheek — it omits the skull
 * above the brow and the head's full width (ears/hair). Users frame their whole
 * *head*, so steering off the bare mesh box reads low and small. We pad it
 * outward to approximate the head: a generous slab above (skull), a little to
 * each side, a touch below the jaw. Apply once at the source so the on-screen
 * box and the framing math operate on the same head box and can't drift apart.
 * Values may land outside 0..1 (head cropped by the frame) — the framing center
 * stays meaningful and any indicator clamps for drawing.
 */
export function padFaceBoxToHead(box: FaceBox): FaceBox {
	// The mesh already reaches the upper forehead, so the skull slab above it is
	// small. Keep padding gentle — an aggressive top pad balloons the box and
	// clips it out of the frame.
	const topPad = box.height * 0.2; // skull above the hairline
	const sidePad = box.width * 0.07; // ears / hair
	const botPad = box.height * 0.02; // jaw slack
	return {
		x: box.x - sidePad,
		y: box.y - topPad,
		width: box.width + sidePad * 2,
		height: box.height + topPad + botPad,
	};
}

/**
 * Bounding box of normalized face landmarks (e.g. MediaPipe's 478 points,
 * already in 0..1 frame coordinates). Returns null for an empty set.
 */
export function faceBoxFromLandmarks(
	landmarks: { x: number; y: number }[],
): FaceBox | null {
	if (!landmarks.length) return null;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of landmarks) {
		if (p.x < minX) minX = p.x;
		if (p.x > maxX) maxX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
