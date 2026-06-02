import {
	analyzePulseWindow,
	calculateBpmViaAutocorrelation,
	cleanNnIntervalsMs,
	detectPeaks,
	refinePeakByInterpolation,
	rmssdFromPeaks,
	type PulsePeak,
	type PulseWindowSample,
} from "../pulseAnalysis";

// Build a smooth pulse train (sum of Gaussian beats) sampled on a fixed grid.
function makePulseSamples(
	beatTimesMs: number[],
	fs: number,
	sigmaMs = 70,
): PulsePeak[] {
	const dt = 1000 / fs;
	const end = beatTimesMs[beatTimesMs.length - 1] + 400;
	const points: PulsePeak[] = [];
	for (let t = 0; t <= end; t += dt) {
		let value = 0;
		for (const beat of beatTimesMs) {
			const d = t - beat;
			value += Math.exp(-(d * d) / (2 * sigmaMs * sigmaMs));
		}
		points.push({ time: t, value });
	}
	return points;
}

// Turn a list of inter-beat intervals into peaks at the cumulative times.
function cumulativePeaks(intervalsMs: number[]): PulsePeak[] {
	const peaks: PulsePeak[] = [{ time: 0, value: 1 }];
	let t = 0;
	for (const iv of intervalsMs) {
		t += iv;
		peaks.push({ time: t, value: 1 });
	}
	return peaks;
}

// Reference RMSSD over a list of intervals (no artifact rejection).
function rmssd(intervalsMs: number[]): number {
	const diffs: number[] = [];
	for (let i = 0; i < intervalsMs.length - 1; i++) {
		diffs.push(intervalsMs[i + 1] - intervalsMs[i]);
	}
	const meanSq = diffs.reduce((a, b) => a + b * b, 0) / diffs.length;
	return Math.sqrt(meanSq);
}

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

	test("analyzePulseWindow reports a low RMSSD for a clean periodic pulse (Hilbert-phase HRV)", () => {
		const sampleRate = 30;
		const total = sampleRate * 15;
		// Perfectly periodic 72 bpm pulse -> near-zero beat-to-beat variability.
		const values = Array.from({ length: total }, (_, i) =>
			Math.sin(2 * Math.PI * 1.2 * (i / sampleRate)),
		);
		const analysis = analyzePulseWindow(buildSamples(values, sampleRate));
		expect(analysis?.hrvRmssd).not.toBeNull();
		expect(analysis?.hrvRmssd ?? Number.POSITIVE_INFINITY).toBeLessThan(60);
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

	describe("HRV interpolation", () => {
		test("refinePeakByInterpolation keeps a symmetric peak at the centre sample", () => {
			const refined = refinePeakByInterpolation(
				{ time: 0, value: 0 },
				{ time: 10, value: 1 },
				{ time: 20, value: 0 },
			);
			expect(refined.time).toBeCloseTo(10, 6);
			expect(refined.value).toBeCloseTo(1, 6);
		});

		test("refinePeakByInterpolation shifts toward the taller neighbour", () => {
			const refined = refinePeakByInterpolation(
				{ time: 0, value: 0 },
				{ time: 10, value: 1 },
				{ time: 20, value: 0.5 },
			);
			// Analytic parabola vertex for these points sits at 35/3 ≈ 11.667 ms.
			expect(refined.time).toBeCloseTo(35 / 3, 4);
			expect(refined.time).toBeGreaterThan(10);
			expect(refined.time).toBeLessThan(20);
			expect(refined.value).toBeGreaterThan(1);
		});

		test("refinePeakByInterpolation falls back to the centre when collinear", () => {
			const refined = refinePeakByInterpolation(
				{ time: 0, value: 1 },
				{ time: 10, value: 1 },
				{ time: 20, value: 1 },
			);
			expect(refined).toEqual({ time: 10, value: 1 });
		});

		test("detectPeaks recovers sub-sample peak times", () => {
			const fs = 30; // 33.3 ms grid
			// Beats deliberately land between samples; detection must not snap
			// the peak onto the 33.3 ms grid.
			const beats = [410, 1015, 1590];
			const samples = makePulseSamples(beats, fs);
			const detected = detectPeaks(samples, 60);

			expect(detected.length).toBe(beats.length);
			const dt = 1000 / fs;
			for (let i = 0; i < beats.length; i++) {
				expect(Math.abs(detected[i].time - beats[i])).toBeLessThan(3);
				// Not aligned to the raw sample grid (that is the whole point).
				const gridError = Math.abs(
					detected[i].time - Math.round(detected[i].time / dt) * dt,
				);
				expect(gridError).toBeGreaterThan(1e-6);
			}
		});

		test("interpolated RMSSD is closer to truth than grid-quantized RMSSD", () => {
			const fs = 30; // coarse, camera-like rate where quantization hurts
			const dt = 1000 / fs;
			const intervals = [800, 770, 815, 780, 825, 790, 805, 775, 820];
			const beats: number[] = [400];
			for (const iv of intervals) beats.push(beats[beats.length - 1] + iv);

			const trueRmssd = rmssd(intervals);
			const samples = makePulseSamples(beats, fs);
			const detected = detectPeaks(samples, 75);
			expect(detected.length).toBe(beats.length);

			const interpRmssd = rmssdFromPeaks(detected);
			// Emulate the pre-interpolation behaviour by snapping peaks to the grid.
			const gridRmssd = rmssdFromPeaks(
				detected.map((peak) => ({
					...peak,
					time: Math.round(peak.time / dt) * dt,
				})),
			);

			expect(interpRmssd).not.toBeNull();
			expect(gridRmssd).not.toBeNull();
			const interpErr = Math.abs((interpRmssd ?? 0) - trueRmssd);
			const gridErr = Math.abs((gridRmssd ?? 0) - trueRmssd);
			expect(interpErr).toBeLessThan(gridErr);
			expect(interpErr).toBeLessThan(8); // within 8 ms of the true RMSSD
		});

		test("cleanNnIntervalsMs drops out-of-range and ectopic intervals", () => {
			// 200 ms (too fast) and a sudden 1500 ms gap (missed beat) are artifacts.
			const peaks: PulsePeak[] = cumulativePeaks([
				800, 200, 810, 1500, 790, 805,
			]);
			const cleaned = cleanNnIntervalsMs(peaks);
			expect(cleaned).not.toContain(200);
			expect(cleaned).not.toContain(1500);
			for (const ms of cleaned) {
				expect(ms).toBeGreaterThanOrEqual(700);
				expect(ms).toBeLessThanOrEqual(900);
			}
		});

		test("rmssdFromPeaks ignores an ectopic beat", () => {
			const clean = cumulativePeaks([800, 800, 800, 800, 800, 800]);
			const ectopic = cumulativePeaks([800, 800, 400, 1200, 800, 800]);
			// A perfectly regular train has zero RMSSD; the ectopic pair would
			// inflate it massively if not rejected.
			expect(rmssdFromPeaks(clean)).toBeCloseTo(0, 6);
			const value = rmssdFromPeaks(ectopic) ?? Number.POSITIVE_INFINITY;
			expect(value).toBeLessThan(50);
		});
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
