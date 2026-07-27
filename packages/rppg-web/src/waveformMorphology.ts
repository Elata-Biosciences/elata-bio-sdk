import { computeWaveformPeriodicityProfile } from "./rppgDiagnostics";

export type WaveformMorphologySource =
	| "reconstructed"
	| "filtered"
	| "contact"
	| "unknown";

export interface WaveformMorphologyBaselineV1 {
	amplitude: number | null;
	templateEnergy: number | null;
	upstrokeSlope: number | null;
	respiratoryModulation: number | null;
}

export interface WaveformMorphologyV1 {
	schema: "elata.rppg.waveform-morphology/v1";
	source: { kind: WaveformMorphologySource; modelId: string | null };
	usable: boolean;
	reliability: number;
	reasons: string[];
	gates: {
		hasSignal: boolean;
		hasBpm: boolean;
		stableCycle: boolean;
		enoughCycleCoverage: boolean;
	};
	periodicity: {
		dominantBpm: number | null;
		targetErrorBpm: number | null;
		confidence: number;
		entropy: number;
	};
	cycle: {
		correlation: number | null;
		normalizedRmse: number | null;
		peakPhase: number | null;
		troughPhase: number | null;
		pulseWidthPhase: number | null;
		amplitude: number | null;
		upstrokeSlope: number | null;
		downstrokeSlope: number | null;
		templateEnergy: number | null;
		asymmetry: number | null;
		populatedBinFraction: number | null;
	};
	experimentalProxies: {
		perfusionChangeNorm: number | null;
		energyChangeNorm: number | null;
		upstrokeChangeNorm: number | null;
		respiratoryModulation: number | null;
		vascularTone: number | null;
	} | null;
}

type Cycle = {
	template: number[];
	predicted: number[];
	populatedBinFraction: number;
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const round = (value: number | null, digits = 4) =>
	value != null && Number.isFinite(value)
		? Number(value.toFixed(digits))
		: null;
const mean = (values: readonly number[]) =>
	values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

function buildCycle(
	values: number[],
	sampleRate: number,
	bpm: number,
	bins: number,
): Cycle | null {
	if (values.length < 16 || sampleRate <= 0 || bpm <= 0 || bins < 8)
		return null;
	const average = mean(values);
	const sums = Array.from({ length: bins }, () => 0);
	const counts = Array.from({ length: bins }, () => 0);
	const frequency = bpm / 60;
	for (let index = 0; index < values.length; index++) {
		const bin = Math.min(
			bins - 1,
			Math.floor((((index / sampleRate) * frequency) % 1) * bins),
		);
		sums[bin] += values[index] - average;
		counts[bin]++;
	}
	const template = sums.map((sum, index) =>
		counts[index] ? sum / counts[index] : 0,
	);
	return {
		template,
		predicted: values.map((_, index) => {
			const bin = Math.min(
				bins - 1,
				Math.floor((((index / sampleRate) * frequency) % 1) * bins),
			);
			return average + template[bin];
		}),
		populatedBinFraction: counts.filter((count) => count > 0).length / bins,
	};
}

function fit(values: number[], predicted: number[]) {
	const average = mean(values);
	const predictedAverage = mean(predicted);
	let covariance = 0;
	let actualEnergy = 0;
	let predictedEnergy = 0;
	let errorEnergy = 0;
	for (let index = 0; index < values.length; index++) {
		const actual = values[index] - average;
		const estimate = predicted[index] - predictedAverage;
		covariance += actual * estimate;
		actualEnergy += actual * actual;
		predictedEnergy += estimate * estimate;
		errorEnergy += (values[index] - predicted[index]) ** 2;
	}
	return {
		correlation:
			covariance / Math.sqrt(Math.max(actualEnergy * predictedEnergy, 1e-9)),
		normalizedRmse:
			Math.sqrt(errorEnergy / values.length) /
			Math.sqrt(Math.max(actualEnergy / values.length, 1e-9)),
	};
}

function modulation(values: number[], sampleRate: number, bpm: number) {
	const samplesPerCycle = (sampleRate * 60) / bpm;
	if (samplesPerCycle < 6) return null;
	const amplitudes: number[] = [];
	for (
		let start = 0;
		start + samplesPerCycle <= values.length;
		start += samplesPerCycle
	) {
		const cycle = values.slice(
			Math.floor(start),
			Math.floor(start + samplesPerCycle),
		);
		if (cycle.length >= 6)
			amplitudes.push(Math.max(...cycle) - Math.min(...cycle));
	}
	if (amplitudes.length < 4) return null;
	const average = mean(amplitudes);
	const variance = mean(amplitudes.map((value) => (value - average) ** 2));
	return Math.abs(average) > 1e-9
		? clamp01(Math.sqrt(variance) / Math.abs(average))
		: null;
}

function relative(current: number, baseline: number | null | undefined) {
	return baseline != null &&
		Number.isFinite(baseline) &&
		Math.abs(baseline) > 1e-9
		? clamp((current - baseline) / Math.abs(baseline), -2, 2)
		: null;
}

export function extractWaveformMorphology(options: {
	values: readonly number[] | Float32Array;
	sampleRate: number;
	bpm?: number | null;
	baseline?: WaveformMorphologyBaselineV1 | null;
	source?: WaveformMorphologySource;
	modelId?: string | null;
	bins?: number;
}): WaveformMorphologyV1 {
	const values = Array.from(options.values).filter(Number.isFinite);
	const hasSignal = values.length >= 90;
	const hasBpm =
		options.bpm != null && Number.isFinite(options.bpm) && options.bpm > 0;
	const empty = (
		reasons: string[],
		periodicity: {
			dominantBpm: number | null;
			confidence: number;
			entropy: number;
		} = { dominantBpm: null, confidence: 0, entropy: 1 },
	): WaveformMorphologyV1 => ({
		schema: "elata.rppg.waveform-morphology/v1",
		source: {
			kind: options.source ?? "unknown",
			modelId: options.modelId ?? null,
		},
		usable: false,
		reliability: 0,
		reasons,
		gates: {
			hasSignal,
			hasBpm,
			stableCycle: false,
			enoughCycleCoverage: false,
		},
		periodicity: {
			...periodicity,
			targetErrorBpm: null,
		},
		cycle: {
			correlation: null,
			normalizedRmse: null,
			peakPhase: null,
			troughPhase: null,
			pulseWidthPhase: null,
			amplitude: null,
			upstrokeSlope: null,
			downstrokeSlope: null,
			templateEnergy: null,
			asymmetry: null,
			populatedBinFraction: null,
		},
		experimentalProxies: null,
	});
	if (
		!hasSignal ||
		!Number.isFinite(options.sampleRate) ||
		options.sampleRate <= 0
	) {
		return empty(["insufficient_signal"]);
	}

	const profile = computeWaveformPeriodicityProfile(values, options.sampleRate);
	const fitBpm = hasBpm ? (options.bpm as number) : profile?.dominantBpm;
	if (!fitBpm) {
		return empty(["missing_bpm"], {
			dominantBpm: profile?.dominantBpm ?? null,
			confidence: profile?.confidence ?? 0,
			entropy: profile?.entropy ?? 1,
		});
	}
	const cycle = buildCycle(
		values,
		options.sampleRate,
		fitBpm,
		options.bins ?? 48,
	);
	if (!cycle) return empty(["missing_cycle_template"]);

	const metrics = fit(values, cycle.predicted);
	let peakIndex = 0;
	let troughIndex = 0;
	for (let index = 1; index < cycle.template.length; index++) {
		if (cycle.template[index] > cycle.template[peakIndex]) peakIndex = index;
		if (cycle.template[index] < cycle.template[troughIndex])
			troughIndex = index;
	}
	const bins = cycle.template.length;
	const amplitude = cycle.template[peakIndex] - cycle.template[troughIndex];
	const forward = (from: number, to: number) =>
		(to >= from ? to - from : to + bins - from) / bins;
	const upstrokeSlope =
		amplitude / Math.max(forward(troughIndex, peakIndex), 1 / bins);
	const downstrokeSlope =
		amplitude / Math.max(forward(peakIndex, troughIndex), 1 / bins);
	const templateEnergy = Math.sqrt(
		mean(cycle.template.map((value) => value ** 2)),
	);
	const targetError =
		hasBpm && profile?.dominantBpm != null
			? Math.abs(profile.dominantBpm - fitBpm)
			: null;
	const periodicityPass =
		targetError != null
			? targetError <= Math.max(10, fitBpm * 0.18)
			: (profile?.confidence ?? 0) >= 0.08 && (profile?.entropy ?? 1) <= 0.92;
	const stableCycle =
		periodicityPass &&
		(metrics.correlation >= 0.28 || metrics.normalizedRmse <= 1.4);
	const enoughCycleCoverage = cycle.populatedBinFraction >= 0.45;
	const stability = clamp01(
		clamp01(metrics.correlation) * 0.5 +
			clamp01(1 - Math.min(metrics.normalizedRmse, 2) / 2) * 0.2 +
			cycle.populatedBinFraction * 0.2 +
			clamp01(1 - (profile?.entropy ?? 1)) * 0.1,
	);
	const reliability = clamp01(
		stability * 0.5 +
			clamp01(profile?.confidence ?? 0) * 0.18 +
			clamp01(amplitude / 0.25) * 0.17 +
			clamp01(templateEnergy / 0.08) * 0.15,
	);
	const usable =
		hasBpm && stableCycle && enoughCycleCoverage && reliability >= 0.3;
	const respiratoryModulation = modulation(values, options.sampleRate, fitBpm);
	const perfusionChange = relative(amplitude, options.baseline?.amplitude);
	const upstrokeChange = relative(
		upstrokeSlope,
		options.baseline?.upstrokeSlope,
	);
	return {
		schema: "elata.rppg.waveform-morphology/v1",
		source: {
			kind: options.source ?? "unknown",
			modelId: options.modelId ?? null,
		},
		usable,
		reliability: round(reliability) ?? 0,
		reasons: [
			!hasBpm ? "missing_bpm" : null,
			!periodicityPass ? "weak_periodicity_profile" : null,
			periodicityPass && !stableCycle ? "unstable_cycle_template" : null,
			!enoughCycleCoverage ? "low_cycle_bin_coverage" : null,
			reliability < 0.3 ? "low_reliability" : null,
		].filter((reason): reason is string => reason != null),
		gates: { hasSignal, hasBpm, stableCycle, enoughCycleCoverage },
		periodicity: {
			dominantBpm: round(profile?.dominantBpm ?? null, 3),
			targetErrorBpm: round(targetError, 3),
			confidence: round(profile?.confidence ?? 0) ?? 0,
			entropy: round(profile?.entropy ?? 1) ?? 1,
		},
		cycle: {
			correlation: round(metrics.correlation),
			normalizedRmse: round(metrics.normalizedRmse),
			peakPhase: round(peakIndex / bins),
			troughPhase: round(troughIndex / bins),
			pulseWidthPhase: round(forward(troughIndex, peakIndex)),
			amplitude: round(amplitude),
			upstrokeSlope: round(upstrokeSlope),
			downstrokeSlope: round(downstrokeSlope),
			templateEnergy: round(templateEnergy),
			asymmetry: round(upstrokeSlope / Math.max(downstrokeSlope, 1e-9)),
			populatedBinFraction: round(cycle.populatedBinFraction),
		},
		experimentalProxies: usable
			? {
					perfusionChangeNorm: round(perfusionChange),
					energyChangeNorm: round(
						relative(templateEnergy, options.baseline?.templateEnergy),
					),
					upstrokeChangeNorm: round(upstrokeChange),
					respiratoryModulation: round(respiratoryModulation),
					vascularTone:
						perfusionChange == null && upstrokeChange == null
							? null
							: round(
									clamp(
										-(perfusionChange ?? 0) * 0.55 +
											(upstrokeChange ?? 0) * 0.35,
										-1,
										1,
									),
								),
				}
			: null,
	};
}

export function createWaveformMorphologyBaseline(
	features: readonly WaveformMorphologyV1[],
): WaveformMorphologyBaselineV1 | null {
	const usable = features.filter((feature) => feature.usable);
	if (!usable.length) return null;
	const average = (
		select: (feature: WaveformMorphologyV1) => number | null,
	) => {
		const values = usable
			.map(select)
			.filter((value): value is number => value != null);
		return values.length ? mean(values) : null;
	};
	return {
		amplitude: average((feature) => feature.cycle.amplitude),
		templateEnergy: average((feature) => feature.cycle.templateEnergy),
		upstrokeSlope: average((feature) => feature.cycle.upstrokeSlope),
		respiratoryModulation: average(
			(feature) => feature.experimentalProxies?.respiratoryModulation ?? null,
		),
	};
}
