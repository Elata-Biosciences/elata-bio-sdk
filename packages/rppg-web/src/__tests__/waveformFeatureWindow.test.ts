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
		expect(Array.from(window!.data.slice(0, 8))).toEqual([
			-0.04962163046002388, 0.09074826538562775, 0.2311202883720398,
			0.36723944544792175, 0.4988826811313629, 0.6305259466171265,
			0.7456845641136169, 0.8604161739349365,
		]);
		expect(Array.from(window!.data.slice(300, 308))).toEqual([
			-0.38640376925468445, -0.360948771238327, -0.335493803024292,
			-0.30938035249710083, -0.2825743854045868, -0.25576841831207275,
			-0.23048299551010132, -0.20523692667484283,
		]);
		expect(Array.from(window!.data.slice(600, 608))).toEqual([
			1.0763803720474243, 0.939119815826416, 0.8018593192100525,
			0.6627348065376282, 0.5216500759124756, 0.3805653750896454,
			0.24345742166042328, 0.1064523458480835,
		]);
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

	test("uses only timestamps shared by every ROI", () => {
		const builder = new WaveformFeatureWindowBuilder(150);
		for (let index = 0; index < 125; index++) {
			for (const roi of MCD_WAVEFORM_ROIS) {
				const point = sample(roi, index);
				if (roi === "broadFace") point.timestampMs += 1;
				builder.push(point);
			}
		}
		expect(
			builder.build({ profileId: "mcd-proxy-input-v1", minSamples: 120 }),
		).toBeNull();
		expect(builder.lastFailureReason).toBe("timestamp_mismatch");
	});

	test("reports manifest channel and profile failures", () => {
		const builder = new WaveformFeatureWindowBuilder();
		for (let index = 0; index < 120; index++) {
			for (const roi of MCD_WAVEFORM_ROIS) builder.push(sample(roi, index));
		}
		expect(
			builder.build({
				profileId: "mcd-proxy-input-v1",
				channels: ["roi:not-a-region:green"],
			}),
		).toBeNull();
		expect(builder.lastFailureReason).toBe("channel_mismatch");
		expect(builder.build({ profileId: "wrong-profile" })).toBeNull();
		expect(builder.lastFailureReason).toBe("profile_mismatch");
	});
});
