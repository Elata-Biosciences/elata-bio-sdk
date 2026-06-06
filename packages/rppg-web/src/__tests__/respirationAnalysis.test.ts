import {
	amplitudeEnvelope,
	dominantInBand,
	estimateRespiration,
	resampleTachogram,
} from "../respirationAnalysis";

const FS = 30;
const DUR = 30; // seconds — comfortably resolves the respiration band
const N = FS * DUR;

/** Cardiac carrier at `fcHz`, optionally amplitude-modulated at the breath rate. */
function pulse(fcHz: number, amp: number, amCoeff: number, frHz: number): number[] {
	return Array.from({ length: N }, (_, i) => {
		const t = i / FS;
		const am = 1 + amCoeff * Math.sin(2 * Math.PI * frHz * t);
		return amp * am * Math.sin(2 * Math.PI * fcHz * t);
	});
}

/** A respiratory-sinus-arrhythmia tachogram: beats whose IBI oscillates at `frHz`. */
function rsaBeats(frHz: number, meanIbiMs = 800, swingMs = 45) {
	const beatTimesMs: number[] = [0];
	const ibisMs: number[] = [];
	let t = 0;
	while (t < DUR * 1000) {
		const ibi = meanIbiMs + swingMs * Math.sin((2 * Math.PI * frHz * t) / 1000);
		ibisMs.push(ibi);
		t += ibi;
		beatTimesMs.push(t);
	}
	beatTimesMs.pop(); // keep beatTimesMs aligned: one more beat than interval
	return { beatTimesMs, ibisMs };
}

describe("dominantInBand", () => {
	test("recovers a clean in-band tone with high confidence", () => {
		const fr = 0.25; // 15 brpm
		const sig = Array.from({ length: N }, (_, i) =>
			Math.sin(2 * Math.PI * fr * (i / FS)),
		);
		const res = dominantInBand(sig, FS);
		expect(res).not.toBeNull();
		expect(res?.brpm).toBeGreaterThan(13);
		expect(res?.brpm).toBeLessThan(17);
		expect(res?.confidence).toBeGreaterThan(0.5);
	});

	test("returns null for a flat (zero-variance) signal", () => {
		expect(dominantInBand(new Array(N).fill(0.5), FS)).toBeNull();
	});
});

describe("amplitudeEnvelope", () => {
	test("envelope of an amplitude-modulated pulse oscillates at the breath rate", () => {
		const fr = 0.2; // 12 brpm
		const env = amplitudeEnvelope(pulse(1.2, 0.3, 0.5, fr), FS);
		const res = dominantInBand(env, FS);
		expect(res?.brpm).toBeGreaterThan(10);
		expect(res?.brpm).toBeLessThan(14);
	});
});

describe("resampleTachogram", () => {
	test("returns null when there are too few beats", () => {
		expect(resampleTachogram([800, 810, 790], [0, 800, 1610, 2400])).toBeNull();
	});

	test("produces a uniform grid that carries the RSA rate", () => {
		const fr = 0.25;
		const { beatTimesMs, ibisMs } = rsaBeats(fr);
		const grid = resampleTachogram(ibisMs, beatTimesMs);
		expect(grid).not.toBeNull();
		const res = dominantInBand(grid as number[], 4);
		expect(res?.brpm).toBeGreaterThan(13);
		expect(res?.brpm).toBeLessThan(17);
	});
});

describe("estimateRespiration", () => {
	test("recovers the breath rate from the RIIV baseline cue alone", () => {
		const fr = 0.25; // 15 brpm
		const sig = Array.from({ length: N }, (_, i) => {
			const t = i / FS;
			return 0.3 * Math.sin(2 * Math.PI * 1.2 * t) + 0.08 * Math.sin(2 * Math.PI * fr * t);
		});
		const res = estimateRespiration({ signal: sig, sampleRate: FS });
		expect(res).not.toBeNull();
		expect(res?.brpm).toBeGreaterThan(13);
		expect(res?.brpm).toBeLessThan(17);
		expect(res?.sources).toContain("riiv");
	});

	test("recovers the breath rate from the RIAV amplitude cue alone", () => {
		const fr = 0.2; // 12 brpm, pure AM, no additive baseline
		const res = estimateRespiration({ signal: pulse(1.2, 0.3, 0.5, fr), sampleRate: FS });
		expect(res).not.toBeNull();
		expect(res?.brpm).toBeGreaterThan(10);
		expect(res?.brpm).toBeLessThan(14);
		expect(res?.sources).toContain("riav");
	});

	test("fusion ignores a motion-corrupted baseline when two cues agree", () => {
		const fr = 0.2; // true breath rate = 12 brpm
		// Good RIAV at 12 brpm, plus a WRONG additive baseline at 30 brpm to fool RIIV.
		const sig = Array.from({ length: N }, (_, i) => {
			const t = i / FS;
			const am = 1 + 0.5 * Math.sin(2 * Math.PI * fr * t);
			const corruptBaseline = 0.15 * Math.sin(2 * Math.PI * 0.5 * t); // 30 brpm artifact
			return 0.3 * am * Math.sin(2 * Math.PI * 1.2 * t) + corruptBaseline;
		});
		// RSA tachogram also at the true 12 brpm → agrees with RIAV.
		const { beatTimesMs, ibisMs } = rsaBeats(fr);
		const res = estimateRespiration({ signal: sig, sampleRate: FS, ibisMs, beatTimesMs });
		expect(res).not.toBeNull();
		expect(res?.agreement).toBe(true);
		expect(res?.brpm).toBeGreaterThan(10);
		expect(res?.brpm).toBeLessThan(14);
		expect(res?.sources.length).toBeGreaterThanOrEqual(2);
	});

	test("abstains (null) when there is no respiratory signal", () => {
		expect(estimateRespiration({ signal: new Array(N).fill(0.5), sampleRate: FS })).toBeNull();
	});
});
