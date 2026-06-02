import {
	computeRmssdMs,
	detectBeatsViaHilbertPhase,
	type PulsePeak,
} from "../pulseAnalysis";

// A clean sinusoidal pulse at a known rate, sampled on a fixed frame grid.
function makeSinePulse(
	bpm: number,
	fs: number,
	durationSec: number,
	noise = 0,
): PulsePeak[] {
	const freq = bpm / 60;
	const dt = 1000 / fs;
	const out: PulsePeak[] = [];
	const n = Math.round(durationSec * fs);
	for (let i = 0; i < n; i++) {
		const tMs = i * dt;
		const value =
			Math.sin((2 * Math.PI * freq * tMs) / 1000) +
			(noise ? (Math.sin(i * 12.9898) * 43758.5453) % noise : 0);
		out.push({ value, time: tMs });
	}
	return out;
}

describe("computeRmssdMs", () => {
	test("matches the textbook successive-difference formula", () => {
		// diffs: +50, -50, +50 -> mean square = 2500 -> sqrt = 50.
		expect(computeRmssdMs([800, 850, 800, 850])).toBeCloseTo(50, 6);
	});

	test("returns null for fewer than two intervals", () => {
		expect(computeRmssdMs([])).toBeNull();
		expect(computeRmssdMs([900])).toBeNull();
	});
});

describe("detectBeatsViaHilbertPhase", () => {
	test("recovers the beat rate from a clean synthetic pulse", () => {
		const data = makeSinePulse(60, 30, 30);
		const { ibisMs, beatTimesMs } = detectBeatsViaHilbertPhase(data, {
			sampleRate: 30,
		});

		expect(beatTimesMs.length).toBeGreaterThan(20);
		const meanIbi = ibisMs.reduce((a, b) => a + b, 0) / ibisMs.length;
		// ~1000 ms at 60 bpm.
		expect(meanIbi).toBeGreaterThan(950);
		expect(meanIbi).toBeLessThan(1050);
	});

	test("recovers a faster rate too", () => {
		const data = makeSinePulse(90, 30, 30);
		const { ibisMs } = detectBeatsViaHilbertPhase(data, { sampleRate: 30 });
		const meanIbi = ibisMs.reduce((a, b) => a + b, 0) / ibisMs.length;
		// ~667 ms at 90 bpm.
		expect(meanIbi).toBeGreaterThan(620);
		expect(meanIbi).toBeLessThan(710);
	});

	test("a clean periodic pulse yields a small beat-to-beat RMSSD", () => {
		const data = makeSinePulse(72, 30, 30);
		const { ibisMs } = detectBeatsViaHilbertPhase(data, { sampleRate: 30 });
		const rmssd = computeRmssdMs(ibisMs) ?? Number.POSITIVE_INFINITY;
		// A perfectly periodic signal should have near-zero RMSSD; allow slack
		// for frame quantization and the naive-DFT edge behaviour.
		expect(rmssd).toBeLessThan(40);
	});

	test("is empty / safe on too-short input", () => {
		expect(detectBeatsViaHilbertPhase([]).ibisMs).toEqual([]);
		expect(
			detectBeatsViaHilbertPhase([
				{ value: 1, time: 0 },
				{ value: 2, time: 33 },
			]).ibisMs,
		).toEqual([]);
	});
});
