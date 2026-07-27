import type { WaveformMorphologyV1 } from "./waveformMorphology";

export interface PhysiologyBaselineV1 {
	bpm: number;
	rmssdMs?: number | null;
	respirationBpm?: number | null;
}

export interface PhysiologyFeaturesV1 {
	schema: "elata.rppg.physiology-features/v1";
	timestampMs: number;
	reliability: number;
	reasons: string[];
	gates: {
		hasBpm: boolean;
		hasBaseline: boolean;
		hasHrv: boolean;
		hasRespiration: boolean;
		hasMorphology: boolean;
	};
	values: {
		hrDeltaBpm: number | null;
		hrDeltaNorm: number | null;
		hrSlopePerMin: number | null;
		hrvDeltaNorm: number | null;
		respirationDeltaNorm: number | null;
		morphologyReliability: number | null;
	};
}

export type PhysiologyState =
	| "indeterminate"
	| "baseline"
	| "activated"
	| "recovering"
	| "unreliable";

export interface PhysiologyInterpretationV1 {
	schema: "elata.rppg.physiology-interpretation/v1";
	timestampMs: number;
	state: PhysiologyState;
	confidence: number;
	activationScore: number | null;
	recoveryScore: number | null;
	reasons: string[];
}

export interface PhysiologyInterpreter {
	interpret(
		features: PhysiologyFeaturesV1,
		context?: { previousActivationScore?: number | null },
	): PhysiologyInterpretationV1;
}

export interface PhysiologyInterpreterConfigV1 {
	schema: "elata.rppg.physiology-interpreter-config/v1";
	id: string;
	minReliability: number;
	activationThreshold: number;
	recoveryThreshold: number;
}

export const DEFAULT_PHYSIOLOGY_INTERPRETER_CONFIG_V1 =
	Object.freeze<PhysiologyInterpreterConfigV1>({
		schema: "elata.rppg.physiology-interpreter-config/v1",
		id: "elata-physiology-interpreter-v1",
		minReliability: 0.35,
		activationThreshold: 0.55,
		recoveryThreshold: 0.28,
	});

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const finite = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value);
const round = (value: number | null, digits = 4) =>
	value != null && Number.isFinite(value)
		? Number(value.toFixed(digits))
		: null;
const normalize = (value: number, scale: number) =>
	clamp(value / scale, -1.5, 1.5);

export function normalizePhysiologyFeatures(input: {
	timestampMs: number;
	bpm?: number | null;
	bpmSlopePerMin?: number | null;
	rmssdMs?: number | null;
	respirationBpm?: number | null;
	baseline?: PhysiologyBaselineV1 | null;
	signalQuality?: number | null;
	captureConfidence?: number | null;
	morphology?: WaveformMorphologyV1 | null;
}): PhysiologyFeaturesV1 {
	const bpm = finite(input.bpm) ? input.bpm : null;
	const baselineBpm = finite(input.baseline?.bpm) ? input.baseline.bpm : null;
	const rmssd = finite(input.rmssdMs) ? input.rmssdMs : null;
	const baselineRmssd = finite(input.baseline?.rmssdMs)
		? input.baseline.rmssdMs
		: null;
	const respiration = finite(input.respirationBpm)
		? input.respirationBpm
		: null;
	const baselineRespiration = finite(input.baseline?.respirationBpm)
		? input.baseline.respirationBpm
		: null;
	const morphologyReliability = input.morphology?.usable
		? input.morphology.reliability
		: null;
	const signalQuality = clamp01(input.signalQuality ?? 0);
	const captureConfidence = clamp01(input.captureConfidence ?? 0);
	const reliability = clamp01(
		signalQuality * 0.55 +
			captureConfidence * 0.35 +
			(morphologyReliability ?? 0) * 0.1,
	);
	const hasBpm = bpm != null;
	const hasBaseline = baselineBpm != null && baselineBpm > 0;
	const hasHrv = rmssd != null && baselineRmssd != null && baselineRmssd > 0;
	const hasRespiration =
		respiration != null &&
		baselineRespiration != null &&
		baselineRespiration > 0;
	const hrDeltaBpm = hasBpm && hasBaseline ? bpm - baselineBpm : null;
	return {
		schema: "elata.rppg.physiology-features/v1",
		timestampMs: input.timestampMs,
		reliability: round(reliability) ?? 0,
		reasons: [
			!hasBpm ? "missing_bpm" : null,
			!hasBaseline ? "missing_baseline" : null,
			reliability < 0.35 ? "low_reliability" : null,
		].filter((reason): reason is string => reason != null),
		gates: {
			hasBpm,
			hasBaseline,
			hasHrv,
			hasRespiration,
			hasMorphology: morphologyReliability != null,
		},
		values: {
			hrDeltaBpm: round(hrDeltaBpm, 3),
			hrDeltaNorm: round(hrDeltaBpm != null ? normalize(hrDeltaBpm, 35) : null),
			hrSlopePerMin: round(
				finite(input.bpmSlopePerMin)
					? clamp(input.bpmSlopePerMin, -80, 80)
					: null,
				3,
			),
			hrvDeltaNorm: round(
				hasHrv
					? clamp((rmssd - baselineRmssd) / baselineRmssd, -1.5, 1.5)
					: null,
			),
			respirationDeltaNorm: round(
				hasRespiration
					? normalize(respiration - baselineRespiration, 10)
					: null,
			),
			morphologyReliability: round(morphologyReliability),
		},
	};
}

export function createPhysiologyInterpreter(
	config: PhysiologyInterpreterConfigV1 = DEFAULT_PHYSIOLOGY_INTERPRETER_CONFIG_V1,
): PhysiologyInterpreter {
	if (
		config.schema !== "elata.rppg.physiology-interpreter-config/v1" ||
		![
			config.minReliability,
			config.activationThreshold,
			config.recoveryThreshold,
		].every((value) => finite(value) && value >= 0 && value <= 1)
	) {
		throw new Error("Invalid physiology interpreter configuration");
	}
	return {
		interpret(features, context = {}) {
			const usable =
				features.gates.hasBpm &&
				features.gates.hasBaseline &&
				features.reliability >= config.minReliability;
			if (!usable) {
				return {
					schema: "elata.rppg.physiology-interpretation/v1",
					timestampMs: features.timestampMs,
					state:
						features.gates.hasBpm && features.gates.hasBaseline
							? "unreliable"
							: "indeterminate",
					confidence: round(features.reliability * 0.35) ?? 0,
					activationScore: null,
					recoveryScore: null,
					reasons: features.reasons,
				};
			}
			const hr = clamp01(((features.values.hrDeltaNorm ?? 0) + 0.08) / 1.08);
			const slope = clamp01((features.values.hrSlopePerMin ?? 0) / 35);
			const respiration = clamp01(
				(features.values.respirationDeltaNorm ?? 0) / 1.2,
			);
			const hrv = clamp01(-(features.values.hrvDeltaNorm ?? 0) / 0.8);
			const rawActivation =
				hr * 0.48 + slope * 0.22 + respiration * 0.16 + hrv * 0.14;
			const activation = clamp01(rawActivation * features.reliability);
			const previous = finite(context.previousActivationScore)
				? context.previousActivationScore
				: activation;
			const recovery = clamp01((previous - activation) * 1.4);
			const state: PhysiologyState =
				activation >= config.activationThreshold
					? "activated"
					: recovery >= config.recoveryThreshold
						? "recovering"
						: "baseline";
			return {
				schema: "elata.rppg.physiology-interpretation/v1",
				timestampMs: features.timestampMs,
				state,
				confidence:
					round(
						clamp01(
							features.reliability * 0.8 +
								(features.gates.hasHrv ? 0.1 : 0) +
								(features.gates.hasRespiration ? 0.1 : 0),
						),
					) ?? 0,
				activationScore: round(activation),
				recoveryScore: round(recovery),
				reasons: [],
			};
		},
	};
}
