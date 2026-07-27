import type { FaceLandmarkPoint, ROI } from "./frameSource";

export type LandmarkLike = Pick<FaceLandmarkPoint, "x" | "y">;

export type FaceRoiName =
	| "forehead"
	| "leftCheek"
	| "rightCheek"
	| "centralFace"
	| "broadFace";

export type FaceRoiFraction = readonly [
	x0: number,
	y0: number,
	x1: number,
	y1: number,
];

export type FaceRoiFractions = Readonly<
	Partial<Record<FaceRoiName, FaceRoiFraction>>
>;

export interface RoiGeometryProfile {
	readonly id: string;
	readonly roiNames: readonly FaceRoiName[];
	compute(
		landmarks: readonly LandmarkLike[],
		width: number,
		height: number,
	): Partial<Record<FaceRoiName, ROI>>;
}

/**
 * Current Elata production geometry. Changing these fractions requires a new
 * profile ID so recorded diagnostics and learned-model inputs remain traceable.
 */
export const ELATA_FACE_YCBCR_V1_FRACTIONS: FaceRoiFractions = {
	forehead: [0.32, 0.13, 0.68, 0.3],
	leftCheek: [0.16, 0.42, 0.43, 0.7],
	rightCheek: [0.57, 0.42, 0.84, 0.7],
	centralFace: [0.25, 0.25, 0.75, 0.78],
	broadFace: [0.12, 0.12, 0.88, 0.9],
};

/**
 * Frozen five-ROI geometry used to train the MCD waveform proxy.
 * It intentionally differs from the current Elata forehead geometry.
 */
export const MCD_PROXY_INPUT_V1_FRACTIONS: FaceRoiFractions = {
	forehead: [0.3, 0.04, 0.7, 0.28],
	leftCheek: [0.16, 0.42, 0.43, 0.7],
	rightCheek: [0.57, 0.42, 0.84, 0.7],
	centralFace: [0.25, 0.25, 0.75, 0.78],
	broadFace: [0.12, 0.12, 0.88, 0.9],
};

export const FUSION_ROI_NAMES: readonly FaceRoiName[] = [
	"forehead",
	"leftCheek",
	"rightCheek",
];

export const ALL_FACE_ROI_NAMES: readonly FaceRoiName[] = [
	...FUSION_ROI_NAMES,
	"centralFace",
	"broadFace",
];

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function percentileBounds(
	points: readonly LandmarkLike[],
	width: number,
	height: number,
) {
	const xs = points.map((p) => clamp(p.x, 0, 1)).sort((a, b) => a - b);
	const ys = points.map((p) => clamp(p.y, 0, 1)).sort((a, b) => a - b);
	const pick = (values: number[], p: number) =>
		values[
			Math.min(
				values.length - 1,
				Math.max(0, Math.floor((values.length - 1) * p)),
			)
		];
	const x0 = pick(xs, 0.05) * width;
	const x1 = pick(xs, 0.95) * width;
	const y0 = pick(ys, 0.03) * height;
	const y1 = pick(ys, 0.97) * height;
	return { x0, y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

export function computeFractionalFaceRoiRects(
	landmarks: readonly LandmarkLike[],
	width: number,
	height: number,
	fractions: FaceRoiFractions,
): Partial<Record<FaceRoiName, ROI>> {
	if (!landmarks.length || width <= 0 || height <= 0) return {};
	const bounds = percentileBounds(landmarks, width, height);
	const rects: Partial<Record<FaceRoiName, ROI>> = {};
	for (const roiName of ALL_FACE_ROI_NAMES) {
		const fraction = fractions[roiName];
		if (!fraction) continue;
		const [fx0, fy0, fx1, fy1] = fraction;
		const x0 = Math.max(
			0,
			Math.min(width - 1, Math.round(bounds.x0 + bounds.w * fx0)),
		);
		const y0 = Math.max(
			0,
			Math.min(height - 1, Math.round(bounds.y0 + bounds.h * fy0)),
		);
		const x1 = Math.max(
			x0 + 1,
			Math.min(width, Math.round(bounds.x0 + bounds.w * fx1)),
		);
		const y1 = Math.max(
			y0 + 1,
			Math.min(height, Math.round(bounds.y0 + bounds.h * fy1)),
		);
		rects[roiName] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	}
	return rects;
}

function fractionalProfile(
	id: string,
	fractions: FaceRoiFractions,
): RoiGeometryProfile {
	return {
		id,
		roiNames: ALL_FACE_ROI_NAMES,
		compute: (landmarks, width, height) =>
			computeFractionalFaceRoiRects(landmarks, width, height, fractions),
	};
}

export const ELATA_FACE_YCBCR_V1_PROFILE = fractionalProfile(
	"elata-face-ycbcr-v1",
	ELATA_FACE_YCBCR_V1_FRACTIONS,
);

export const MCD_PROXY_INPUT_V1_PROFILE = fractionalProfile(
	"mcd-proxy-input-v1",
	MCD_PROXY_INPUT_V1_FRACTIONS,
);

const TRADELOCK_LIVE_FOREHEAD_INDICES = [108, 151, 337, 107, 9, 336] as const;

/**
 * TradeLock's primary live forehead rectangle. This is a replay/ablation
 * profile, not the SDK default and not the five-ROI MCD model profile.
 */
export const TRADELOCK_LIVE_FOREHEAD_V1_PROFILE: RoiGeometryProfile = {
	id: "tradelock-live-forehead-v1",
	roiNames: ["forehead"],
	compute(landmarks, width, height) {
		if (width <= 0 || height <= 0) return {};
		const selected = TRADELOCK_LIVE_FOREHEAD_INDICES.map(
			(index) => landmarks[index],
		);
		if (
			selected.some(
				(point) =>
					!point || !Number.isFinite(point.x) || !Number.isFinite(point.y),
			)
		) {
			return {};
		}
		const xs = selected.map((point) =>
			Math.floor(clamp(point!.x, 0, 1) * width),
		);
		const ys = selected.map((point) =>
			Math.floor(clamp(point!.y, 0, 1) * height),
		);
		const x0 = Math.max(0, Math.min(width - 1, Math.min(...xs)));
		const y0 = Math.max(0, Math.min(height - 1, Math.min(...ys)));
		const x1 = Math.min(width, Math.max(...xs));
		const y1 = Math.min(height, Math.max(...ys));
		if (x1 <= x0 || y1 <= y0) return {};
		return {
			forehead: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
		};
	},
};
