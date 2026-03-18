import { computeWaveformPeriodicityProfile } from "../rppgDiagnostics";

describe("computeWaveformPeriodicityProfile", () => {
	test("returns null for flat signals", () => {
		const data = new Array(180).fill(0);
		expect(computeWaveformPeriodicityProfile(data, 30)).toBeNull();
	});

	test("detects the dominant periodicity of a clean pulse-like waveform", () => {
		const fs = 30;
		const bpm = 72;
		const hz = bpm / 60;
		const samples = new Array(240).fill(0).map((_, i) => {
			const t = i / fs;
			return (
				Math.sin(2 * Math.PI * hz * t) +
				0.35 * Math.sin(2 * Math.PI * hz * 2 * t) +
				0.08 * Math.sin(2 * Math.PI * 0.2 * t)
			);
		});

		const profile = computeWaveformPeriodicityProfile(samples, fs);
		expect(profile).not.toBeNull();
		expect(profile?.dominantBpm).not.toBeNull();
		expect(
			profile?.topCandidates.some((candidate) => Math.abs(candidate.bpm - bpm) <= 2),
		).toBe(true);
		expect(Number.isFinite(profile?.confidence ?? NaN)).toBe(true);
		expect(profile?.confidence ?? 0).toBeGreaterThan(0);
		expect((profile?.topCandidates.length ?? 0) > 0).toBe(true);
	});
});
