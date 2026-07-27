import {
	createWaveformMorphologyBaseline,
	extractWaveformMorphology,
} from "../waveformMorphology";

function pulseWave(options: {
	amplitude?: number;
	modulation?: number;
	noise?: number;
} = {}) {
	const sampleRate = 30;
	const bpm = 72;
	return Array.from({ length: sampleRate * 14 }, (_, index) => {
		const time = index / sampleRate;
		const phase = (time * (bpm / 60)) % 1;
		const envelope =
			1 + (options.modulation ?? 0) * Math.sin(2 * Math.PI * 0.22 * time);
		const systolic = Math.exp(-((phase - 0.16) ** 2) / 0.0025);
		const shoulder = 0.28 * Math.exp(-((phase - 0.36) ** 2) / 0.011);
		return (
			(options.amplitude ?? 1) * envelope * (systolic + shoulder - 0.18) +
			(options.noise ?? 0) * Math.sin(index * 2.73)
		);
	});
}

test("extracts source-labelled, gated cycle morphology", () => {
	const result = extractWaveformMorphology({
		values: pulseWave(),
		sampleRate: 30,
		bpm: 72,
		source: "reconstructed",
		modelId: "fixture-model",
	});

	expect(result.schema).toBe("elata.rppg.waveform-morphology/v1");
	expect(result.source).toEqual({
		kind: "reconstructed",
		modelId: "fixture-model",
	});
	expect(result.usable).toBe(true);
	expect(result.reliability).toBeGreaterThan(0.55);
	expect(result.cycle.peakPhase).toBeGreaterThan(0.1);
	expect(result.cycle.peakPhase).toBeLessThan(0.24);
	expect(result.experimentalProxies).not.toBeNull();
});

test("keeps baseline-relative proxies explicitly experimental", () => {
	const baselineFeature = extractWaveformMorphology({
		values: pulseWave({ amplitude: 0.8 }),
		sampleRate: 30,
		bpm: 72,
	});
	const baseline = createWaveformMorphologyBaseline([baselineFeature]);
	const increased = extractWaveformMorphology({
		values: Float32Array.from(pulseWave({ amplitude: 1.2 })),
		sampleRate: 30,
		bpm: 72,
		baseline,
	});

	expect(increased.experimentalProxies?.perfusionChangeNorm).toBeGreaterThan(
		0.35,
	);
	expect(increased.experimentalProxies?.energyChangeNorm).toBeGreaterThan(0.35);
	expect(increased.experimentalProxies?.vascularTone).toBeLessThan(0);
});

test("gates noise and emits no physiological proxies", () => {
	let seed = 12345;
	const noise = Array.from({ length: 300 }, () => {
		seed = (seed * 1664525 + 1013904223) % 4294967296;
		return seed / 4294967296 - 0.5;
	});
	const result = extractWaveformMorphology({
		values: noise,
		sampleRate: 30,
		bpm: 72,
		source: "filtered",
	});

	expect(result.usable).toBe(false);
	expect(result.reasons.length).toBeGreaterThan(0);
	expect(result.experimentalProxies).toBeNull();
});

test("reports insufficient input without throwing", () => {
	const result = extractWaveformMorphology({
		values: [1, 2, Number.NaN],
		sampleRate: 30,
		bpm: 72,
	});
	expect(result.reasons).toEqual(["insufficient_signal"]);
	expect(result.cycle.amplitude).toBeNull();
});
