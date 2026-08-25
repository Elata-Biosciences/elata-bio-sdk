/**
 * `score_focus@1` — EEG stability and qualified spectral features read
 * against a real task, or nothing at all.
 *
 * Two properties carry most of the weight here.
 *
 * Focus withholds without task context. "Attention" reported from a resting
 * recording is the failure this score exists to avoid: there is nothing being
 * attended to, so there is no number to give.
 *
 * Focus is not theta/beta. The theta/beta ratio is not a valid attention
 * measure, and the cheapest way to be sure this score is not one wearing a
 * different name is for neither band to be an input at all. A test asserts
 * that against the contributor list, so adding one later fails loudly.
 */

import type { PersonalBaseline } from "../insights/baseline.js";
import { sigmoid } from "../insights/contributors.js";
import {
	FOCUS_MIN_MQ,
	FOCUS_MIN_ON_TASK_S,
	scoreFocus,
	type FocusInput,
	type TaskContext,
} from "../insights/focus.js";

function baseline(median: number, mad: number, sessionCount = 10): PersonalBaseline {
	return {
		metricId: "m",
		contextBucket: "any",
		median,
		mad,
		sessionCount,
		updatedAtMs: 0,
	};
}

const metric = (value: number, median: number, mad: number, quality = 0.9) => ({
	value,
	baseline: baseline(median, mad),
	quality,
});

const absent = { value: null, baseline: null, quality: 0 };

function task(overrides: Partial<TaskContext> = {}): TaskContext {
	return {
		taskId: "app.nback",
		onTaskDurationS: 420,
		responseTimeStability: metric(0.82, 0.7, 0.06),
		lapseRate: metric(0.03, 0.06, 0.02),
		...overrides,
	};
}

function input(overrides: Partial<FocusInput> = {}): FocusInput {
	return {
		task: task(),
		eegStability: metric(0.88, 0.75, 0.07),
		alphaRelative: metric(0.22, 0.3, 0.04),
		measurementQuality: 78,
		...overrides,
	};
}

describe("score_focus@1 withholding", () => {
	test("no task context withholds no_task_context, never a resting 'attention' number", () => {
		const score = scoreFocus(input({ task: null }));
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("no_task_context");
		// Perfect EEG on both contributors is deliberately not enough.
		expect(score.contributors.filter((c) => c.included).length).toBe(2);
	});

	test("a task too short to be a task withholds, with how short it was", () => {
		const score = scoreFocus(
			input({ task: task({ onTaskDurationS: FOCUS_MIN_ON_TASK_S - 1 }) }),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("no_task_context");
		expect(score.withheldDetail).toEqual([
			{
				requirement: "on_task_seconds",
				have: FOCUS_MIN_ON_TASK_S - 1,
				need: FOCUS_MIN_ON_TASK_S,
			},
		]);
	});

	test("the on-task floor is inclusive", () => {
		const score = scoreFocus(
			input({ task: task({ onTaskDurationS: FOCUS_MIN_ON_TASK_S }) }),
		);
		expect(score.value).not.toBeNull();
	});

	test("MQ below the focus floor withholds", () => {
		const score = scoreFocus(input({ measurementQuality: FOCUS_MIN_MQ - 1 }));
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_quality");
	});

	test("focus needs EEG: task performance alone is not a biosignal score", () => {
		const score = scoreFocus(
			input({ eegStability: absent, alphaRelative: absent }),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("inputs_missing");
	});

	test("an EEG baseline too young to compare against withholds", () => {
		// The 0.40 of weight the task side carries is under the 0.5 floor by
		// construction, so losing EEG can never leave a scoreable remainder.
		const immature = {
			value: 0.88,
			baseline: baseline(0.75, 0.07, 2),
			quality: 0.9,
		};
		const score = scoreFocus(
			input({ eegStability: immature, alphaRelative: immature }),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_baseline");
	});

	test("low-quality EEG excludes the contributors and withholds", () => {
		const score = scoreFocus(
			input({
				eegStability: metric(0.88, 0.75, 0.07, 0.1),
				alphaRelative: metric(0.22, 0.3, 0.04, 0.1),
			}),
		);
		expect(score.value).toBeNull();
		expect(score.withheldReason).toBe("insufficient_baseline");
		expect(
			score.contributors.find((c) => c.id === "eeg-stability")?.excludedReason,
		).toBe("insufficient_quality");
	});

	test("no withheld path ever returns a number", () => {
		const cases: FocusInput[] = [
			input({ task: null }),
			input({ task: task({ onTaskDurationS: 5 }) }),
			input({ measurementQuality: 0 }),
			input({ eegStability: absent, alphaRelative: absent }),
		];
		for (const withheld of cases) {
			const score = scoreFocus(withheld);
			expect(score.value).toBeNull();
			expect(score.withheldReason).toBeDefined();
			expect(score.value).not.toBe(50);
			// The drill-down is always emitted, withheld or not.
			expect(score.contributors.length).toBe(4);
			expect(score.measurementQuality).toBe(withheld.measurementQuality);
		}
	});
});

describe("score_focus@1 is not theta/beta", () => {
	test("neither theta nor beta nor any band ratio is an input", () => {
		const metricIds = scoreFocus(input()).contributors.map((c) => c.metricId);
		for (const metricId of metricIds) {
			expect(metricId).not.toContain("theta");
			expect(metricId).not.toContain("beta");
			expect(metricId).not.toContain("ratio");
		}
		expect(metricIds).toEqual([
			"session.focus.stability",
			"eeg.band_power.alpha.relative",
			"session.task.rt_stability",
			"session.task.lapse_rate",
		]);
	});

	test("alpha enters as desynchronization: lower relative alpha scores higher", () => {
		// Alpha desynchronization against the personal resting baseline is the
		// engaged-attention direction. A sign error here would be invisible.
		const low = scoreFocus(input({ alphaRelative: metric(0.2, 0.3, 0.04) }));
		const high = scoreFocus(input({ alphaRelative: metric(0.4, 0.3, 0.04) }));
		expect(low.value as number).toBeGreaterThan(high.value as number);
	});

	test("stability raises the score and lapses lower it", () => {
		const steady = scoreFocus(input());
		const lapsing = scoreFocus(
			input({ task: task({ lapseRate: metric(0.2, 0.06, 0.02) }) }),
		);
		const drifting = scoreFocus(
			input({ eegStability: metric(0.5, 0.75, 0.07) }),
		);
		expect(steady.value as number).toBeGreaterThan(lapsing.value as number);
		expect(steady.value as number).toBeGreaterThan(drifting.value as number);
	});
});

describe("score_focus@1 composition", () => {
	const zOf = (value: number, median: number, mad: number) =>
		(value - median) / (1.4826 * mad);

	const zStability = zOf(0.88, 0.75, 0.07);
	const zAlpha = -zOf(0.22, 0.3, 0.04);
	const zRt = zOf(0.82, 0.7, 0.06);
	const zLapse = -zOf(0.03, 0.06, 0.02);

	test("the documented weights produce the documented value", () => {
		const score = scoreFocus(input());
		const weighted = 0.35 * zStability + 0.25 * zAlpha + 0.25 * zRt + 0.15 * zLapse;
		expect(score.value).toBe(Math.round(100 * sigmoid(0.8 * weighted)));
		expect(score.scoreId).toBe("elata.focus");
		expect(score.formulaVersion).toBe("score_focus@1");
	});

	test("EEG alone scores when the app reports no performance data", () => {
		// A task ran, so "focus" means something; the app just measured nothing.
		const score = scoreFocus(
			input({
				task: task({ responseTimeStability: absent, lapseRate: absent }),
			}),
		);
		const renormalized = (0.35 * zStability + 0.25 * zAlpha) / 0.6;
		const neutralFill = 0.35 * zStability + 0.25 * zAlpha + 0.25 * 0 + 0.15 * 0;
		expect(score.value).toBe(Math.round(100 * sigmoid(0.8 * renormalized)));
		expect(Math.round(100 * sigmoid(0.8 * renormalized))).not.toBe(
			Math.round(100 * sigmoid(0.8 * neutralFill)),
		);
		expect(score.value).not.toBe(Math.round(100 * sigmoid(0.8 * neutralFill)));
	});

	test("weights renormalize when one task contributor is missing", () => {
		const score = scoreFocus(input({ task: task({ lapseRate: absent }) }));
		const renormalized =
			(0.35 * zStability + 0.25 * zAlpha + 0.25 * zRt) / 0.85;
		expect(score.value).toBe(Math.round(100 * sigmoid(0.8 * renormalized)));
		const lapse = score.contributors.find((c) => c.id === "task-lapse-rate");
		expect(lapse?.included).toBe(false);
		expect(lapse?.excludedReason).toBe("inputs_missing");
	});

	test("every contributor exposes weight, z and quality, and the weights sum to 1", () => {
		const score = scoreFocus(input());
		expect(
			score.contributors.reduce((sum, c) => sum + c.weight, 0),
		).toBeCloseTo(1, 10);
		for (const contributor of score.contributors) {
			expect(contributor.quality).toBeGreaterThanOrEqual(0);
			if (contributor.included) expect(typeof contributor.z).toBe("number");
			else expect(contributor.excludedReason).toBeDefined();
		}
	});

	test("MQ always travels with the score", () => {
		expect(scoreFocus(input()).measurementQuality).toBe(78);
		expect(
			scoreFocus(input({ task: null, measurementQuality: 64 })).measurementQuality,
		).toBe(64);
	});
});
