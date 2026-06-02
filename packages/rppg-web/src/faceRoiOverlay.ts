import type { ROI } from "./frameSource";

/**
 * Face ROI geometry + a canvas debug overlay.
 *
 * {@link computeFaceRoiRects} maps face-mesh landmarks to the pixel rectangles
 * sampled for the pulse signal (the single source of truth shared with the
 * sampler), and {@link drawFaceOverlay} renders the mesh tessellation plus those
 * ROI boxes over a camera canvas so it is visually obvious which pixels feed the
 * estimate, with box brightness tracking each region's live fusion weight.
 *
 * This module has no MediaPipe dependency: landmarks are plain normalized
 * {x, y} points and the tessellation connection list (if any) is passed in by
 * the caller — e.g. `FaceLandmarker.FACE_LANDMARKS_TESSELATION` from
 * `@mediapipe/tasks-vision`.
 */

export type LandmarkLike = { x: number; y: number };

export type FaceRoiName =
	| "forehead"
	| "leftCheek"
	| "rightCheek"
	| "centralFace"
	| "broadFace";

/** [x0, y0, x1, y1] as fractions of the face bounding box. */
export const FACE_ROI_FRACTIONS: Record<
	FaceRoiName,
	[number, number, number, number]
> = {
	forehead: [0.3, 0.04, 0.7, 0.28],
	leftCheek: [0.16, 0.42, 0.43, 0.7],
	rightCheek: [0.57, 0.42, 0.84, 0.7],
	centralFace: [0.25, 0.25, 0.75, 0.78],
	broadFace: [0.12, 0.12, 0.88, 0.9],
};

/** Default regions drawn by the overlay — the forehead + cheek fusion ROIs. */
const DEFAULT_OVERLAY_ROIS: readonly FaceRoiName[] = [
	"forehead",
	"leftCheek",
	"rightCheek",
];

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function percentileBounds(
	points: LandmarkLike[],
	width: number,
	height: number,
) {
	const xs = points.map((p) => clamp(p.x, 0, 1)).sort((a, b) => a - b);
	const ys = points.map((p) => clamp(p.y, 0, 1)).sort((a, b) => a - b);
	const pick = (values: number[], p: number) =>
		values[Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * p)))];
	const x0 = pick(xs, 0.05) * width;
	const x1 = pick(xs, 0.95) * width;
	const y0 = pick(ys, 0.03) * height;
	const y1 = pick(ys, 0.97) * height;
	return { x0, y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/**
 * Pixel rectangles for each named face ROI, derived from the 5th/95th-percentile
 * bounding box of the landmarks. Returns an empty object when there are no
 * landmarks or the canvas has no area.
 */
export function computeFaceRoiRects(
	landmarks: LandmarkLike[],
	width: number,
	height: number,
	fractions: Partial<
		Record<FaceRoiName, [number, number, number, number]>
	> = FACE_ROI_FRACTIONS,
): Partial<Record<FaceRoiName, ROI>> {
	if (!landmarks.length || width <= 0 || height <= 0) return {};
	const bounds = percentileBounds(landmarks, width, height);
	const rects: Partial<Record<FaceRoiName, ROI>> = {};
	for (const roiName of Object.keys(fractions) as FaceRoiName[]) {
		const frac = fractions[roiName];
		if (!frac) continue;
		const [fx0, fy0, fx1, fy1] = frac;
		const x0 = Math.max(0, Math.min(width - 1, Math.round(bounds.x0 + bounds.w * fx0)));
		const y0 = Math.max(0, Math.min(height - 1, Math.round(bounds.y0 + bounds.h * fy0)));
		const x1 = Math.max(x0 + 1, Math.min(width, Math.round(bounds.x0 + bounds.w * fx1)));
		const y1 = Math.max(y0 + 1, Math.min(height, Math.round(bounds.y0 + bounds.h * fy1)));
		rects[roiName] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	}
	return rects;
}

export interface MeshConnection {
	start: number;
	end: number;
}

export interface DrawFaceOverlayOptions {
	/**
	 * Mesh tessellation connections (e.g.
	 * `FaceLandmarker.FACE_LANDMARKS_TESSELATION`). When omitted, only the ROI
	 * boxes are drawn.
	 */
	tessellation?: ReadonlyArray<MeshConnection>;
	/** Which ROIs to box (default forehead + both cheeks). */
	rois?: readonly FaceRoiName[];
	/** Live per-ROI fusion weights (0..1); drives box brightness + labels. */
	weights?: Partial<Record<FaceRoiName, number>>;
	/**
	 * Set when the canvas is CSS-mirrored to match a flipped selfie video, so
	 * labels are counter-flipped to render the right way round (default true).
	 */
	mirrored?: boolean;
}

/**
 * Draw the face mesh tessellation + the rPPG ROI boxes onto a 2D canvas
 * context. Box stroke/fill brightness is proportional to each region's current
 * fusion weight (equal weighting when none is supplied).
 */
export function drawFaceOverlay(
	ctx: CanvasRenderingContext2D,
	landmarks: LandmarkLike[],
	width: number,
	height: number,
	options: DrawFaceOverlayOptions = {},
): void {
	if (!landmarks.length || width <= 0 || height <= 0) return;
	const { tessellation, weights, mirrored = true } = options;
	const rois = options.rois ?? DEFAULT_OVERLAY_ROIS;

	// 1. Face mesh tessellation (single batched path for performance).
	if (tessellation && tessellation.length) {
		ctx.save();
		ctx.strokeStyle = "rgba(120,230,255,0.35)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		for (const c of tessellation) {
			const a = landmarks[c.start];
			const b = landmarks[c.end];
			if (!a || !b) continue;
			ctx.moveTo(a.x * width, a.y * height);
			ctx.lineTo(b.x * width, b.y * height);
		}
		ctx.stroke();
		ctx.restore();
	}

	// Text would render backwards on a mirrored canvas, so draw each label
	// through a local horizontal counter-flip.
	const drawLabel = (text: string, cx: number, y: number, color: string) => {
		ctx.save();
		ctx.translate(cx, y);
		if (mirrored) ctx.scale(-1, 1);
		ctx.font = "11px monospace";
		ctx.textAlign = "center";
		ctx.fillStyle = color;
		ctx.fillText(text, 0, 0);
		ctx.restore();
	};

	// 2. The rPPG ROIs. Brightness tracks the live fusion weight so the dominant
	//    region is obvious.
	const rects = computeFaceRoiRects(landmarks, width, height);
	for (const roi of rois) {
		const rect = rects[roi];
		if (!rect) continue;
		const w = weights ? clamp(weights[roi] ?? 0, 0, 1) : 1 / rois.length;
		ctx.save();
		ctx.setLineDash([]);
		ctx.lineWidth = 1.5 + 2.5 * w;
		ctx.strokeStyle = `rgba(34,197,94,${(0.35 + 0.6 * w).toFixed(3)})`;
		ctx.fillStyle = `rgba(34,197,94,${(0.05 + 0.35 * w).toFixed(3)})`;
		ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
		ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
		ctx.restore();
		const label = weights ? `${roi} ${Math.round(w * 100)}%` : roi;
		drawLabel(label, rect.x + rect.w / 2, rect.y + 12, "rgba(187,247,208,0.95)");
	}
}
