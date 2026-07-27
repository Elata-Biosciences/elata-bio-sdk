import {
	BpmBayesTracker,
	DEFAULT_BPM_TRACKER_CONFIG_V1,
	parseBpmTrackerConfigV1,
} from "../bpmBayesTracker";
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

describe("BpmBayesTracker configuration", () => {
	const context = { motion: 0, snrDb: 8, quality: 0.9 };
	const measurements = [
		{ source: "acf" as const, bpm: 70, confidence: 0.8 },
		{ source: "spectral" as const, bpm: 130, confidence: 0.8 },
	];

	test("preserves default confidence behavior and records config provenance", () => {
		const tracker = new BpmBayesTracker();
		const estimate = tracker.update(measurements, 1 / 30, context);
		expect(estimate.ambiguity).toBe(0);
		expect(tracker.getSnapshot().trackerConfigId).toBe("elata-default-v1");
		expect(tracker.getConfig()).toEqual(DEFAULT_BPM_TRACKER_CONFIG_V1);
	});

	test("explicit default config is replay-identical to the compatibility path", () => {
		const control = new BpmBayesTracker();
		const configured = new BpmBayesTracker(
			40,
			180,
			1,
			DEFAULT_BPM_TRACKER_CONFIG_V1,
		);
		for (let index = 0; index < 4; index++) {
			expect(configured.update(measurements, 1 / 30, context)).toEqual(
				control.update(measurements, 1 / 30, context),
			);
		}
	});

	test("applies bounded ambiguity only when explicitly enabled", () => {
		const tracker = new BpmBayesTracker(40, 180, 1, {
			...DEFAULT_BPM_TRACKER_CONFIG_V1,
			id: "ambiguity-test-v1",
			ambiguityPenalty: {
				enabled: true,
				spreadStartBpm: 18,
				spreadRangeBpm: 90,
				maxPenalty: 0.28,
			},
		});
		const estimate = tracker.update(measurements, 1 / 30, context);
		expect(estimate.ambiguity).toBeGreaterThan(0);
		expect(estimate.ambiguity).toBeLessThanOrEqual(0.28);
		expect(tracker.getSnapshot().trackerConfigId).toBe("ambiguity-test-v1");
	});

	test("rejects malformed or unsafe configs", () => {
		expect(() => parseBpmTrackerConfigV1({})).toThrow(TypeError);
		expect(() =>
			parseBpmTrackerConfigV1({
				...DEFAULT_BPM_TRACKER_CONFIG_V1,
				ambiguityPenalty: {
					...DEFAULT_BPM_TRACKER_CONFIG_V1.ambiguityPenalty,
					maxPenalty: 2,
				},
			}),
		).toThrow(RangeError);
	});

	test("bounds provider output and neutralizes provider failures", () => {
		const bounded = new BpmBayesTracker(
			40,
			180,
			1,
			DEFAULT_BPM_TRACKER_CONFIG_V1,
			{
				id: "quality-test-v1",
				evaluate: () => ({
					sourceMultiplier: { peaks: -10, spectral: 10 },
					ambiguityPenalty: 10,
				}),
			},
		).update(measurements, 1 / 30, context);
		expect(bounded.ambiguity).toBe(0.65);
		expect(bounded.qualityProviderId).toBe("quality-test-v1");

		const failed = new BpmBayesTracker(
			40,
			180,
			1,
			DEFAULT_BPM_TRACKER_CONFIG_V1,
			{ id: "failed-v1", evaluate: () => { throw new Error("failed"); } },
		).update(measurements, 1 / 30, context);
		expect(failed.ambiguity).toBe(0);
	});
});
