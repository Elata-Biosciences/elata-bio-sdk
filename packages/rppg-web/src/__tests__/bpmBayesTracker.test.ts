import { BpmBayesTracker } from "../bpmBayesTracker";
import { computeWaveformPeriodicityProfile } from "../rppgDiagnostics";

function buildWaveformProfile(bpm: number, fs = 30) {
	const hz = bpm / 60;
	const samples = new Array(240).fill(0).map((_, i) => {
		const t = i / fs;
		return (
			Math.sin(2 * Math.PI * hz * t) +
			0.25 * Math.sin(2 * Math.PI * hz * 2 * t) +
			0.05 * Math.sin(2 * Math.PI * 0.15 * t)
		);
	});
	return computeWaveformPeriodicityProfile(samples, fs);
}

describe("BpmBayesTracker reference state", () => {
	test("reinforceReference stores persistent reference state", () => {
		const tracker = new BpmBayesTracker();
		const waveformProfile = buildWaveformProfile(72);
		tracker.reinforceReference(
			72,
			[
				{ source: "spectral", bpm: 72, confidence: 0.9 },
				{ source: "acf", bpm: 71, confidence: 0.8 },
			],
			0.9,
			123456,
			waveformProfile,
		);

		const state = tracker.getReferenceState();
		expect(state.bpm).not.toBeNull();
		expect(Math.abs((state.bpm ?? 0) - 72)).toBeLessThanOrEqual(1);
		expect(state.weight).toBeGreaterThan(0.2);
		expect(state.origin).toBe("session_pair");
		expect(state.lastUpdatedTs).toBe(123456);
		expect(state.waveformReliability).not.toBeCloseTo(0.22, 6);
	});

	test("snapshot round-trip preserves enriched reference state", () => {
		const tracker = new BpmBayesTracker();
		const waveformProfile = buildWaveformProfile(76);
		tracker.reinforceReference(
			76,
			[
				{ source: "spectral", bpm: 76, confidence: 0.95 },
				{ source: "peaks", bpm: 75, confidence: 0.7 },
			],
			0.85,
			777000,
			waveformProfile,
		);

		const snapshot = tracker.getSnapshot();
		const restored = new BpmBayesTracker();
		restored.loadSnapshot(snapshot);
		const state = restored.getReferenceState();

		expect(state.origin).toBe("session_pair");
		expect(state.lastUpdatedTs).toBe(777000);
		expect(state.weight).toBeGreaterThan(0.2);
		expect(state.waveformReliability).not.toBeCloseTo(0.22, 6);
	});

	test("persistent reference prior keeps estimate near the reinforced bpm", () => {
		const tracker = new BpmBayesTracker();
		const waveformProfile = buildWaveformProfile(72);
		tracker.reinforceReference(
			72,
			[
				{ source: "spectral", bpm: 72, confidence: 0.9 },
				{ source: "acf", bpm: 72, confidence: 0.8 },
			],
			1,
			5000,
			waveformProfile,
		);

		const estimate = tracker.update([], 1 / 30, {
			motion: 0.02,
			snrDb: 8,
			quality: 0.9,
			waveformProfile,
		});

		expect(estimate.bpm).not.toBeNull();
		expect(Math.abs((estimate.bpm ?? 0) - 72)).toBeLessThanOrEqual(4);
	});
});
