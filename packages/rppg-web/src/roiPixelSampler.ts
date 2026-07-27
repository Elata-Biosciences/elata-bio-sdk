import type { Frame, ROI } from "./frameSource";
import type { FaceRoiName } from "./roiProfile";

export interface RppgRoiStatistics {
	/** RGB means normalized to 0..1. */
	r: number;
	g: number;
	b: number;
	/** Actual fraction of pixels accepted by the skin predicate. */
	skinFraction: number;
	/**
	 * Compatibility quality value. The current SDK floors this when it falls
	 * back to unmasked RGB; new model code should prefer `skinFraction`.
	 */
	effectiveSkinFraction: number;
	clipRatio: number;
	meanLuma: number;
	lumaStd: number;
	pixelCount: number;
	skinPixelCount: number;
	usedSkinPixels: boolean;
}

export interface RoiPixelSampler {
	readonly id: string;
	sample(frame: Frame, roi: ROI): RppgRoiStatistics;
}

export interface RppgRoiSampleV1 {
	schema: "elata.rppg.roi-sample/v1";
	timestampMs: number;
	roi: FaceRoiName;
	rgb: { r: number; g: number; b: number };
	quality: {
		skinFraction: number;
		effectiveSkinFraction: number;
		clipRatio: number;
		meanLuma: number;
		lumaStd: number;
		pixelCount: number;
		skinPixelCount: number;
		usedSkinPixels: boolean;
	};
	geometryProfileId: string;
	pixelSamplerId: string;
}

type PixelAccumulator = {
	fallbackR: number;
	fallbackG: number;
	fallbackB: number;
	luma: number;
	lumaSq: number;
	pixelCount: number;
	clipCount: number;
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function clampRoi(roi: ROI, frame: Frame): ROI {
	const x = Math.max(0, Math.min(frame.width, Math.floor(roi.x)));
	const y = Math.max(0, Math.min(frame.height, Math.floor(roi.y)));
	const w = Math.max(
		0,
		Math.min(frame.width - x, Math.floor(Math.max(0, roi.w))),
	);
	const h = Math.max(
		0,
		Math.min(frame.height - y, Math.floor(Math.max(0, roi.h))),
	);
	return { x, y, w, h };
}

function readPixel(frame: Frame, x: number, y: number) {
	const index = (y * frame.width + x) * 4;
	return {
		r: Number(frame.data[index] ?? 0),
		g: Number(frame.data[index + 1] ?? 0),
		b: Number(frame.data[index + 2] ?? 0),
	};
}

function accumulatePixel(
	accumulator: PixelAccumulator,
	r: number,
	g: number,
	b: number,
) {
	const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	accumulator.fallbackR += r;
	accumulator.fallbackG += g;
	accumulator.fallbackB += b;
	accumulator.luma += luma;
	accumulator.lumaSq += luma * luma;
	accumulator.pixelCount += 1;
	if (r < 5 || g < 5 || b < 5 || r > 250 || g > 250 || b > 250) {
		accumulator.clipCount += 1;
	}
}

function emptyStatistics(effectiveSkinFraction = 0): RppgRoiStatistics {
	return {
		r: 0,
		g: 0,
		b: 0,
		skinFraction: 0,
		effectiveSkinFraction,
		clipRatio: 0,
		meanLuma: 0,
		lumaStd: 0,
		pixelCount: 0,
		skinPixelCount: 0,
		usedSkinPixels: false,
	};
}

function finishStatistics(
	accumulator: PixelAccumulator,
	skinPixelCount: number,
	effectiveSkinFraction: number,
	usedSkinPixels: boolean,
	r: number,
	g: number,
	b: number,
): RppgRoiStatistics {
	if (accumulator.pixelCount === 0) {
		return emptyStatistics(effectiveSkinFraction);
	}
	const meanLuma = accumulator.luma / accumulator.pixelCount;
	const lumaStd = Math.sqrt(
		Math.max(
			0,
			accumulator.lumaSq / accumulator.pixelCount - meanLuma * meanLuma,
		),
	);
	return {
		r: clamp(r / 255, 0, 1),
		g: clamp(g / 255, 0, 1),
		b: clamp(b / 255, 0, 1),
		skinFraction: skinPixelCount / accumulator.pixelCount,
		effectiveSkinFraction,
		clipRatio: accumulator.clipCount / accumulator.pixelCount,
		meanLuma: meanLuma / 255,
		lumaStd: lumaStd / 255,
		pixelCount: accumulator.pixelCount,
		skinPixelCount,
		usedSkinPixels,
	};
}

export function isYcbcrSkinPixel(r: number, g: number, b: number): boolean {
	const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
	const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
	return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
}

export function isTradeLockSkinPixel(
	r: number,
	g: number,
	b: number,
): boolean {
	if (r < 40 || g < 20 || b < 20) return false;
	const sum = r + g + b + 1;
	const normalizedR = r / sum;
	const normalizedG = g / sum;
	const maxChannel = Math.max(r, g, b);
	const minChannel = Math.min(r, g, b);
	return (
		normalizedR > 0.33 &&
		normalizedR < 0.6 &&
		normalizedG > 0.24 &&
		normalizedG < 0.45 &&
		maxChannel - minChannel > 12 &&
		r > b
	);
}

export function tradeLockSpatialWeight(
	x: number,
	y: number,
	width: number,
	height: number,
): number {
	const centerX = width / 2;
	const centerY = height / 2;
	const normalizedX = (x - centerX) / (centerX + 1);
	const normalizedY = (y - centerY) / (centerY + 1);
	const distance = Math.sqrt(
		normalizedX * normalizedX + normalizedY * normalizedY,
	);
	return clamp(1 - distance * 0.8, 0.2, 1);
}

export const ELATA_YCBCR_V1_PIXEL_SAMPLER: RoiPixelSampler = {
	id: "elata-ycbcr-v1",
	sample(frame, roi) {
		const clamped = clampRoi(roi, frame);
		const accumulator: PixelAccumulator = {
			fallbackR: 0,
			fallbackG: 0,
			fallbackB: 0,
			luma: 0,
			lumaSq: 0,
			pixelCount: 0,
			clipCount: 0,
		};
		let skinR = 0;
		let skinG = 0;
		let skinB = 0;
		let skinPixelCount = 0;

		for (let row = clamped.y; row < clamped.y + clamped.h; row++) {
			for (let column = clamped.x; column < clamped.x + clamped.w; column++) {
				const { r, g, b } = readPixel(frame, column, row);
				accumulatePixel(accumulator, r, g, b);
				if (!isYcbcrSkinPixel(r, g, b)) continue;
				skinR += r;
				skinG += g;
				skinB += b;
				skinPixelCount += 1;
			}
		}

		const rawSkinFraction =
			accumulator.pixelCount > 0 ? skinPixelCount / accumulator.pixelCount : 0;
		const minimumEffectiveSkinFraction =
			accumulator.pixelCount > 0
				? Math.max(0.1, 10 / accumulator.pixelCount)
				: 0.1;
		const usedSkinPixels =
			skinPixelCount >= Math.max(10, Math.floor(accumulator.pixelCount * 0.1));
		const divisor = usedSkinPixels
			? Math.max(1, skinPixelCount)
			: Math.max(1, accumulator.pixelCount);
		return finishStatistics(
			accumulator,
			skinPixelCount,
			usedSkinPixels
				? rawSkinFraction
				: Math.max(rawSkinFraction, minimumEffectiveSkinFraction),
			usedSkinPixels,
			(usedSkinPixels ? skinR : accumulator.fallbackR) / divisor,
			(usedSkinPixels ? skinG : accumulator.fallbackG) / divisor,
			(usedSkinPixels ? skinB : accumulator.fallbackB) / divisor,
		);
	},
};

export const TRADELOCK_RGB_WEIGHTED_V1_PIXEL_SAMPLER: RoiPixelSampler = {
	id: "tradelock-rgb-weighted-v1",
	sample(frame, roi) {
		const clamped = clampRoi(roi, frame);
		const accumulator: PixelAccumulator = {
			fallbackR: 0,
			fallbackG: 0,
			fallbackB: 0,
			luma: 0,
			lumaSq: 0,
			pixelCount: 0,
			clipCount: 0,
		};
		let weightedR = 0;
		let weightedG = 0;
		let weightedB = 0;
		let weightTotal = 0;
		let skinPixelCount = 0;

		for (let row = clamped.y; row < clamped.y + clamped.h; row++) {
			for (let column = clamped.x; column < clamped.x + clamped.w; column++) {
				const { r, g, b } = readPixel(frame, column, row);
				accumulatePixel(accumulator, r, g, b);
				if (!isTradeLockSkinPixel(r, g, b)) continue;
				const weight = tradeLockSpatialWeight(
					column - clamped.x,
					row - clamped.y,
					clamped.w,
					clamped.h,
				);
				weightedR += r * weight;
				weightedG += g * weight;
				weightedB += b * weight;
				weightTotal += weight;
				skinPixelCount += 1;
			}
		}

		const usedSkinPixels =
			weightTotal > 0 &&
			accumulator.pixelCount > 0 &&
			weightTotal / accumulator.pixelCount > 0.01;
		const divisor = usedSkinPixels
			? weightTotal
			: Math.max(1, accumulator.pixelCount);
		const skinFraction =
			accumulator.pixelCount > 0 ? skinPixelCount / accumulator.pixelCount : 0;
		return finishStatistics(
			accumulator,
			skinPixelCount,
			skinFraction,
			usedSkinPixels,
			(usedSkinPixels ? weightedR : accumulator.fallbackR) / divisor,
			(usedSkinPixels ? weightedG : accumulator.fallbackG) / divisor,
			(usedSkinPixels ? weightedB : accumulator.fallbackB) / divisor,
		);
	},
};

export function sampleRppgRoi(
	frame: Frame,
	roi: FaceRoiName,
	rect: ROI,
	geometryProfileId: string,
	pixelSampler: RoiPixelSampler = ELATA_YCBCR_V1_PIXEL_SAMPLER,
): RppgRoiSampleV1 {
	const statistics = pixelSampler.sample(frame, rect);
	return {
		schema: "elata.rppg.roi-sample/v1",
		timestampMs: frame.timestampMs ?? Date.now(),
		roi,
		rgb: {
			r: statistics.r,
			g: statistics.g,
			b: statistics.b,
		},
		quality: {
			skinFraction: statistics.skinFraction,
			effectiveSkinFraction: statistics.effectiveSkinFraction,
			clipRatio: statistics.clipRatio,
			meanLuma: statistics.meanLuma,
			lumaStd: statistics.lumaStd,
			pixelCount: statistics.pixelCount,
			skinPixelCount: statistics.skinPixelCount,
			usedSkinPixels: statistics.usedSkinPixels,
		},
		geometryProfileId,
		pixelSamplerId: pixelSampler.id,
	};
}
