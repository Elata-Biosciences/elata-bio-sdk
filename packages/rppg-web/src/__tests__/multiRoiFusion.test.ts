import {
	FUSION_ROIS,
	MultiRoiRppgFuser,
	type MultiRoiFusionResult,
	type RoiRgbSample,
} from "../multiRoiFusion";
import { Bandpass, ChromPulseModel } from "../rppgSignalModel";

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

	test("fuses in RGB-space (weights blend raw RGB before a single shared CHROM+bandpass), not by weighting per-ROI CHROM outputs", () => {
		// Verify by construction: independently reproduce what `fused` should be
		// if (and only if) fusion happens by (1) weighting raw RGB per ROI, then
		// (2) running ONE shared CHROM+bandpass over the blend. If the module
		// instead weighted each ROI's own CHROM+bandpass output (the old, biased
		// design this fix replaces), this diverges once CHROM's window fills in
		// (a single frame isn't enough to distinguish the two: CHROM needs
		// several samples before it outputs anything non-zero either way).
		const fs = 30;
		// updateEverySeconds huge so weights never leave their equal starting
		// point mid-run, isolating the RGB-vs-post-CHROM blending question from
		// the (separately tested) weight-adaptation behaviour.
		const fuser = new MultiRoiRppgFuser(fs, 8, 1000);
		const rng = makeRng(99);

		const refChrom = new ChromPulseModel();
		const refBand = new Bandpass(fs, 0.7, 4.0);
		const w = 1 / FUSION_ROIS.length;

		let result: MultiRoiFusionResult | null = null;
		let expectedFused = 0;
		for (let i = 0; i < 90; i++) {
			const forehead: RoiRgbSample = {
				r: 182 + (rng() - 0.5) * 2,
				g: 121 + (rng() - 0.5) * 2,
				b: 109 + (rng() - 0.5) * 2,
				skinFraction: 0.9,
			};
			const leftCheek: RoiRgbSample = {
				r: 176 + (rng() - 0.5) * 2,
				g: 118 + (rng() - 0.5) * 2,
				b: 112 + (rng() - 0.5) * 2,
				skinFraction: 0.9,
			};
			const rightCheek: RoiRgbSample = {
				r: 179 + (rng() - 0.5) * 2,
				g: 122 + (rng() - 0.5) * 2,
				b: 111 + (rng() - 0.5) * 2,
				skinFraction: 0.9,
			};

			const expectedR = w * forehead.r + w * leftCheek.r + w * rightCheek.r;
			const expectedG = w * forehead.g + w * leftCheek.g + w * rightCheek.g;
			const expectedB = w * forehead.b + w * leftCheek.b + w * rightCheek.b;
			expectedFused = refBand.process(
				refChrom.process(expectedR, expectedG, expectedB),
			);

			result = fuser.pushFrame({ forehead, leftCheek, rightCheek });
		}

		expect(result).not.toBeNull();
		const r = result as MultiRoiFusionResult;
		expect(r.valid).toBe(true);
		// Non-zero: proves CHROM's window has filled and this is a meaningful
		// comparison, not two zeros agreeing trivially.
		expect(Math.abs(expectedFused)).toBeGreaterThan(0);
		expect(r.fused).toBeCloseTo(expectedFused, 10);
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
