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
	scoreMeasurementQuality,
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
		"robust_z@1",
	],
	generatedBy:
		"elata-bio-sdk packages/biosignal-analytics/dist/insights (canonical implementation)",
	note: [
		"Golden fixtures for the headline-score formulas, shared between the SDK",
		"(@elata-biosciences/biosignal-analytics) and the appstore mirror",
		"(src/lib/local-biosignals/insights-scores.ts). Expected values were produced by",
		"running the SDK implementation itself, so a drift in either copy fails a test.",
		"score_recovery@1 has no cases here: the appstore materializes none of its inputs,",
		"so the appstore registers it as unavailable rather than mirroring it.",
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
