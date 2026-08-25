/**
 * Generate the shared headline-score golden fixture from this package's
 * CANONICAL compiled implementation (`dist/insights`), so the expected values
 * are the implementation's own output rather than hand arithmetic.
 *
 * The App Store keeps a verbatim copy of the emitted file and asserts its
 * mirrored formulas against it, exactly as the wire protocol is guarded by
 * biosignal-protocol-v1.json. Regenerate after any formula change and land
 * the result in BOTH repos.
 *
 * Usage: pnpm build && node ./scripts/generate-score-fixtures.mjs
 */
import { writeFileSync } from "node:fs";
import {
	robustZFromBaseline,
	scoreActivation,
	scoreFocus,
	scoreMeasurementQuality,
	scoreReadiness,
	scoreRecovery,
	scoreResilience,
} from "../dist/insights/index.js";

const baseline = (metricId, median, mad, sessionCount) => ({
	metricId,
	contextBucket: "default",
	median,
	mad,
	sessionCount,
	updatedAtMs: 1_760_000_000_000,
});

const mqCases = [
	{
		id: "mq_full_data",
		description:
			"Full data: high coverage, two signal components, one discontinuity, 10 min of valid signal.",
		input: {
			coverage: 0.97,
			signals: [
				{
					id: "eeg",
					metricId: "eeg.artifact_coverage",
					value: 0.92,
					quality: 1,
				},
				{
					id: "rppg",
					metricId: "pulse.capture_confidence",
					value: 0.81,
					quality: 0.9,
				},
			],
			discontinuities: 1,
			reconnects: 0,
			validDurationS: 612,
		},
	},
	{
		id: "mq_withhold_thin_data",
		description:
			"Withhold on thin data: identical inputs but only 45 s of valid signal.",
		input: {
			coverage: 0.97,
			signals: [
				{
					id: "eeg",
					metricId: "eeg.artifact_coverage",
					value: 0.92,
					quality: 1,
				},
				{
					id: "rppg",
					metricId: "pulse.capture_confidence",
					value: 0.81,
					quality: 0.9,
				},
			],
			discontinuities: 1,
			reconnects: 0,
			validDurationS: 45,
		},
	},
	{
		id: "mq_withhold_inputs_missing",
		description:
			"Withhold when no signal component exists at all — never a neutral 50.",
		input: {
			coverage: 0.99,
			signals: [],
			discontinuities: 0,
			reconnects: 0,
			validDurationS: 600,
		},
	},
	{
		id: "mq_partial_contributors",
		description:
			"Only the PPG signal component exists, at reduced weight; instability from 3 gaps and 2 reconnects.",
		input: {
			coverage: 0.88,
			signals: [
				{
					id: "ppg",
					metricId: "pulse.signal_quality",
					value: 0.55,
					quality: 0.6,
				},
			],
			discontinuities: 3,
			reconnects: 2,
			validDurationS: 300,
		},
	},
	{
		id: "mq_low_quality_not_withheld",
		description:
			"Poor but honest measurement: low coverage, dirty signal, many gaps — reported low, not withheld.",
		input: {
			coverage: 0.4,
			signals: [
				{
					id: "eeg",
					metricId: "eeg.artifact_coverage",
					value: 0.3,
					quality: 1,
				},
			],
			discontinuities: 6,
			reconnects: 4,
			validDurationS: 900,
		},
	},
	{
		id: "mq_clamps_out_of_range_inputs",
		description:
			"Out-of-range coverage and signal values are clamped to 0..1 before weighting.",
		input: {
			coverage: 1.4,
			signals: [
				{
					id: "eeg",
					metricId: "eeg.artifact_coverage",
					value: -0.2,
					quality: 1.5,
				},
			],
			discontinuities: -2,
			reconnects: -1,
			validDurationS: 120,
		},
	},
];

const activationCases = [
	{
		id: "activation_full_data",
		description: "All three contributors present with usable baselines.",
		input: {
			heartRate: {
				value: 78,
				baseline: baseline("pulse.heart_rate", 68, 4, 12),
				quality: 0.9,
			},
			rmssd: {
				value: 28,
				baseline: baseline("pulse.rmssd", 42, 6, 12),
				quality: 0.85,
			},
			eegBetaRatio: {
				value: 1.35,
				baseline: baseline("eeg.ratio.alpha_beta", 1.1, 0.15, 12),
				quality: 0.8,
			},
			measurementQuality: 82,
		},
	},
	{
		id: "activation_partial_contributor_renormalization",
		description:
			"EEG contributor is missing (no spectral features on device): weights renormalize over HR + RMSSD.",
		input: {
			heartRate: {
				value: 78,
				baseline: baseline("pulse.heart_rate", 68, 4, 12),
				quality: 0.9,
			},
			rmssd: {
				value: 28,
				baseline: baseline("pulse.rmssd", 42, 6, 12),
				quality: 0.85,
			},
			eegBetaRatio: { value: null, baseline: null, quality: 0 },
			measurementQuality: 82,
		},
	},
	{
		id: "activation_withhold_insufficient_baseline",
		description:
			"Only the EEG contributor is usable (weight 0.3 < the 0.5 included-weight floor) — withheld.",
		input: {
			heartRate: {
				value: 78,
				baseline: baseline("pulse.heart_rate", 68, 4, 3),
				quality: 0.9,
			},
			rmssd: { value: null, baseline: null, quality: 0 },
			eegBetaRatio: {
				value: 1.35,
				baseline: baseline("eeg.ratio.alpha_beta", 1.1, 0.15, 12),
				quality: 0.8,
			},
			measurementQuality: 82,
		},
	},
	{
		id: "activation_withhold_low_measurement_quality",
		description:
			"Measurement quality below 40 withholds the score even with perfect inputs.",
		input: {
			heartRate: {
				value: 78,
				baseline: baseline("pulse.heart_rate", 68, 4, 12),
				quality: 0.9,
			},
			rmssd: {
				value: 28,
				baseline: baseline("pulse.rmssd", 42, 6, 12),
				quality: 0.85,
			},
			eegBetaRatio: {
				value: 1.35,
				baseline: baseline("eeg.ratio.alpha_beta", 1.1, 0.15, 12),
				quality: 0.8,
			},
			measurementQuality: 30,
		},
	},
	{
		id: "activation_degenerate_and_low_quality_contributors",
		description:
			"A flat baseline (MAD 0) and a contributor below the 0.4 quality floor are both excluded with reasons.",
		input: {
			heartRate: {
				value: 78,
				baseline: baseline("pulse.heart_rate", 68, 0, 12),
				quality: 0.9,
			},
			rmssd: {
				value: 28,
				baseline: baseline("pulse.rmssd", 42, 6, 12),
				quality: 0.2,
			},
			eegBetaRatio: {
				value: 1.35,
				baseline: baseline("eeg.ratio.alpha_beta", 1.1, 0.15, 12),
				quality: 0.8,
			},
			measurementQuality: 82,
		},
	},
	{
		id: "activation_z_clamped_extremes",
		description:
			"Extreme session values clamp to the ±3 robust-z bound before compositing.",
		input: {
			heartRate: {
				value: 200,
				baseline: baseline("pulse.heart_rate", 68, 4, 12),
				quality: 1,
			},
			rmssd: {
				value: 200,
				baseline: baseline("pulse.rmssd", 42, 6, 12),
				quality: 1,
			},
			eegBetaRatio: {
				value: 9,
				baseline: baseline("eeg.ratio.alpha_beta", 1.1, 0.15, 12),
				quality: 1,
			},
			measurementQuality: 95,
		},
	},
];

const bucketed = (metricId, median, mad, sessionCount, contextBucket) => ({
	...baseline(metricId, median, mad, sessionCount),
	contextBucket,
});

// --- score_recovery@2 -------------------------------------------------------
// The epoch analysis is the `activation_epoch@1` contract; these are the
// shapes the engine emits, not values recomputed here.
const recoveryEpoch = (recovery, overrides = {}) => ({
	sampleRateHz: 1,
	sampleCount: 400,
	durationSeconds: 400,
	baseline: {
		startSeconds: 0,
		endSeconds: 59,
		sampleCount: 60,
		level: 10,
		scale: 1,
		activationThreshold: 12,
	},
	epoch:
		recovery === undefined
			? null
			: {
					startSeconds: 101,
					endSeconds: 339,
					durationSeconds: 238,
					sampleCount: 239,
					peakValue: 50,
					peakSeconds: 140,
					timeToPeakSeconds: 39,
					riseRatePerSecond: 1,
					areaAboveBaseline: 5599.375,
					recovery,
					recoveryWithheldReason:
						recovery === null ? "postEpochWindowTooShort" : null,
				},
	withheldReason: recovery === undefined ? "noQualifyingActivation" : null,
	...overrides,
});

const fullRecovery = {
	observedSeconds: 259,
	halfRecoveryTarget: 30,
	baselineReturnTarget: 14,
	timeToHalfRecoverySeconds: 120,
	timeToBaselineSeconds: 184,
	recoveryCompleted: true,
	recoverySlopePerSecond: -0.1956521739130435,
	residualFraction: 0,
};

const recoveryBaselines = {
	timeToHalfRecoveryS: baseline("session.recovery.time_to_half", 150, 30, 12),
	recoverySlopePerSecond: baseline("session.recovery.slope", -0.12, 0.04, 12),
	timeToBaselineS: baseline("session.recovery.time_to_baseline", 240, 50, 12),
};

const recoveryRest = {
	baselines: recoveryBaselines,
	epochQuality: 0.9,
	rmssdRebound: {
		value: 1.15,
		baseline: baseline("pulse.rmssd", 1, 0.08, 12),
		quality: 0.9,
	},
	alphaRebound: {
		value: 1.1,
		baseline: baseline("eeg.band_power.alpha.relative", 1, 0.1, 12),
		quality: 0.8,
	},
	measurementQuality: 80,
};

const recoveryCases = [
	{
		id: "recovery_full_data",
		description:
			"A complete, fast recovery: every epoch-derived and rebound contributor present.",
		input: { analysis: recoveryEpoch(fullRecovery), ...recoveryRest },
	},
	{
		id: "recovery_partial_renormalization",
		description:
			"Half recovery reached, baseline never regained: the time-to-baseline term drops and the remaining 0.85 renormalizes.",
		input: {
			analysis: recoveryEpoch({
				...fullRecovery,
				timeToBaselineSeconds: null,
				recoveryCompleted: false,
				residualFraction: 0.3,
			}),
			...recoveryRest,
		},
	},
	{
		id: "recovery_withhold_no_activation",
		description:
			"A baseline was established and nothing cleared the activation threshold.",
		input: { analysis: recoveryEpoch(undefined), ...recoveryRest },
	},
	{
		id: "recovery_withhold_recording_ended",
		description:
			"An epoch with no recovery block: the recording ended before recovery could be observed.",
		input: { analysis: recoveryEpoch(null), ...recoveryRest },
	},
	{
		id: "recovery_withhold_never_recovered",
		description:
			"A plateau that never reached half recovery — a recovery block exists, but there is no recovery to rate.",
		input: {
			analysis: recoveryEpoch({
				...fullRecovery,
				timeToHalfRecoverySeconds: null,
				timeToBaselineSeconds: null,
				recoveryCompleted: false,
				recoverySlopePerSecond: 0,
				residualFraction: 1,
			}),
			...recoveryRest,
		},
	},
	{
		id: "recovery_withhold_inputs_missing",
		description: "No activation-epoch analysis at all.",
		input: { analysis: null, ...recoveryRest },
	},
	{
		id: "recovery_withhold_low_measurement_quality",
		description: "MQ below 40 withholds even a textbook recovery.",
		input: {
			analysis: recoveryEpoch(fullRecovery),
			...recoveryRest,
			measurementQuality: 30,
		},
	},
];

// --- score_focus@1 ----------------------------------------------------------
const focusTask = {
	taskId: "app.nback",
	onTaskDurationS: 420,
	responseTimeStability: {
		value: 0.82,
		baseline: baseline("session.task.rt_stability", 0.7, 0.06, 12),
		quality: 0.9,
	},
	lapseRate: {
		value: 0.03,
		baseline: baseline("session.task.lapse_rate", 0.06, 0.02, 12),
		quality: 0.9,
	},
};

const focusEeg = {
	eegStability: {
		value: 0.88,
		baseline: baseline("session.focus.stability", 0.75, 0.07, 12),
		quality: 0.9,
	},
	alphaRelative: {
		value: 0.22,
		baseline: baseline("eeg.band_power.alpha.relative", 0.3, 0.04, 12),
		quality: 0.9,
	},
};

const focusCases = [
	{
		id: "focus_full_data",
		description:
			"A real task with behavioural performance, plus both EEG contributors.",
		input: { task: focusTask, ...focusEeg, measurementQuality: 78 },
	},
	{
		id: "focus_eeg_only_renormalization",
		description:
			"A task ran but the app reported no performance data: the EEG side scores alone at 0.60 renormalized.",
		input: {
			task: {
				...focusTask,
				responseTimeStability: { value: null, baseline: null, quality: 0 },
				lapseRate: { value: null, baseline: null, quality: 0 },
			},
			...focusEeg,
			measurementQuality: 78,
		},
	},
	{
		id: "focus_withhold_no_task_context",
		description:
			"No task at all — focus on nothing is not a number, however clean the EEG.",
		input: { task: null, ...focusEeg, measurementQuality: 90 },
	},
	{
		id: "focus_withhold_task_too_short",
		description:
			"Twenty seconds in a task is not task context; the shortfall is counted.",
		input: {
			task: { ...focusTask, onTaskDurationS: 20 },
			...focusEeg,
			measurementQuality: 78,
		},
	},
	{
		id: "focus_withhold_low_measurement_quality",
		description:
			"Focus needs cleaner EEG than Activation does: MQ floor is 50.",
		input: { task: focusTask, ...focusEeg, measurementQuality: 45 },
	},
	{
		id: "focus_withhold_no_eeg",
		description:
			"Task performance alone is not a biosignal score, and the task side cannot reach the 0.5 weight floor anyway.",
		input: {
			task: focusTask,
			eegStability: { value: null, baseline: null, quality: 0 },
			alphaRelative: { value: null, baseline: null, quality: 0 },
			measurementQuality: 78,
		},
	},
];

// --- score_readiness@1 ------------------------------------------------------
const readinessCoverage = (qualifiedDays, spanDays) => ({
	windowDays: 30,
	qualifiedSamples: qualifiedDays,
	qualifiedDays,
	spanDays,
	rejectedForQuality: 0,
	rejectedAsOutlier: 0,
});

const readinessBody = {
	localHour: 8,
	restingHeartRate: {
		value: 58,
		baseline: bucketed("pulse.heart_rate", 62, 3, 20, "morning"),
		quality: 0.9,
	},
	pulseRateVariability: {
		value: 52,
		baseline: bucketed("pulse.rmssd", 44, 6, 20, "morning"),
		quality: 0.9,
	},
	respirationRate: {
		value: 13.5,
		baseline: bucketed("pulse.respiration_rate", 14.5, 1.2, 20, "morning"),
		quality: 0.9,
	},
	activationBurden: {
		value: 180,
		baseline: baseline("session.activation.area_above_baseline", 260, 60, 20),
		quality: 0.9,
	},
	recentRecovery: {
		value: 88,
		baseline: baseline("elata.recovery", 64, 8, 20),
		quality: 0.9,
	},
	measurementQuality: 82,
};

const readinessCases = [
	{
		id: "readiness_full_data",
		description:
			"A morning reading with 22 days of history and all five contributors present.",
		input: { history: readinessCoverage(22, 28), ...readinessBody },
	},
	{
		id: "readiness_partial_renormalization",
		description:
			"Recovery was withheld yesterday, so its 0.15 drops and the rest renormalize — never read as a mid-range recovery.",
		input: {
			history: readinessCoverage(22, 28),
			...readinessBody,
			recentRecovery: { value: null, baseline: null, quality: 0 },
		},
	},
	{
		id: "readiness_withhold_three_days_of_history",
		description:
			"The case the minimum-history policy exists for: three days in, withheld with the shortfall counted.",
		input: { history: readinessCoverage(3, 3), ...readinessBody },
	},
	{
		id: "readiness_withhold_crammed_history",
		description:
			"Twenty qualified days crammed into six calendar days describes a week, not a person.",
		input: { history: readinessCoverage(20, 6), ...readinessBody },
	},
	{
		id: "readiness_withhold_baseline_context_mismatch",
		description:
			"A morning reading compared against all-day baselines: every physiological term is excluded and the remaining 0.30 is under the floor.",
		input: {
			history: readinessCoverage(22, 28),
			...readinessBody,
			restingHeartRate: {
				value: 58,
				baseline: bucketed("pulse.heart_rate", 62, 3, 20, "any"),
				quality: 0.9,
			},
			pulseRateVariability: {
				value: 52,
				baseline: bucketed("pulse.rmssd", 44, 6, 20, "any"),
				quality: 0.9,
			},
			respirationRate: {
				value: 13.5,
				baseline: bucketed("pulse.respiration_rate", 14.5, 1.2, 20, "any"),
				quality: 0.9,
			},
		},
	},
	{
		id: "readiness_withhold_low_measurement_quality",
		description: "MQ below 40 withholds regardless of history.",
		input: {
			history: readinessCoverage(22, 28),
			...readinessBody,
			measurementQuality: 25,
		},
	},
];

// --- score_resilience@1 -----------------------------------------------------
const resilienceBody = {
	recoveredActivationEpisodes: 11,
	recoverySpeedTrend: {
		value: -1.8,
		baseline: baseline("session.recovery.time_to_half", -0.2, 0.8, 30),
		quality: 0.9,
	},
	prolongedActivationRate: {
		value: 0.1,
		baseline: baseline(
			"session.activation.area_above_baseline",
			0.22,
			0.06,
			30,
		),
		quality: 0.9,
	},
	baselineStability: {
		value: 0.88,
		baseline: baseline("pulse.heart_rate", 0.8, 0.05, 30),
		quality: 0.9,
	},
	autonomicFlexibility: {
		value: 0.62,
		baseline: baseline("pulse.rmssd", 0.5, 0.06, 30),
		quality: 0.9,
	},
	measurementQuality: 76,
};

const resilienceCases = [
	{
		id: "resilience_full_data",
		description:
			"Four weeks of history, eleven recovered activations, all four longitudinal terms present.",
		input: { history: readinessCoverage(26, 29), ...resilienceBody },
	},
	{
		id: "resilience_partial_renormalization",
		description:
			"Baseline stability could not be computed: its 0.20 drops and the remaining 0.80 renormalizes.",
		input: {
			history: readinessCoverage(26, 29),
			...resilienceBody,
			baselineStability: { value: null, baseline: null, quality: 0 },
		},
	},
	{
		id: "resilience_withhold_two_weeks",
		description:
			"Two weeks in, with four recovered activations: all three floors are unmet and all three are reported.",
		input: {
			history: readinessCoverage(14, 14),
			...resilienceBody,
			recoveredActivationEpisodes: 4,
		},
	},
	{
		id: "resilience_withhold_no_activations",
		description:
			"Four calm weeks. Regulation capacity is measured by coming back down; with nothing to come back down from there is no evidence.",
		input: {
			history: readinessCoverage(26, 29),
			...resilienceBody,
			recoveredActivationEpisodes: 1,
		},
	},
	{
		id: "resilience_withhold_no_longitudinal_baselines",
		description:
			"Enough history to compute this window's terms, none yet to compare them against — a different message from 'come back in N days'.",
		input: {
			history: readinessCoverage(26, 29),
			...resilienceBody,
			recoverySpeedTrend: { value: -1.8, baseline: null, quality: 0.9 },
			prolongedActivationRate: { value: 0.1, baseline: null, quality: 0.9 },
			baselineStability: { value: 0.88, baseline: null, quality: 0.9 },
		},
	},
	{
		id: "resilience_withhold_low_measurement_quality",
		description: "Window-median MQ below 40 withholds.",
		input: {
			history: readinessCoverage(26, 29),
			...resilienceBody,
			measurementQuality: 20,
		},
	},
];

const robustZCases = [
	{
		id: "robust_z_basic",
		description: "(value - median) / (1.4826 * mad).",
		input: { value: 78, baseline: baseline("pulse.heart_rate", 68, 4, 12) },
	},
	{
		id: "robust_z_clamped_high",
		description: "Clamped at +3.",
		input: { value: 400, baseline: baseline("pulse.heart_rate", 68, 4, 12) },
	},
	{
		id: "robust_z_clamped_low",
		description: "Clamped at -3.",
		input: { value: 0, baseline: baseline("pulse.heart_rate", 68, 4, 12) },
	},
	{
		id: "robust_z_degenerate_baseline",
		description:
			"A non-positive scaled MAD yields z = 0 with an explicit degenerate flag.",
		input: { value: 78, baseline: baseline("pulse.heart_rate", 68, 0, 12) },
	},
];

const fixture = {
	schema: "elata.score-fixtures/v1",
	algorithms: [
		"score_measurement_quality@1",
		"score_activation@1",
		"score_recovery@2",
		"score_focus@1",
		"score_readiness@1",
		"score_resilience@1",
		"robust_z@1",
	],
	generatedBy:
		"elata-bio-sdk packages/biosignal-analytics/dist/insights (canonical implementation)",
	note: [
		"Golden fixtures for the headline-score formulas, shared between the SDK",
		"(@elata-biosciences/biosignal-analytics) and the appstore mirror",
		"(src/lib/local-biosignals/insights-scores.ts). Expected values were produced by",
		"running the SDK implementation itself, so a drift in either copy fails a test.",
		"ADDITIVE ONLY: a mirror that implements a subset of these algorithms must skip",
		"cases whose `algorithm` it does not implement rather than failing on them, so new",
		"scores can land here before the mirror catches up. score_recovery@1 is retired and",
		"has no cases; score_recovery@2 replaces it.",
	].join(" "),
	cases: [
		...mqCases.map((testCase) => ({
			...testCase,
			algorithm: "score_measurement_quality@1",
			expected: scoreMeasurementQuality(testCase.input),
		})),
		...activationCases.map((testCase) => ({
			...testCase,
			algorithm: "score_activation@1",
			expected: scoreActivation(testCase.input),
		})),
		...recoveryCases.map((testCase) => ({
			...testCase,
			algorithm: "score_recovery@2",
			expected: scoreRecovery(testCase.input),
		})),
		...focusCases.map((testCase) => ({
			...testCase,
			algorithm: "score_focus@1",
			expected: scoreFocus(testCase.input),
		})),
		...readinessCases.map((testCase) => ({
			...testCase,
			algorithm: "score_readiness@1",
			expected: scoreReadiness(testCase.input),
		})),
		...resilienceCases.map((testCase) => ({
			...testCase,
			algorithm: "score_resilience@1",
			expected: scoreResilience(testCase.input),
		})),
		...robustZCases.map((testCase) => ({
			...testCase,
			algorithm: "robust_z@1",
			expected: robustZFromBaseline(
				testCase.input.value,
				testCase.input.baseline,
			),
		})),
	],
};

const outPath =
	process.argv[2] ??
	new URL("../fixtures/insights/score-fixtures.json", import.meta.url).pathname;
writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${fixture.cases.length} score cases to ${outPath}`);
