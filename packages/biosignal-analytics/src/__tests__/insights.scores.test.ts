/**
 * Headline-score formulas: contributor math, weight renormalization, and the
 * withhold rules — a withheld score is `value: null` with a reason and full
 * contributor drill-down, never a silent neutral 50.
 */

import type { PersonalBaseline } from "../insights/baseline.js";
import { compositeValue, sigmoid, type ScoreContributor } from "../insights/contributors.js";
import { scoreActivation } from "../insights/activation.js";
import {
	MQ_MIN_VALID_DURATION_S,
	scoreMeasurementQuality,
} from "../insights/measurementQuality.js";
import { detectActivationEpoch, scoreRecovery } from "../insights/recovery.js";

function baseline(median: number, mad: number, sessionCount = 10): PersonalBaseline {
	return { metricId: "m", contextBucket: "any", median, mad, sessionCount, updatedAtMs: 0 };
}

const goodMetric = (value: number, median: number, mad: number) => ({
	value,
	baseline: baseline(median, mad),
	quality: 1,
});

describe("score_measurement_quality@1", () => {
	test("computes the 0.4/0.35/0.25 composite", () => {
		const score = scoreMeasurementQuality({
			coverage: 0.9,
			signals: [
				{ id: "eeg", metricId: "eeg.artifact_coverage", value: 0.8 },
				{ id: "rppg", metricId: "rppg.capture_confidence", value: 0.6, quality: 0.5 },
			],
			discontinuities: 5,
			reconnects: 3,
			validDurationS: 300,
		});
		const signal = (1 * 0.8 + 0.5 * 0.6) / 1.5;
		const stability = Math.exp(-1) * Math.exp(-1);
		const expected = Math.round(100 * (0.4 * 0.9 + 0.35 * signal + 0.25 * stability));
		expect(score.value).toBe(expected);
		expect(score.measurementQuality).toBe(expected);
		expect(score.withheldReason).toBeUndefined();
		expect(score.contributors.length).toBe(4);
	});

	test("withholds under 60 s of valid data (value null, never 50)", () => {
		const score = scoreMeasurementQuality({
			coverage: 1,
			signals: [{ id: "eeg", metricId: "eeg.artifact_coverage", value: 1 }],
			discontinuities: 0,
			reconnects: 0,
			validDurationS: MQ_MIN_VALID_DURATION_S - 1,
		});
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_quality");
		expect(score.contributors.length).toBeGreaterThan(0);
	});

	test("withholds with inputs_missing when no signal components exist", () => {
		const score = scoreMeasurementQuality({
			coverage: 1,
			signals: [],
			discontinuities: 0,
			reconnects: 0,
			validDurationS: 300,
		});
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("inputs_missing");
	});

	test("perfect session scores 100", () => {
		const score = scoreMeasurementQuality({
			coverage: 1,
			signals: [{ id: "eeg", metricId: "eeg.artifact_coverage", value: 1 }],
			discontinuities: 0,
			reconnects: 0,
			validDurationS: 600,
		});
		expect(score.value).toBe(100);
	});
});

describe("score_activation@1", () => {
	test("known contributor z-scores produce the documented sigmoid value", () => {
		// HR: (70-60)/(1.4826*5) = +1.349; RMSSD negated: -(30-40)/(1.4826*5)
		// = +1.349; EEG: (0.6-0.5)/(1.4826*0.1) = +0.674.
		const score = scoreActivation({
			heartRate: goodMetric(70, 60, 5),
			rmssd: goodMetric(30, 40, 5),
			eegBetaRatio: goodMetric(0.6, 0.5, 0.1),
			measurementQuality: 80,
		});
		const zHr = (70 - 60) / (1.4826 * 5);
		const zPrv = -((30 - 40) / (1.4826 * 5));
		const zEeg = (0.6 - 0.5) / (1.4826 * 0.1);
		const weighted = 0.4 * zHr + 0.3 * zPrv + 0.3 * zEeg;
		expect(score.value).toBe(Math.round(100 * sigmoid(0.8 * weighted)));
		expect(score.contributors.every((c) => c.included)).toBe(true);
	});

	test("weights renormalize over included contributors", () => {
		// EEG missing: HR/PRV weights 0.4/0.3 renormalize to 4/7, 3/7.
		const score = scoreActivation({
			heartRate: goodMetric(70, 60, 5),
			rmssd: goodMetric(30, 40, 5),
			eegBetaRatio: { value: null, baseline: null, quality: 0 },
			measurementQuality: 80,
		});
		const zHr = (70 - 60) / (1.4826 * 5);
		const zPrv = -((30 - 40) / (1.4826 * 5));
		const weighted = (0.4 / 0.7) * zHr + (0.3 / 0.7) * zPrv;
		expect(score.value).toBe(Math.round(100 * sigmoid(0.8 * weighted)));
		const eeg = score.contributors.find((c) => c.id === "eeg-beta");
		expect(eeg?.included).toBe(false);
		expect(eeg?.excludedReason).toBe("inputs_missing");
	});

	test("withholds when included weight falls below 0.5", () => {
		// Only EEG (0.3) available -> 0.3 < 0.5 of total.
		const score = scoreActivation({
			heartRate: { value: null, baseline: null, quality: 0 },
			rmssd: { value: null, baseline: null, quality: 0 },
			eegBetaRatio: goodMetric(0.6, 0.5, 0.1),
			measurementQuality: 80,
		});
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_baseline");
	});

	test("withholds when MQ < 40", () => {
		const score = scoreActivation({
			heartRate: goodMetric(70, 60, 5),
			rmssd: goodMetric(30, 40, 5),
			eegBetaRatio: goodMetric(0.6, 0.5, 0.1),
			measurementQuality: 39,
		});
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_quality");
	});

	test("immature baselines exclude contributors", () => {
		const score = scoreActivation({
			heartRate: {
				value: 70,
				baseline: baseline(60, 5, 3), // < 5 sessions
				quality: 1,
			},
			rmssd: goodMetric(30, 40, 5),
			eegBetaRatio: goodMetric(0.6, 0.5, 0.1),
			measurementQuality: 80,
		});
		const hr = score.contributors.find((c) => c.id === "hr");
		expect(hr?.included).toBe(false);
		expect(hr?.excludedReason).toBe("insufficient_baseline");
		// Remaining weight 0.6 >= 0.5: still scored.
		expect(score.value).not.toBeNull();
	});

	test("low-quality contributors are excluded", () => {
		const score = scoreActivation({
			heartRate: { value: 70, baseline: baseline(60, 5), quality: 0.2 },
			rmssd: goodMetric(30, 40, 5),
			eegBetaRatio: goodMetric(0.6, 0.5, 0.1),
			measurementQuality: 80,
		});
		const hr = score.contributors.find((c) => c.id === "hr");
		expect(hr?.excludedReason).toBe("insufficient_quality");
	});
});

describe("score_recovery@1", () => {
	const recoveryInputs = {
		timeToHalfS: goodMetric(45, 60, 10),
		recoverySlope: goodMetric(1.4, 1.0, 0.2),
		rmssdReboundRatio: goodMetric(1.15, 1.0, 0.08),
		alphaRebound: goodMetric(1.1, 1.0, 0.1),
		measurementQuality: 80,
	};

	test("withholds no_activation_detected without an epoch", () => {
		const score = scoreRecovery({ ...recoveryInputs, activationEpoch: null });
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("no_activation_detected");
		expect(score.contributors.length).toBe(4);
	});

	test("scores when an activation epoch exists", () => {
		const score = scoreRecovery({
			...recoveryInputs,
			activationEpoch: { startUs: 0, endUs: 60_000_000, peakBpm: 95 },
		});
		expect(score.value).not.toBeNull();
		expect(score.value).toBeGreaterThan(50); // all contributors point to good recovery
	});

	test("withholds when MQ < 40 even with an epoch", () => {
		const score = scoreRecovery({
			...recoveryInputs,
			activationEpoch: { startUs: 0, endUs: 60_000_000, peakBpm: 95 },
			measurementQuality: 20,
		});
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_quality");
	});
});

describe("detectActivationEpoch", () => {
	const hrBaseline = baseline(60, 3);
	const trace = [
		{ tUs: 0, bpm: 61 },
		{ tUs: 1_000_000, bpm: 72 },
		{ tUs: 2_000_000, bpm: 88 },
		{ tUs: 3_000_000, bpm: 75 },
		{ tUs: 4_000_000, bpm: 59 },
	];

	test("finds the contiguous above-median span around the peak", () => {
		const epoch = detectActivationEpoch(trace, hrBaseline);
		expect(epoch).toEqual({ startUs: 0, endUs: 3_000_000, peakBpm: 88 });
	});

	test("returns null when the peak misses median + 5 bpm", () => {
		const flat = trace.map((point) => ({ ...point, bpm: 62 }));
		expect(detectActivationEpoch(flat, hrBaseline)).toBeNull();
		expect(detectActivationEpoch(trace, null)).toBeNull();
		expect(detectActivationEpoch([], hrBaseline)).toBeNull();
	});
});

describe("compositeValue withhold discipline", () => {
	test("null (not 50) when nothing is included", () => {
		const contributors: ScoreContributor[] = [
			{ id: "a", metricId: "m", z: null, weight: 1, quality: 1, included: false },
		];
		expect(compositeValue(contributors)).toBeNull();
	});

	test("zero total weight is withheld", () => {
		expect(compositeValue([])).toBeNull();
	});
});
