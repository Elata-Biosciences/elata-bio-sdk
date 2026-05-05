/** Guidance codes produced only from face-mesh geometry (see {@link computeFaceMeshAlignment}). */
export type FaceMeshAlignmentGuidanceCode =
	| "face_move_closer"
	| "face_move_back"
	| "face_lower_head"
	| "face_raise_head";

/** MediaPipe Face Mesh landmark indices (canonical topology). */
export const FACE_MESH_LANDMARK_LEFT_TRAGUS = 234;
export const FACE_MESH_LANDMARK_RIGHT_TRAGUS = 454;
export const FACE_MESH_LANDMARK_NOSE_TIP = 1;

export type FaceMeshLandmark = { x?: number; y?: number };

export type FaceMeshAlignmentOptions = {
	/** Face width (ear–ear) / frame width; below → move closer. Default 0.15 (TradeLock). */
	minFaceWidthRatio?: number;
	/** Above → move back. Default 0.6 (TradeLock). */
	maxFaceWidthRatio?: number;
	/** Nose tip normalized Y; above → lower head. Default 0.22 (TradeLock). */
	noseYUpperBound?: number;
	/** Below → raise head. Default 0.58 (TradeLock). */
	noseYLowerBound?: number;
};

export type FaceMeshAlignmentSnapshot = {
	aligned: boolean;
	faceWidthRatio: number;
	noseY: number;
	/** Set when `aligned` is false. */
	guidance: { code: FaceMeshAlignmentGuidanceCode; message: string } | null;
};

const defaultOpts: Required<FaceMeshAlignmentOptions> = {
	minFaceWidthRatio: 0.15,
	maxFaceWidthRatio: 0.6,
	noseYUpperBound: 0.22,
	noseYLowerBound: 0.58,
};

/**
 * Geometry hints for MediaPipe Face Mesh landmarks (normalized [0,1] coords).
 * Distance uses left/right tragion; vertical uses nose tip.
 */
export function computeFaceMeshAlignment(
	landmarks: readonly FaceMeshLandmark[],
	frameWidth: number,
	frameHeight: number,
	options: FaceMeshAlignmentOptions = {},
): FaceMeshAlignmentSnapshot | null {
	if (
		!landmarks?.length ||
		frameWidth <= 0 ||
		frameHeight <= 0 ||
		!Number.isFinite(frameWidth) ||
		!Number.isFinite(frameHeight)
	) {
		return null;
	}
	const left = landmarks[FACE_MESH_LANDMARK_LEFT_TRAGUS];
	const right = landmarks[FACE_MESH_LANDMARK_RIGHT_TRAGUS];
	const nose = landmarks[FACE_MESH_LANDMARK_NOSE_TIP];
	if (!left || !right || !nose) return null;

	const lx = Number(left.x ?? NaN);
	const rx = Number(right.x ?? NaN);
	const noseY = Number(nose.y ?? NaN);
	if (!Number.isFinite(lx) || !Number.isFinite(rx) || !Number.isFinite(noseY)) {
		return null;
	}

	const o = { ...defaultOpts, ...options };
	const faceWidthPx = Math.abs(rx - lx) * frameWidth;
	const faceWidthRatio = faceWidthPx / frameWidth;

	let guidance: FaceMeshAlignmentSnapshot["guidance"] = null;

	if (faceWidthRatio < o.minFaceWidthRatio) {
		guidance = {
			code: "face_move_closer",
			message: "Move Closer",
		};
	} else if (faceWidthRatio > o.maxFaceWidthRatio) {
		guidance = {
			code: "face_move_back",
			message: "Move Back",
		};
	} else if (noseY < o.noseYUpperBound) {
		guidance = {
			code: "face_lower_head",
			message: "Lower your head slightly",
		};
	} else if (noseY > o.noseYLowerBound) {
		guidance = {
			code: "face_raise_head",
			message: "Raise your head slightly",
		};
	}

	return {
		aligned: guidance == null,
		faceWidthRatio,
		noseY,
		guidance,
	};
}
