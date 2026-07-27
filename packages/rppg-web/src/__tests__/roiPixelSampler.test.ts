import type { Frame } from "../frameSource";
import {
	ELATA_YCBCR_V1_PIXEL_SAMPLER,
	TRADELOCK_RGB_WEIGHTED_V1_PIXEL_SAMPLER,
	sampleRppgRoi,
} from "../roiPixelSampler";

function solidFrame(
	width: number,
	height: number,
	r: number,
	g: number,
	b: number,
): Frame {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let index = 0; index < width * height; index++) {
		data[index * 4] = r;
		data[index * 4 + 1] = g;
		data[index * 4 + 2] = b;
		data[index * 4 + 3] = 255;
	}
	return { data, width, height, timestampMs: 1234 };
}

describe("ROI pixel samplers", () => {
	test("reports raw and effective skin fractions separately", () => {
		const frame = solidFrame(10, 10, 0, 0, 255);
		const result = ELATA_YCBCR_V1_PIXEL_SAMPLER.sample(frame, {
			x: 0,
			y: 0,
			w: 10,
			h: 10,
		});

		expect(result.skinFraction).toBe(0);
		expect(result.effectiveSkinFraction).toBe(0.1);
		expect(result.usedSkinPixels).toBe(false);
		expect(result.b).toBe(1);
		expect(result.clipRatio).toBe(1);
	});

	test("uses YCbCr skin pixels when the legacy threshold is met", () => {
		const frame = solidFrame(10, 10, 160, 100, 80);
		const result = ELATA_YCBCR_V1_PIXEL_SAMPLER.sample(frame, {
			x: 0,
			y: 0,
			w: 10,
			h: 10,
		});

		expect(result.usedSkinPixels).toBe(true);
		expect(result.skinFraction).toBe(1);
		expect(result.r).toBeCloseTo(160 / 255);
		expect(result.g).toBeCloseTo(100 / 255);
		expect(result.b).toBeCloseTo(80 / 255);
	});

	test("replays TradeLock normalized-RGB masking and center weighting", () => {
		const frame = solidFrame(3, 3, 0, 0, 255);
		const center = (1 * 3 + 1) * 4;
		frame.data[center] = 180;
		frame.data[center + 1] = 100;
		frame.data[center + 2] = 70;
		const result = TRADELOCK_RGB_WEIGHTED_V1_PIXEL_SAMPLER.sample(frame, {
			x: 0,
			y: 0,
			w: 3,
			h: 3,
		});

		expect(result.usedSkinPixels).toBe(true);
		expect(result.skinFraction).toBeCloseTo(1 / 9);
		expect(result.r).toBeCloseTo(180 / 255);
		expect(result.g).toBeCloseTo(100 / 255);
		expect(result.b).toBeCloseTo(70 / 255);
	});

	test("emits a versioned, traceable ROI sample contract", () => {
		const frame = solidFrame(10, 10, 160, 100, 80);
		const sample = sampleRppgRoi(
			frame,
			"forehead",
			{ x: 0, y: 0, w: 10, h: 10 },
			"mcd-proxy-input-v1",
		);

		expect(sample).toMatchObject({
			schema: "elata.rppg.roi-sample/v1",
			timestampMs: 1234,
			roi: "forehead",
			geometryProfileId: "mcd-proxy-input-v1",
			pixelSamplerId: "elata-ycbcr-v1",
		});
		expect(sample.quality.pixelCount).toBe(100);
	});
});
