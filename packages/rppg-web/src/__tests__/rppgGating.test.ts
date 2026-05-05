import { RppgGatingController } from "../rppgGating";

describe("RppgGatingController", () => {
	test("holds stable BPM during motion hold window", () => {
		const gate = new RppgGatingController({
			motionGateThreshold: 0.15,
			motionHoldMs: 2000,
			stableDisplayHoldMs: 2500,
		});

		// Establish a stable BPM.
		const t0 = 1000;
		const r1 = gate.update({
			nowMs: t0,
			metrics: {
				bpm: 72,
				confidence: 0.7,
				signal_quality: 0.6,
				skin_ratio_mean: 0.3,
				motion_mean: 0.02,
				baseline_bpm: 70,
			},
		});
		expect(r1.publishBpm).toBe(72);
		expect(r1.state).toBe("active");

		// High motion should enter motion hold and keep last stable BPM.
		const r2 = gate.update({
			nowMs: t0 + 100,
			metrics: {
				bpm: 80, // noisy candidate
				confidence: 0.4,
				signal_quality: 0.6,
				skin_ratio_mean: 0.3,
				motion_mean: 0.25,
				baseline_bpm: 70,
			},
		});
		expect(r2.holding).toBe(true);
		expect(r2.state).toBe("motion_hold");
		expect(r2.publishBpm).toBe(72);

		// Still within hold window — remain holding.
		const r3 = gate.update({
			nowMs: t0 + 1500,
			metrics: {
				bpm: 90,
				confidence: 0.2,
				signal_quality: 0.6,
				skin_ratio_mean: 0.3,
				motion_mean: 0.18,
				baseline_bpm: 70,
			},
		});
		expect(r3.holding).toBe(true);
		expect(r3.publishBpm).toBe(72);

		// Past hold window and motion low — should resume.
		const r4 = gate.update({
			nowMs: t0 + 2200,
			metrics: {
				bpm: 74,
				confidence: 0.7,
				signal_quality: 0.6,
				skin_ratio_mean: 0.3,
				motion_mean: 0.02,
				baseline_bpm: 70,
			},
		});
		expect(r4.holding).toBe(false);
		expect(r4.state).toBe("active");
		expect(r4.publishBpm).toBe(74);
	});

	test("brief dropout keeps last stable BPM", () => {
		const gate = new RppgGatingController({ stableDisplayHoldMs: 2500 });
		const t0 = 5000;

		gate.update({
			nowMs: t0,
			metrics: {
				bpm: 65,
				confidence: 0.7,
				signal_quality: 0.6,
				skin_ratio_mean: 0.25,
				motion_mean: 0.01,
				baseline_bpm: 64,
			},
		});

		const dropout = gate.update({
			nowMs: t0 + 800,
			metrics: {
				bpm: null,
				confidence: 0,
				signal_quality: 0.5,
				skin_ratio_mean: 0.25,
				motion_mean: 0.01,
				baseline_bpm: 64,
			},
		});
		expect(dropout.publishBpm).toBe(65);
	});

	test("guidance prefers face then light", () => {
		const gate = new RppgGatingController({
			minSkinRatio: 0.12,
			minSignalQualityForPulse: 0.25,
		});
		const t0 = 0;

		const noFace = gate.update({
			nowMs: t0,
			metrics: {
				bpm: null,
				confidence: 0,
				signal_quality: 0.9,
				skin_ratio_mean: 0.01,
				motion_mean: 0.01,
			},
		});
		expect(noFace.state).toBe("needs_face");
		expect(noFace.guidance.code).toBe("no_face");

		const lowLight = gate.update({
			nowMs: t0 + 100,
			metrics: {
				bpm: null,
				confidence: 0,
				signal_quality: 0.1,
				skin_ratio_mean: 0.3,
				motion_mean: 0.01,
			},
		});
		expect(lowLight.state).toBe("needs_light");
		expect(lowLight.guidance.code).toBe("increase_lighting");
	});

	test("surfaces face mesh alignment guidance without changing BPM state", () => {
		const gate = new RppgGatingController({});
		const misaligned = gate.update({
			nowMs: 0,
			hasFace: true,
			faceMeshAlignment: {
				aligned: false,
				faceWidthRatio: 0.08,
				noseY: 0.4,
				guidance: {
					code: "face_move_closer",
					message: "Move Closer",
				},
			},
			metrics: {
				bpm: 72,
				confidence: 0.7,
				signal_quality: 0.6,
				skin_ratio_mean: 0.3,
				motion_mean: 0.02,
				baseline_bpm: 70,
			},
		});
		expect(misaligned.faceAlignmentGuidance?.code).toBe("face_move_closer");
		expect(misaligned.state).toBe("active");
		expect(misaligned.publishBpm).toBe(72);

		const aligned = gate.update({
			nowMs: 100,
			hasFace: true,
			faceMeshAlignment: {
				aligned: true,
				faceWidthRatio: 0.35,
				noseY: 0.42,
				guidance: null,
			},
			metrics: {
				bpm: 72,
				confidence: 0.7,
				signal_quality: 0.6,
				skin_ratio_mean: 0.3,
				motion_mean: 0.02,
				baseline_bpm: 70,
			},
		});
		expect(aligned.faceAlignmentGuidance).toBeNull();
	});
});

