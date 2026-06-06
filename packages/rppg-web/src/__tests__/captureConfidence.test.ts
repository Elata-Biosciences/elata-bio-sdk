import { BaselineCalibrator } from "../baselineCalibrator";
import {
	CAPTURE_MOTION_RELIABILITY,
	CaptureConfidenceScorer,
	scoreCaptureFeatures,
} from "../captureConfidence";

const goodLighting = { clipRatio: 0, skinRatio: 0.8, meanLuma: 0.5 };

describe("scoreCaptureFeatures", () => {
	it("scores a still, well-lit capture near 1 with no limiting factor", () => {
		const r = scoreCaptureFeatures({
			ti: 0,
			fmx: 0,
			fmy: 0,
			fsm: 0,
			...goodLighting,
		});
		expect(r.score).toBeGreaterThan(0.95);
		expect(r.motion).toBeGreaterThan(0.95);
		expect(r.lighting).toBeGreaterThan(0.95);
		expect(r.limiting).toBeNull();
		expect(r.reasons).toHaveLength(0);
	});

	it("flags motion as the limiting factor under high TI", () => {
		const r = scoreCaptureFeatures({
			ti: 1,
			fmx: 0,
			fmy: 0,
			fsm: 0,
			...goodLighting,
		});
		expect(r.limiting).toBe("motion");
		expect(r.motion).toBeLessThan(r.lighting);
		expect(r.reasons).toContain("high_ti");
	});

	it("flags x-translation distinctly from y-translation", () => {
		const r = scoreCaptureFeatures({
			ti: 0,
			fmx: 1,
			fmy: 0,
			fsm: 0,
			...goodLighting,
		});
		expect(r.reasons).toContain("face_translation_x");
		expect(r.reasons).not.toContain("face_translation_y");
		expect(r.limiting).toBe("motion");
	});

	it("flags lighting as limiting under clipping", () => {
		const r = scoreCaptureFeatures({
			ti: 0,
			fmx: 0,
			fmy: 0,
			fsm: 0,
			clipRatio: 1,
			skinRatio: 0.8,
			meanLuma: 0.5,
		});
		expect(r.limiting).toBe("lighting");
		expect(r.lighting).toBeLessThan(r.motion);
		expect(r.reasons).toContain("clipping");
	});

	it("distinguishes low light from bright light", () => {
		const dark = scoreCaptureFeatures({
			ti: 0,
			fmx: 0,
			fmy: 0,
			fsm: 0,
			clipRatio: 0,
			skinRatio: 0.8,
			meanLuma: 0,
		});
		expect(dark.reasons).toContain("low_light");
		const bright = scoreCaptureFeatures({
			ti: 0,
			fmx: 0,
			fmy: 0,
			fsm: 0,
			clipRatio: 0,
			skinRatio: 0.8,
			meanLuma: 1,
		});
		expect(bright.reasons).toContain("bright_light");
	});

	it("does not penalize lighting cues that are absent", () => {
		const r = scoreCaptureFeatures({ ti: 0, fmx: 0, fmy: 0, fsm: 0 });
		expect(r.lighting).toBe(1);
	});

	it("derives per-feature reliabilities from the published correlations", () => {
		// Normalized to the strongest cue (TI = 1), ordered by paper PCC.
		expect(CAPTURE_MOTION_RELIABILITY.ti).toBeCloseTo(1, 6);
		expect(CAPTURE_MOTION_RELIABILITY.fmy).toBeGreaterThan(
			CAPTURE_MOTION_RELIABILITY.fmx,
		);
		expect(CAPTURE_MOTION_RELIABILITY.fmx).toBeGreaterThan(
			CAPTURE_MOTION_RELIABILITY.fsm,
		);
	});
});

// A square of landmarks spanning ~0.3 of the frame, optionally translated.
function squareLandmarks(originX = 0.35, originY = 0.35) {
	return [
		{ x: originX, y: originY },
		{ x: originX + 0.3, y: originY },
		{ x: originX, y: originY + 0.3 },
		{ x: originX + 0.3, y: originY + 0.3 },
	];
}

describe("CaptureConfidenceScorer", () => {
	it("is not ready until the window has enough frames", () => {
		const scorer = new CaptureConfidenceScorer({ minSamples: 8 });
		let last = scorer.push({ landmarks: squareLandmarks(), ...goodLighting });
		expect(last.ready).toBe(false);
		for (let i = 0; i < 10; i++) {
			last = scorer.push({ landmarks: squareLandmarks(), ...goodLighting });
		}
		expect(last.ready).toBe(true);
	});

	it("reports high confidence for a still, well-lit face", () => {
		const scorer = new CaptureConfidenceScorer();
		let last = scorer.push({ landmarks: squareLandmarks(), ...goodLighting });
		for (let i = 0; i < 12; i++) {
			last = scorer.push({ landmarks: squareLandmarks(), ...goodLighting });
		}
		expect(last.score).toBeGreaterThan(0.8);
		expect(last.limiting).toBeNull();
	});

	it("detects sustained head translation as a motion limit", () => {
		const scorer = new CaptureConfidenceScorer();
		let last = scorer.push({ landmarks: squareLandmarks(0), ...goodLighting });
		// Shift the whole face ~0.03/frame in x — well past faceMotionBadAt.
		for (let i = 1; i <= 14; i++) {
			last = scorer.push({
				landmarks: squareLandmarks(i * 0.03, 0),
				...goodLighting,
			});
		}
		expect(last.limiting).toBe("motion");
		expect(last.reasons).toContain("face_translation_x");
		expect(last.motion).toBeLessThan(0.6);
	});

	it("resets cleanly", () => {
		const scorer = new CaptureConfidenceScorer();
		scorer.push({ landmarks: squareLandmarks(), ...goodLighting });
		scorer.reset();
		const last = scorer.push({ landmarks: squareLandmarks(), ...goodLighting });
		expect(last.ready).toBe(false);
	});
});

describe("BaselineCalibrator capture gating", () => {
	it("pauses progress and reports the stall reason when confidence is low", () => {
		const cal = new BaselineCalibrator();
		for (let i = 0; i < 10; i++) {
			cal.push(72, 40, 1, {
				score: 0.2,
				limiting: "motion",
				reasons: ["high_ti"],
			});
		}
		expect(cal.sampleCount).toBe(0);
		expect(cal.captureGatedCount).toBe(10);
		expect(cal.stallReason).toEqual({ limiting: "motion", reasons: ["high_ti"] });
		expect(cal.progress).toBe(0);
	});

	it("accepts readings once confidence clears the floor and clears the stall", () => {
		const cal = new BaselineCalibrator();
		cal.push(72, 40, 1, { score: 0.2, limiting: "lighting", reasons: ["clipping"] });
		expect(cal.stallReason?.limiting).toBe("lighting");
		cal.push(72, 40, 1, { score: 0.9, limiting: null, reasons: [] });
		expect(cal.sampleCount).toBe(1);
		expect(cal.stallReason).toBeNull();
	});

	it("is unchanged when no capture gate is supplied", () => {
		const cal = new BaselineCalibrator();
		for (let i = 0; i < 5; i++) cal.push(72, 40, 1);
		expect(cal.sampleCount).toBe(5);
		expect(cal.captureGatedCount).toBe(0);
		expect(cal.stallReason).toBeNull();
	});
});
