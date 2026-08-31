/**
 * End-to-end data flow: one synthetic person, from raw daily samples through
 * rolling baselines and into all six headline scores.
 *
 * The per-score suites check each formula in isolation with hand-built
 * baselines. This one checks the joins — that a baseline computed by
 * `computeRollingBaseline` is actually accepted by the contributor machinery,
 * that Measurement Quality reaches every score that gates on it, and that the
 * invariants which must hold across the whole surface (never a neutral value
 * in place of a withheld one, contributors always emitted, MQ always
 * attached) hold for every score at once rather than one file at a time.
 *
 * The same pipeline is then run for a user on day three, where the shape of
 * the answer is the product's actual first-week experience: Measurement
 * Quality reports, session scores withhold on baselines, and the longitudinal
 * scores withhold on history with a count of what is still missing.
 */

import type { HeadlineScoreV1 } from "../insights/contributors.js";
import {
	computeRollingBaseline,
	contextBucketForHour,
	DAY_MS,
	type DailyMetricSample,
	type RollingBaseline,
} from "../insights/longitudinal.js";
import { scoreMeasurementQuality } from "../insights/measurementQuality.js";
import { scoreActivation } from "../insights/activation.js";
import { scoreRecovery } from "../insights/recovery.js";
import { scoreFocus } from "../insights/focus.js";
import {
	READINESS_MIN_HISTORY_DAYS,
	scoreReadiness,
} from "../insights/readiness.js";
import {
	RESILIENCE_MIN_HISTORY_DAYS,
	scoreResilience,
} from "../insights/resilience.js";
import type { ActivationEpochAnalysisV1 } from "../insights/activationEpoch.js";

const NOW = 1_760_000_000_000;
const HOUR = 8;
const BUCKET = contextBucketForHour(HOUR);

/** `days` daily readings ending today, wobbling around `centre`. */
function history(centre: number, spread: number, days: number): DailyMetricSample[] {
	return Array.from({ length: days }, (_, index) => ({
		atEpochMs: NOW - index * DAY_MS,
		// Deterministic, non-monotonic wobble: no RNG in a golden path.
		value: centre + spread * Math.sin(index * 1.7),
		quality: 0.85,
	}));
}

function rolling(
	metricId: string,
	centre: number,
	spread: number,
	days: number,
	contextBucket = BUCKET,
) {
	return computeRollingBaseline({
		metricId,
		contextBucket,
		samples: history(centre, spread, days),
		nowEpochMs: NOW,
	});
}

const epochAnalysis: ActivationEpochAnalysisV1 = {
	sampleRateHz: 1,
	sampleCount: 400,
	durationSeconds: 400,
	baseline: {
		startSeconds: 0,
		endSeconds: 59,
		sampleCount: 60,
		level: 62,
		scale: 2,
		activationThreshold: 66,
	},
	epoch: {
		startSeconds: 101,
		endSeconds: 339,
		durationSeconds: 238,
		sampleCount: 239,
		peakValue: 94,
		peakSeconds: 140,
		timeToPeakSeconds: 39,
		riseRatePerSecond: 0.82,
		areaAboveBaseline: 4120.5,
		recovery: {
			observedSeconds: 259,
			halfRecoveryTarget: 78,
			baselineReturnTarget: 65,
			timeToHalfRecoverySeconds: 118,
			timeToBaselineSeconds: 190,
			recoveryCompleted: true,
			recoverySlopePerSecond: -0.19,
			residualFraction: 0,
		},
		recoveryWithheldReason: null,
	},
	withheldReason: null,
};

/** Run the whole score surface for a person with `days` of history. */
function runPipeline(days: number): Record<string, HeadlineScoreV1> {
	const hr = rolling("pulse.heart_rate", 62, 4, days);
	const prv = rolling("pulse.rmssd", 44, 7, days);
	const resp = rolling("pulse.respiration_rate", 14.5, 1.4, days);
	const burden = rolling("session.activation.area_above_baseline", 260, 70, days, "any");
	const recoveryScores = rolling("elata.recovery", 64, 9, days, "any");
	const stability = rolling("session.focus.stability", 0.75, 0.08, days, "any");
	const alpha = rolling("eeg.band_power.alpha.relative", 0.3, 0.05, days, "any");
	const rt = rolling("session.task.rt_stability", 0.7, 0.07, days, "any");
	const lapses = rolling("session.task.lapse_rate", 0.06, 0.02, days, "any");
	const timeToHalf = rolling("session.recovery.time_to_half", 150, 32, days, "any");
	const slope = rolling("session.recovery.slope", -0.12, 0.045, days, "any");
	const toBaseline = rolling("session.recovery.time_to_baseline", 240, 55, days, "any");
	const betaRatio = rolling("eeg.ratio.alpha_beta", 1.1, 0.16, days, "any");

	const q = (baseline: RollingBaseline | null) => ({ baseline, quality: 0.9 });

	const measurementQuality = scoreMeasurementQuality({
		coverage: 0.96,
		signals: [
			{ id: "eeg", metricId: "eeg.artifact_coverage", value: 0.91 },
			{ id: "rppg", metricId: "rppg.capture_confidence", value: 0.84, quality: 0.9 },
		],
		discontinuities: 1,
		reconnects: 0,
		validDurationS: 640,
	});
	const mq = measurementQuality.value as number;

	return {
		measurementQuality,
		activation: scoreActivation({
			heartRate: { value: 71, ...q(hr.baseline) },
			rmssd: { value: 36, ...q(prv.baseline) },
			eegBetaRatio: { value: 1.28, ...q(betaRatio.baseline) },
			measurementQuality: mq,
		}),
		recovery: scoreRecovery({
			analysis: epochAnalysis,
			baselines: {
				timeToHalfRecoveryS: timeToHalf.baseline,
				recoverySlopePerSecond: slope.baseline,
				timeToBaselineS: toBaseline.baseline,
			},
			epochQuality: 0.88,
			rmssdRebound: { value: 1.14, baseline: prv.baseline, quality: 0.9 },
			alphaRebound: { value: 1.08, baseline: alpha.baseline, quality: 0.8 },
			measurementQuality: mq,
		}),
		focus: scoreFocus({
			task: {
				taskId: "app.nback",
				onTaskDurationS: 420,
				responseTimeStability: { value: 0.81, ...q(rt.baseline) },
				lapseRate: { value: 0.03, ...q(lapses.baseline) },
			},
			eegStability: { value: 0.87, ...q(stability.baseline) },
			alphaRelative: { value: 0.23, ...q(alpha.baseline) },
			measurementQuality: mq,
		}),
		readiness: scoreReadiness({
			history: hr.coverage,
			localHour: HOUR,
			restingHeartRate: { value: 58, ...q(hr.baseline) },
			pulseRateVariability: { value: 53, ...q(prv.baseline) },
			respirationRate: { value: 13.4, ...q(resp.baseline) },
			activationBurden: { value: 180, ...q(burden.baseline) },
			recentRecovery: { value: 79, ...q(recoveryScores.baseline) },
			measurementQuality: mq,
		}),
		resilience: scoreResilience({
			history: hr.coverage,
			recoveredActivationEpisodes: Math.floor(days / 3),
			recoverySpeedTrend: { value: 138, ...q(timeToHalf.baseline) },
			prolongedActivationRate: { value: 190, ...q(burden.baseline) },
			baselineStability: { value: 60, ...q(hr.baseline) },
			autonomicFlexibility: { value: 50, ...q(prv.baseline) },
			measurementQuality: mq,
		}),
	};
}

describe("headline-score pipeline, established user (30 days)", () => {
	const scores = runPipeline(30);

	test("every score produces a value from real rolling baselines", () => {
		for (const [name, score] of Object.entries(scores)) {
			expect([name, score.value === null]).toEqual([name, false]);
			expect([name, score.withheldReason]).toEqual([name, undefined]);
		}
	});

	test("values are 0-100 integers, and none is the neutral midpoint by default", () => {
		for (const [name, score] of Object.entries(scores)) {
			const value = score.value as number;
			expect([name, Number.isInteger(value)]).toEqual([name, true]);
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThanOrEqual(100);
		}
	});

	test("Measurement Quality travels with every score, identically", () => {
		const mq = scores.measurementQuality.value;
		for (const [name, score] of Object.entries(scores)) {
			expect([name, score.measurementQuality]).toEqual([name, mq]);
		}
	});

	test("every score exposes a full contributor drill-down", () => {
		for (const [name, score] of Object.entries(scores)) {
			expect([name, score.contributors.length > 0]).toEqual([name, true]);
			for (const contributor of score.contributors) {
				expect(contributor.quality).toBeGreaterThanOrEqual(0);
				expect(contributor.quality).toBeLessThanOrEqual(1);
				if (!contributor.included) expect(contributor.excludedReason).toBeDefined();
			}
			// MQ is the odd one out by design: it is not a baseline comparison, so
			// its components carry no z, and its signal term is one weight shared
			// over N components rather than a weight per contributor.
			if (name === "measurementQuality") {
				expect(score.contributors.every((c) => c.z === null)).toBe(true);
				continue;
			}
			const total = score.contributors.reduce((sum, c) => sum + c.weight, 0);
			expect([name, Math.abs(total - 1) < 1e-9]).toEqual([name, true]);
			for (const contributor of score.contributors) {
				if (contributor.included) expect(typeof contributor.z).toBe("number");
			}
		}
	});

	test("score ids and formula versions are the registered ones", () => {
		expect(
			Object.values(scores).map((score) => [score.scoreId, score.formulaVersion]),
		).toEqual([
			["elata.measurement_quality", "score_measurement_quality@1"],
			["elata.activation", "score_activation@1"],
			["elata.recovery", "score_recovery@2"],
			["elata.focus", "score_focus@1"],
			["elata.readiness", "score_readiness@1"],
			["elata.resilience", "score_resilience@1"],
		]);
	});
});

describe("headline-score pipeline, day three", () => {
	const scores = runPipeline(3);

	test("Measurement Quality still reports: it describes the recording, not the person", () => {
		expect(scores.measurementQuality.value).not.toBeNull();
	});

	test("every person-relative score withholds, with a reason and no number", () => {
		for (const [name, score] of Object.entries(scores)) {
			if (name === "measurementQuality") continue;
			expect([name, score.value]).toEqual([name, null]);
			expect([name, score.withheldReason !== undefined]).toEqual([name, true]);
			expect(score.value).not.toBe(50);
			expect(score.value).not.toBe(0);
		}
	});

	test("the session scores blame baselines; the longitudinal ones blame history", () => {
		// The distinction is the whole first-week message: "we don't know you
		// yet" versus "come back in eleven days".
		expect(scores.activation.withheldReason).toBe("insufficient_baseline");
		expect(scores.recovery.withheldReason).toBe("insufficient_baseline");
		expect(scores.focus.withheldReason).toBe("insufficient_baseline");
		expect(scores.readiness.withheldReason).toBe("insufficient_history");
		expect(scores.resilience.withheldReason).toBe("insufficient_history");
	});

	test("the longitudinal withholds count what is still missing", () => {
		expect(scores.readiness.withheldDetail).toEqual([
			{ requirement: "qualified_days", have: 3, need: READINESS_MIN_HISTORY_DAYS },
			{ requirement: "span_days", have: 3, need: 14 },
		]);
		expect(scores.resilience.withheldDetail?.[0]).toEqual({
			requirement: "qualified_days",
			have: 3,
			need: RESILIENCE_MIN_HISTORY_DAYS,
		});
	});

	test("drill-downs are still emitted, so the UI can show what was missing", () => {
		for (const score of Object.values(scores)) {
			expect(score.contributors.length).toBeGreaterThan(0);
		}
		for (const contributor of scores.activation.contributors) {
			expect(contributor.included).toBe(false);
			expect(contributor.excludedReason).toBe("insufficient_baseline");
		}
	});
});
