import type { FaceRoiName } from "../roiProfile";
import type { RppgRoiSampleV1 } from "../roiPixelSampler";
import {
	MCD_WAVEFORM_CHANNELS,
	MCD_WAVEFORM_ROIS,
	WaveformFeatureWindowBuilder,
} from "../waveformFeatureWindow";

function sample(roi: FaceRoiName, index: number, skinFraction = 0.8): RppgRoiSampleV1 {
	return {
		schema: "elata.rppg.roi-sample/v1",
		timestampMs: index * 40,
		roi,
		rgb: {
			r: 0.5 + Math.sin(index / 5) * 0.05,
			g: 0.6 + Math.sin(index / 4) * 0.04,
			b: 0.4 + Math.cos(index / 6) * 0.03,
		},
		quality: {
			skinFraction,
			effectiveSkinFraction: skinFraction,
			clipRatio: 0,
			meanLuma: 0.5,
			lumaStd: 0.1,
			pixelCount: 100,
			skinPixelCount: Math.round(skinFraction * 100),
			usedSkinPixels: true,
		},
		geometryProfileId: "mcd-proxy-input-v1",
		pixelSamplerId: "tradelock-rgb-weighted-v1",
	};
}

describe("WaveformFeatureWindowBuilder", () => {
	test("builds the frozen five-ROI, 15-channel model contract", () => {
		const builder = new WaveformFeatureWindowBuilder();
		for (let index = 0; index < 120; index++) {
			for (const roi of MCD_WAVEFORM_ROIS) builder.push(sample(roi, index));
		}
		const window = builder.build({ profileId: "mcd-proxy-input-v1" });
		expect(window).not.toBeNull();
		expect(window?.channels).toEqual(MCD_WAVEFORM_CHANNELS);
		expect(window?.data).toHaveLength(15 * 300);
		expect(window?.sourceSampleRate).toBeCloseTo(25);
		expect(window?.data.every(Number.isFinite)).toBe(true);
		expect(
			builder.build({ profileId: "wrong-profile", minSamples: 120 }),
		).toBeNull();
	});

	test("waits for every ROI and applies lower weight to lower-quality regions", () => {
		const builder = new WaveformFeatureWindowBuilder(20);
		for (let index = 0; index < 10; index++) {
			for (const roi of MCD_WAVEFORM_ROIS) {
				if (roi !== "broadFace" || index < 9) {
					builder.push(sample(roi, index, roi === "forehead" ? 0.1 : 0.9));
				}
			}
		}
		expect(builder.sampleCount).toBe(9);
		expect(
			builder.build({ profileId: "mcd-proxy-input-v1", minSamples: 10 }),
		).toBeNull();
	});
});
