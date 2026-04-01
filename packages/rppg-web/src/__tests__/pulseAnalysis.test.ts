import {
	analyzePulseWindow,
	calculateBpmViaAutocorrelation,
	detectPeaks,
	rmssdFromPeaks,
	type PulsePeak,
	type PulseWindowSample,
} from "../pulseAnalysis";

function buildSamples(
	values: number[],
	sampleRate: number,
	overrides: Partial<Omit<PulseWindowSample, "timestampMs" | "intensity">> = {},
): PulseWindowSample[] {
	return values.map((intensity, index) => ({
		timestampMs: index * (1000 / sampleRate),
		intensity,
		skinRatio: overrides.skinRatio ?? 0.95,
		motion: overrides.motion ?? 0.01,
		clipRatio: overrides.clipRatio ?? 0.01,
	}));
}

describe("pulseAnalysis", () => {
	test("analyzePulseWindow returns spectral, acf, peaks, and respiration estimates", () => {
		const sampleRate = 30;
		const durationSec = 12;
		const total = sampleRate * durationSec;
		const values = Array.from({ length: total }, (_, index) => {
			const t = index / sampleRate;
			const hr = 0.5 + 0.2 * Math.sin(2 * Math.PI * 1.2 * t);
			const respiration = 0.04 * Math.sin(2 * Math.PI * 0.25 * t);
			return hr + respiration;
		});

		const analysis = analyzePulseWindow(buildSamples(values, sampleRate));

		expect(analysis).not.toBeNull();
		expect(analysis?.spectral?.bpm).toBeGreaterThan(60);
		expect(analysis?.spectral?.bpm).toBeLessThan(90);
		expect(analysis?.acf?.bpm).toBeGreaterThan(40);
		expect(analysis?.acf?.bpm).toBeLessThan(180);
		expect(analysis?.peaks?.bpm).toBeGreaterThan(40);
		expect(analysis?.peaks?.bpm).toBeLessThan(180);
		expect(analysis?.respiration).toBeGreaterThanOrEqual(4);
		expect(analysis?.respiration).toBeLessThanOrEqual(24);
		expect(analysis?.hrvRmssd == null || analysis.hrvRmssd >= 0).toBe(true);
	});

	test("analyzePulseWindow quality reflects motion and clipping penalties", () => {
		const sampleRate = 30;
		const durationSec = 12;
		const total = sampleRate * durationSec;
		const values = Array.from({ length: total }, (_, index) => {
			const t = index / sampleRate;
			return 0.5 + 0.2 * Math.sin(2 * Math.PI * 1.2 * t);
		});

		const clean = analyzePulseWindow(
			buildSamples(values, sampleRate, {
				skinRatio: 0.95,
				motion: 0.01,
				clipRatio: 0.01,
			}),
		);
		const noisy = analyzePulseWindow(
			buildSamples(values, sampleRate, {
				skinRatio: 0.5,
				motion: 0.5,
				clipRatio: 0.5,
			}),
		);

		expect(clean).not.toBeNull();
		expect(noisy).not.toBeNull();
		expect(clean?.quality ?? 0).toBeGreaterThan(noisy?.quality ?? 1);
		expect(clean?.motionMean ?? 1).toBeLessThan(noisy?.motionMean ?? 0);
	});

	test("autocorrelation reports harmonic relations for plausible octave cases", () => {
		const sampleRate = 30;
		const total = sampleRate * 12;
		const values = Array.from({ length: total }, (_, index) => {
			const t = index / sampleRate;
			return Math.sin(2 * Math.PI * 1.2 * t);
		});

		const result = calculateBpmViaAutocorrelation(values, sampleRate, 72);

		expect(result).not.toBeNull();
		expect(["fundamental", "half", "double"]).toContain(
			result?.harmonicRelation,
		);
	});

	test("peak helpers yield non-zero RMSSD for irregular intervals", () => {
		const peaks: PulsePeak[] = [
			{ time: 0, value: 1 },
			{ time: 820, value: 1 },
			{ time: 1670, value: 1 },
			{ time: 2460, value: 1 },
			{ time: 3320, value: 1 },
		];

		const rmssd = rmssdFromPeaks(peaks);
		const detected = detectPeaks(
			[
				{ time: 0, value: 0 },
				{ time: 100, value: 1 },
				{ time: 200, value: 0 },
				{ time: 900, value: 0 },
				{ time: 1000, value: 1 },
				{ time: 1100, value: 0 },
			],
			72,
		);

		expect(rmssd).not.toBeNull();
		expect(rmssd ?? 0).toBeGreaterThan(0);
		expect(detected).toHaveLength(2);
	});
});
