/**
 * REGISTRY_V1 — the seed metric registry (guide Appendix C coverage).
 * Pure data: no imports beyond types. `sdk-persisted` metrics aggregate
 * values persisted from the SDK derived streams (rppg-web 0.14 Metrics /
 * ppg-web 0.12 PpgMetrics) and are never recomputed locally.
 */

import type {
	AlgorithmId,
	EvidenceTier,
	MetricDefinitionV1,
	WindowPolicy,
} from "./types.js";

const SECOND_US = 1_000_000;

const EEG_WINDOW: WindowPolicy = {
	minWindowUs: 10 * SECOND_US,
	preferredWindowUs: 30 * SECOND_US,
	stepUs: 5 * SECOND_US,
	alignment: "sliding",
};

const SESSION_WINDOW: WindowPolicy = {
	minWindowUs: 60 * SECOND_US,
	alignment: "session",
};

const EEG_STREAM_INPUT = {
	kind: "stream",
	modality: "eeg",
	minSampleRateHz: 128,
	minChannels: 1,
} as const;

const EEG_USABLE_GATE = { metricId: "eeg.channel_quality", min: 0.5 } as const;

type Overrides = Partial<Omit<MetricDefinitionV1, "schema" | "id">>;

function define(
	id: string,
	base: Omit<MetricDefinitionV1, "schema" | "id">,
): MetricDefinitionV1 {
	return { schema: "elata.metric-definition/v1", id, ...base };
}

function eegWasmMetric(
	id: string,
	displayName: string,
	description: string,
	unit: string | null,
	algorithm: AlgorithmId,
	tier: EvidenceTier,
	overrides: Overrides = {},
): MetricDefinitionV1 {
	return define(id, {
		version: "1.0.0",
		displayName,
		description,
		unit,
		domain: "eeg",
		measurementClass: "derived-deterministic",
		evidenceTier: tier,
		inputs: [EEG_STREAM_INPUT],
		window: EEG_WINDOW,
		channelPolicy: "per-channel",
		qualityGates: [EEG_USABLE_GATE],
		algorithm,
		aggregation: { session: "quality-weighted-mean", daily: "median" },
		baseline: {
			eligible: true,
			minSessions: 5,
			contextBucketing: "time-of-day",
		},
		displayEligibility: tier === "beta-default" ? "product" : "advanced-panel",
		computeProfile: "post-session",
		costClass: "light",
		implementedIn: "wasm",
		...overrides,
	});
}

function sdkPersistedMetric(
	id: string,
	displayName: string,
	description: string,
	unit: string | null,
	algorithm: AlgorithmId,
	tier: EvidenceTier,
	modality: "rppg" | "ppg",
	overrides: Overrides = {},
): MetricDefinitionV1 {
	return define(id, {
		version: "1.0.0",
		displayName,
		description,
		unit,
		domain: modality === "rppg" ? "rppg" : "pulse",
		measurementClass: "measured",
		evidenceTier: tier,
		inputs: [{ kind: "stream", modality }],
		window: SESSION_WINDOW,
		channelPolicy: "single",
		qualityGates: [],
		algorithm,
		aggregation: { session: "quality-weighted-mean", daily: "median" },
		baseline: {
			eligible: true,
			minSessions: 5,
			contextBucketing: "time-of-day",
		},
		displayEligibility: tier === "beta-default" ? "product" : "advanced-panel",
		computeProfile: "post-session",
		costClass: "trivial",
		implementedIn: "sdk-persisted",
		...overrides,
	});
}

function registeredOnly(
	id: string,
	displayName: string,
	description: string,
	unit: string | null,
	domain: MetricDefinitionV1["domain"],
	algorithm: AlgorithmId,
	overrides: Overrides = {},
): MetricDefinitionV1 {
	return define(id, {
		version: "0.1.0",
		displayName,
		description,
		unit,
		domain,
		measurementClass: "derived-deterministic",
		evidenceTier: "experimental",
		inputs: [],
		window: SESSION_WINDOW,
		channelPolicy: "single",
		qualityGates: [],
		algorithm,
		aggregation: { session: "none", daily: "none" },
		baseline: { eligible: false },
		displayEligibility: "none",
		computeProfile: "on-demand",
		costClass: "light",
		implementedIn: "registered-only",
		...overrides,
	});
}

const BANDS = ["delta", "theta", "alpha", "beta", "gamma"] as const;

const bandPowerMetrics: MetricDefinitionV1[] = BANDS.flatMap((band) => [
	eegWasmMetric(
		`eeg.band_power.${band}.absolute`,
		`${band[0].toUpperCase()}${band.slice(1)} power (absolute)`,
		`Absolute ${band}-band power integrated from the per-window Welch PSD.`,
		"uV^2",
		"eeg_band_power@2",
		"beta-default",
	),
	eegWasmMetric(
		`eeg.band_power.${band}.relative`,
		`${band[0].toUpperCase()}${band.slice(1)} power (relative)`,
		`${band[0].toUpperCase()}${band.slice(1)}-band fraction of total 5-band power per window.`,
		"ratio",
		"eeg_band_power@2",
		"beta-default",
	),
]);

const rppgAdvancedIds = [
	["rppg.spectral_bpm", "Spectral BPM"],
	["rppg.acf_bpm", "Autocorrelation BPM"],
	["rppg.peak_bpm", "Peak-tracking BPM"],
	["rppg.bayesian_bpm", "Bayesian BPM"],
	["rppg.fused_bpm", "Fused BPM"],
	["rppg.snr", "rPPG SNR"],
	["rppg.estimator_agreement", "Estimator agreement"],
] as const;

export const REGISTRY_V1: readonly MetricDefinitionV1[] = [
	// --- session/stream integrity (recorder-persisted rows) ---
	define("session.valid_duration", {
		version: "1.0.0",
		displayName: "Valid duration",
		description: "Total duration of the session covered by valid samples.",
		unit: "s",
		domain: "session",
		measurementClass: "measured",
		evidenceTier: "beta-default",
		inputs: [{ kind: "events" }],
		window: SESSION_WINDOW,
		channelPolicy: "single",
		qualityGates: [],
		algorithm: "session_coverage@1",
		aggregation: { session: "last", daily: "mean" },
		baseline: { eligible: false },
		displayEligibility: "product",
		computeProfile: "post-session",
		costClass: "trivial",
		implementedIn: "session-recorder",
	}),
	define("session.coverage", {
		version: "1.0.0",
		displayName: "Coverage",
		description: "Fraction of the session wall time covered by valid samples.",
		unit: "ratio",
		domain: "session",
		measurementClass: "measured",
		evidenceTier: "beta-default",
		inputs: [{ kind: "events" }],
		window: SESSION_WINDOW,
		channelPolicy: "single",
		qualityGates: [],
		algorithm: "session_coverage@1",
		aggregation: { session: "last", daily: "mean" },
		baseline: { eligible: false },
		displayEligibility: "product",
		computeProfile: "post-session",
		costClass: "trivial",
		implementedIn: "session-recorder",
	}),
	define("stream.dropped_samples", {
		version: "1.0.0",
		displayName: "Dropped samples",
		description: "Samples lost to gaps/dropouts per stream.",
		unit: "count",
		domain: "stream",
		measurementClass: "measured",
		evidenceTier: "beta-default",
		inputs: [{ kind: "events" }],
		window: SESSION_WINDOW,
		channelPolicy: "single",
		qualityGates: [],
		algorithm: "stream_gap_scan@1",
		aggregation: { session: "sum", daily: "mean" },
		baseline: { eligible: false },
		displayEligibility: "advanced-panel",
		computeProfile: "post-session",
		costClass: "trivial",
		implementedIn: "session-recorder",
	}),
	define("stream.discontinuities", {
		version: "1.0.0",
		displayName: "Discontinuities",
		description: "Recorded gap/overlap/clock-jump/dropout events per stream.",
		unit: "count",
		domain: "stream",
		measurementClass: "measured",
		evidenceTier: "beta-default",
		inputs: [{ kind: "events" }],
		window: SESSION_WINDOW,
		channelPolicy: "single",
		qualityGates: [],
		algorithm: "stream_gap_scan@1",
		aggregation: { session: "sum", daily: "mean" },
		baseline: { eligible: false },
		displayEligibility: "advanced-panel",
		computeProfile: "post-session",
		costClass: "trivial",
		implementedIn: "session-recorder",
	}),

	// --- EEG quality (wasm) ---
	eegWasmMetric(
		"eeg.channel_quality",
		"EEG channel quality",
		"Per-channel usable fraction of windows (quality flags: flatline/clip/extreme/line noise).",
		"ratio",
		"eeg_quality_flags@1",
		"beta-default",
		{ qualityGates: [], measurementClass: "measured" },
	),
	eegWasmMetric(
		"eeg.artifact_coverage",
		"EEG artifact coverage",
		"Fraction of window samples affected by artifacts (max of flatline/clipped/extreme).",
		"ratio",
		"eeg_quality_flags@1",
		"beta-default",
		{ qualityGates: [], measurementClass: "measured" },
	),

	// --- rPPG capture quality (sdk-persisted, rppg-web 0.14 Metrics) ---
	sdkPersistedMetric(
		"rppg.signal_quality",
		"rPPG signal quality",
		"Persisted rppg-web signal-quality estimate.",
		"ratio",
		"sdk_rppg_metrics@0.14",
		"beta-default",
		"rppg",
	),
	sdkPersistedMetric(
		"rppg.capture_confidence",
		"Capture confidence",
		"Persisted rppg-web capture_confidence.",
		"ratio",
		"sdk_rppg_metrics@0.14",
		"beta-default",
		"rppg",
	),
	sdkPersistedMetric(
		"rppg.motion_burden",
		"Motion burden",
		"Persisted rppg-web capture_motion.",
		"ratio",
		"sdk_rppg_metrics@0.14",
		"beta-default",
		"rppg",
	),
	sdkPersistedMetric(
		"rppg.lighting_quality",
		"Lighting quality",
		"Persisted rppg-web capture_lighting.",
		"ratio",
		"sdk_rppg_metrics@0.14",
		"beta-default",
		"rppg",
	),
	sdkPersistedMetric(
		"rppg.clipping_burden",
		"Clipping burden",
		"Persisted rppg-web clip_mean.",
		"ratio",
		"sdk_rppg_metrics@0.14",
		"beta-default",
		"rppg",
	),

	// --- EEG band powers (wasm) ---
	...bandPowerMetrics,

	// --- EEG advanced spectral/time features (wasm) ---
	eegWasmMetric(
		"eeg.alpha_peak_frequency",
		"Alpha peak frequency",
		"Prominence-qualified individual alpha frequency (7-14 Hz) from the Welch PSD.",
		"Hz",
		"alpha_peak@2",
		"advanced",
	),
	eegWasmMetric(
		"eeg.spectral_entropy",
		"Spectral entropy",
		"Normalized Shannon entropy of the per-window PSD.",
		"ratio",
		"spectral_entropy@1",
		"advanced",
	),
	eegWasmMetric(
		"eeg.dominant_frequency",
		"Dominant frequency",
		"Argmax PSD frequency within 1-40 Hz.",
		"Hz",
		"dominant_frequency@1",
		"advanced",
	),
	eegWasmMetric(
		"eeg.hjorth.activity",
		"Hjorth activity",
		"Window signal variance.",
		"uV^2",
		"hjorth@1",
		"advanced",
	),
	eegWasmMetric(
		"eeg.hjorth.mobility",
		"Hjorth mobility",
		"sqrt(var(dx)/var(x)) per window.",
		null,
		"hjorth@1",
		"advanced",
	),
	eegWasmMetric(
		"eeg.hjorth.complexity",
		"Hjorth complexity",
		"Mobility of the derivative over the mobility of the signal.",
		null,
		"hjorth@1",
		"advanced",
	),

	// --- EEG ratios (ts) ---
	eegWasmMetric(
		"eeg.ratio.alpha_beta",
		"Alpha/beta ratio",
		"Relative alpha over relative beta per window.",
		"ratio",
		"band_ratio@1",
		"experimental",
		{ implementedIn: "ts", channelPolicy: "channel-mean" },
	),
	eegWasmMetric(
		"eeg.ratio.theta_beta",
		"Theta/beta ratio",
		"Relative theta over relative beta per window (advanced-panel only; no focus claim).",
		"ratio",
		"band_ratio@1",
		"experimental",
		{
			implementedIn: "ts",
			channelPolicy: "channel-mean",
			displayEligibility: "advanced-panel",
		},
	),

	// --- pulse (sdk-persisted + ts recompute) ---
	sdkPersistedMetric(
		"pulse.heart_rate",
		"Heart rate",
		"Persisted ppg-web bpm / rppg-web fused_bpm.",
		"bpm",
		"sdk_ppg_metrics@0.12",
		"beta-default",
		"ppg",
	),
	sdkPersistedMetric(
		"pulse.mean_nn",
		"Mean NN",
		"Mean normal-to-normal interval; persisted (meanNnMs) and recomputable via hrv_time_domain@1.",
		"ms",
		"hrv_time_domain@1",
		"beta-default",
		"ppg",
		{ implementedIn: "ts", measurementClass: "derived-deterministic" },
	),
	sdkPersistedMetric(
		"pulse.rmssd",
		"RMSSD",
		"Root mean square of successive NN differences; persisted (rmssdMs) and recomputable via hrv_time_domain@1.",
		"ms",
		"hrv_time_domain@1",
		"beta-default",
		"ppg",
		{ implementedIn: "ts", measurementClass: "derived-deterministic" },
	),
	sdkPersistedMetric(
		"pulse.sdnn",
		"SDNN",
		"Standard deviation of NN intervals; persisted (sdnnMs) and recomputable via hrv_time_domain@1.",
		"ms",
		"hrv_time_domain@1",
		"beta-default",
		"ppg",
		{ implementedIn: "ts", measurementClass: "derived-deterministic" },
	),
	sdkPersistedMetric(
		"pulse.respiration_rate",
		"Respiration rate",
		"Persisted rppg-web respiration_rate gated by respiration_confidence.",
		"bpm",
		"sdk_rppg_metrics@0.14",
		"advanced",
		"rppg",
	),

	// --- rPPG estimator internals (sdk-persisted, advanced) ---
	...rppgAdvancedIds.map(([id, displayName]) =>
		sdkPersistedMetric(
			id,
			displayName,
			`Persisted rppg-web 0.14 estimator field (${id.split(".")[1]}).`,
			id.endsWith("bpm") ? "bpm" : null,
			"sdk_rppg_metrics@0.14",
			"advanced",
			"rppg",
		),
	),

	// --- session dynamics (registered-only in this seed) ---
	registeredOnly(
		"session.activation.peak",
		"Activation peak",
		"Peak of the 1 Hz activation trace above personal baseline.",
		null,
		"session",
		"trajectory_features@1",
		{ evidenceTier: "advanced" },
	),
	registeredOnly(
		"session.activation.area_above_baseline",
		"Activation area",
		"Area of the activation trace above personal baseline.",
		null,
		"session",
		"trajectory_features@1",
		{ evidenceTier: "advanced" },
	),
	registeredOnly(
		"session.recovery.slope",
		"Recovery slope",
		"Post-activation return slope of the 1 Hz HR/arousal trace.",
		null,
		"session",
		"recovery_curve@1",
		{ evidenceTier: "advanced" },
	),
	registeredOnly(
		"session.recovery.time_to_half",
		"Time to half recovery",
		"Time to recover half the activation amplitude.",
		"s",
		"session",
		"recovery_curve@1",
		{ evidenceTier: "advanced" },
	),
	registeredOnly(
		"session.recovery.time_to_baseline",
		"Time to baseline",
		"Time to return to personal baseline after activation.",
		"s",
		"session",
		"recovery_curve@1",
		{ evidenceTier: "advanced" },
	),
	registeredOnly(
		"session.focus.stability",
		"Focus stability",
		"Reserved: stability of attention-linked EEG features (no validated formula).",
		null,
		"session",
		"trajectory_features@1",
	),
	registeredOnly(
		"session.fatigue.onset",
		"Fatigue onset",
		"Reserved: onset time of fatigue-linked spectral drift (no validated formula).",
		"s",
		"session",
		"trajectory_features@1",
	),

	// --- headline scores ---
	define("elata.measurement_quality", {
		version: "1.0.0",
		displayName: "Measurement Quality",
		description:
			"100 * (0.4*coverage + 0.35*signal + 0.25*stability); withheld under 60 s of valid data.",
		unit: "score",
		domain: "headline",
		measurementClass: "product-composite",
		evidenceTier: "beta-default",
		inputs: [
			{ kind: "metric", metricId: "session.coverage" },
			{ kind: "metric", metricId: "eeg.artifact_coverage", optional: true },
			{ kind: "metric", metricId: "rppg.capture_confidence", optional: true },
			{ kind: "metric", metricId: "stream.discontinuities" },
		],
		window: SESSION_WINDOW,
		channelPolicy: "single",
		qualityGates: [],
		algorithm: "score_measurement_quality@1",
		aggregation: { session: "last", daily: "mean" },
		baseline: { eligible: false },
		displayEligibility: "product",
		computeProfile: "post-session",
		costClass: "trivial",
		implementedIn: "ts",
	}),
	define("elata.activation", {
		version: "1.0.0",
		displayName: "Activation",
		description:
			"Sigmoid composite of robust-z HR, inverted-z RMSSD, and z EEG beta ratio vs personal baseline.",
		unit: "score",
		domain: "headline",
		measurementClass: "product-composite",
		evidenceTier: "advanced",
		inputs: [
			{ kind: "metric", metricId: "pulse.heart_rate" },
			{ kind: "metric", metricId: "pulse.rmssd", optional: true },
			{
				kind: "metric",
				metricId: "eeg.band_power.beta.relative",
				optional: true,
			},
		],
		window: SESSION_WINDOW,
		channelPolicy: "single",
		qualityGates: [{ metricId: "elata.measurement_quality", min: 40 }],
		algorithm: "score_activation@1",
		aggregation: { session: "last", daily: "mean" },
		baseline: { eligible: false },
		displayEligibility: "advanced-panel",
		computeProfile: "post-session",
		costClass: "trivial",
		implementedIn: "ts",
	}),
	define("elata.recovery", {
		version: "1.0.0",
		displayName: "Recovery",
		description:
			"Post-activation recovery composite; withheld when no activation epoch is detected.",
		unit: "score",
		domain: "headline",
		measurementClass: "product-composite",
		evidenceTier: "advanced",
		inputs: [
			{
				kind: "metric",
				metricId: "session.recovery.time_to_half",
				optional: true,
			},
			{ kind: "metric", metricId: "session.recovery.slope", optional: true },
			{ kind: "metric", metricId: "pulse.rmssd", optional: true },
		],
		window: SESSION_WINDOW,
		channelPolicy: "single",
		qualityGates: [{ metricId: "elata.measurement_quality", min: 40 }],
		algorithm: "score_recovery@1",
		aggregation: { session: "last", daily: "mean" },
		baseline: { eligible: false },
		displayEligibility: "advanced-panel",
		computeProfile: "post-session",
		costClass: "trivial",
		implementedIn: "ts",
	}),
	registeredOnly(
		"elata.readiness",
		"Readiness",
		"Reserved: blocked on a standardized check-in policy.",
		"score",
		"headline",
		"registered_only@0",
		{ measurementClass: "product-composite" },
	),
	registeredOnly(
		"elata.focus",
		"Focus",
		"Reserved: deliberately not theta/beta; no validated formula.",
		"score",
		"headline",
		"registered_only@0",
		{ measurementClass: "product-composite" },
	),
	registeredOnly(
		"elata.resilience",
		"Resilience",
		"Reserved: requires longitudinal recovery evidence.",
		"score",
		"headline",
		"registered_only@0",
		{ measurementClass: "product-composite" },
	),
];
