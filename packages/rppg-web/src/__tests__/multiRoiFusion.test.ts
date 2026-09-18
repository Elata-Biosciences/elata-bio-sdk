import {
	FUSION_ROIS,
	MultiRoiRppgFuser,
	type MultiRoiFusionResult,
	type RoiRgbSample,
} from "../multiRoiFusion";

// Deterministic PRNG so the test is stable across runs.
function makeRng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0xffffffff;
	};
}

describe("MultiRoiRppgFuser", () => {
	test("FUSION_ROIS covers forehead and both cheeks", () => {
		expect([...FUSION_ROIS].sort()).toEqual([
			"forehead",
			"leftCheek",
			"rightCheek",
		]);
	});

	test("weights stay normalized and a clean ROI dominates a noisy one", () => {
		const fs = 30;
		const fuser = new MultiRoiRppgFuser(fs, 8);
		const rng = makeRng(1234);
		const freq = 1; // 60 bpm, inside the cardiac band.

		let last: MultiRoiFusionResult | null = null;
		for (let i = 0; i < 360; i++) {
			const tSec = i / fs;
			const pulse = Math.sin(2 * Math.PI * freq * tSec);
			// Forehead: coherent pulsatile modulation (green carries most of it).
			const forehead: RoiRgbSample = {
				r: 180 + 0.3 * pulse,
				g: 120 + 1.0 * pulse,
				b: 110 + 0.2 * pulse,
				skinFraction: 0.9,
			};
			// Cheeks: broadband noise, no coherent pulse.
			const noise = (): RoiRgbSample => ({
				r: 180 + (rng() - 0.5) * 4,
				g: 120 + (rng() - 0.5) * 4,
				b: 110 + (rng() - 0.5) * 4,
				skinFraction: 0.9,
			});
			last = fuser.pushFrame({
				forehead,
				leftCheek: noise(),
				rightCheek: noise(),
			});
		}

		expect(last).not.toBeNull();
		const result = last as MultiRoiFusionResult;
		expect(result.valid).toBe(true);

		const weightSum = FUSION_ROIS.reduce(
			(acc, roi) => acc + result.weights[roi],
			0,
		);
		expect(weightSum).toBeCloseTo(1, 5);

		// The clean forehead should out-weight each noisy cheek and carry a
		// stronger in-band SNR.
		expect(result.weights.forehead).toBeGreaterThan(result.weights.leftCheek);
		expect(result.weights.forehead).toBeGreaterThan(result.weights.rightCheek);
		expect(result.snr.forehead).toBeGreaterThan(result.snr.leftCheek);
		// Fused signal should look periodic (SNR meaningfully above the ~1 floor).
		expect(result.fusedSnr).toBeGreaterThan(1.5);
	});

	test("skips ROIs below the minimum skin fraction and stays valid via others", () => {
		const fuser = new MultiRoiRppgFuser(30, 8);
		const result = fuser.pushFrame({
			forehead: { r: 180, g: 120, b: 110, skinFraction: 0.9 },
			leftCheek: { r: 180, g: 120, b: 110, skinFraction: 0.02 },
		});
		expect(result.valid).toBe(true);
		expect(Number.isFinite(result.fused)).toBe(true);
	});

	test("reset clears state back to equal weighting", () => {
		const fuser = new MultiRoiRppgFuser(30, 8);
		for (let i = 0; i < 100; i++) {
			fuser.pushFrame({
				forehead: { r: 180 + Math.sin(i), g: 120, b: 110, skinFraction: 0.9 },
			});
		}
		fuser.reset();
		const result = fuser.pushFrame({
			forehead: { r: 180, g: 120, b: 110, skinFraction: 0.9 },
		});
		for (const roi of FUSION_ROIS) {
			expect(result.weights[roi]).toBeCloseTo(1 / FUSION_ROIS.length, 5);
		}
	});
});
