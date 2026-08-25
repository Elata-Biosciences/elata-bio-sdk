/**
 * `score_focus@1` — EEG stability and qualified spectral features read
 * against a real task.
 *
 * ## What this deliberately is not
 *
 * It is not a theta/beta ratio with a friendlier label. The theta/beta ratio
 * is not a valid measure of attention — its association with attentional
 * state has failed to replicate, it is confounded by drowsiness, arousal and
 * eye movement, and on consumer hardware it mostly tracks how well the
 * electrodes are sitting. Rather than argue about weighting it, neither band
 * is an input here at all, and a test asserts that against the contributor
 * list so a future edit that reintroduces one fails loudly.
 *
 * It is also not something that can be reported from a resting recording.
 * "Focus" without a task is a number about nothing: there is no target of
 * attention, so there is no performance to be steady at and no ground truth
 * the EEG side could be steady *with respect to*. Without task context the
 * score withholds `no_task_context`, and it does so before looking at any
 * physiology.
 *
 * ## Contributors (design weights, renormalized over the included subset)
 *
 * | id                | weight | metric                            | sense |
 * |-------------------|--------|-----------------------------------|-------|
 * | eeg-stability     | 0.35   | session.focus.stability           | steadier is higher |
 * | eeg-alpha-desync  | 0.25   | eeg.band_power.alpha.relative     | lower alpha is higher |
 * | task-rt-stability | 0.25   | session.task.rt_stability         | steadier is higher |
 * | task-lapse-rate   | 0.15   | session.task.lapse_rate           | fewer lapses is higher |
 *
 * Alpha enters as DESYNCHRONIZATION: relative alpha falling below the
 * person's own baseline is the engaged, externally-directed attention
 * direction. That is the best-replicated spectral correlate available here,
 * but it is a judgement call on consumer hardware — a 1-2 channel headband's
 * channel-mean relative alpha is not posterior alpha, and eye closure moves
 * it hard. This is a large part of why the score is registered
 * `experimental` and is never a product headline.
 *
 * ## The weight split is load-bearing
 *
 * EEG carries 0.60 and the task side 0.40. Because a composite withholds
 * below 0.5 of included weight, losing EEG entirely can never leave a
 * scoreable remainder: Focus without physiology is structurally impossible,
 * not merely discouraged. The reverse is allowed — a task that reports no
 * performance data still gives the word "focus" a referent, so the EEG side
 * scores alone at 0.60 and renormalizes.
 *
 * ## Withheld, in order
 *
 * - `no_task_context` — no task, or less than `FOCUS_MIN_ON_TASK_S` spent in
 *   one. Carries a `withheldDetail` shortfall in the short-task case.
 * - `insufficient_quality` — session MQ below `FOCUS_MIN_MQ`. That floor sits
 *   above Activation's because this score leans on spectral detail rather
 *   than on a band's gross level.
 * - `inputs_missing` — no EEG was recorded at all.
 * - `insufficient_baseline` — EEG was recorded but could not be compared to
 *   the person (immature baseline, degenerate spread, or quality gating).
 */

import type { PersonalBaseline } from "./baseline.js";
import {
	type ContributorInput,
	type HeadlineScoreV1,
	buildContributor,
	compositeValue,
} from "./contributors.js";

/**
 * Focus needs cleaner EEG than Activation does: it reads the shape of the
 * spectrum over time, not just whether a band is up.
 */
export const FOCUS_MIN_MQ = 50;

/** Below this much time inside a task, "focus on what?" has no answer. */
export const FOCUS_MIN_ON_TASK_S = 60;

export interface FocusMetricInput {
	/** Session value; null when the modality or measure is absent. */
	value: number | null;
	baseline: PersonalBaseline | null;
	/** 0..1 quality of the underlying measurement. */
	quality: number;
}

/**
 * What the app was asking the person to do. Supplied by the host app's event
 * stream; without it there is no Focus score.
 */
export interface TaskContext {
	/** Stable id of the task, e.g. "app.nback". Identity only, never scored. */
	taskId: string;
	/** Seconds of the session actually spent inside the task. */
	onTaskDurationS: number;
	/**
	 * Steadiness of response times (e.g. 1 - CV of RT), higher is steadier.
	 * Absent when the app reports no behavioural performance.
	 */
	responseTimeStability: FocusMetricInput;
	/** Fraction of trials missed or timed out; higher is worse. */
	lapseRate: FocusMetricInput;
}

export interface FocusInput {
	/** Null when nothing task-shaped happened in the session. */
	task: TaskContext | null;
	/**
	 * Within-session stability of the EEG spectral profile
	 * (`session.focus.stability`); higher is steadier.
	 */
	eegStability: FocusMetricInput;
	/**
	 * Session-mean relative alpha. Contributes INVERSELY: desynchronization
	 * below the personal baseline is the engaged direction.
	 */
	alphaRelative: FocusMetricInput;
	/** The session's Measurement Quality (0-100). */
	measurementQuality: number;
}

function contributorInputs(input: FocusInput): ContributorInput[] {
	return [
		{
			id: "eeg-stability",
			metricId: "session.focus.stability",
			value: input.eegStability.value,
			baseline: input.eegStability.baseline,
			quality: input.eegStability.quality,
			weight: 0.35,
		},
		{
			id: "eeg-alpha-desync",
			metricId: "eeg.band_power.alpha.relative",
			value: input.alphaRelative.value,
			baseline: input.alphaRelative.baseline,
			quality: input.alphaRelative.quality,
			weight: 0.25,
			negate: true,
		},
		{
			id: "task-rt-stability",
			metricId: "session.task.rt_stability",
			value: input.task?.responseTimeStability.value ?? null,
			baseline: input.task?.responseTimeStability.baseline ?? null,
			quality: input.task?.responseTimeStability.quality ?? 0,
			weight: 0.25,
		},
		{
			id: "task-lapse-rate",
			metricId: "session.task.lapse_rate",
			value: input.task?.lapseRate.value ?? null,
			baseline: input.task?.lapseRate.baseline ?? null,
			quality: input.task?.lapseRate.quality ?? 0,
			weight: 0.15,
			negate: true,
		},
	];
}

export function scoreFocus(input: FocusInput): HeadlineScoreV1 {
	const contributors = contributorInputs(input).map(buildContributor);

	const base = {
		scoreId: "elata.focus" as const,
		formulaVersion: "score_focus@1" as const,
		contributors,
		measurementQuality: input.measurementQuality,
	};

	if (input.task === null) {
		return { ...base, value: null, withheldReason: "no_task_context" };
	}
	if (input.task.onTaskDurationS < FOCUS_MIN_ON_TASK_S) {
		return {
			...base,
			value: null,
			withheldReason: "no_task_context",
			withheldDetail: [
				{
					requirement: "on_task_seconds",
					have: input.task.onTaskDurationS,
					need: FOCUS_MIN_ON_TASK_S,
				},
			],
		};
	}
	if (input.measurementQuality < FOCUS_MIN_MQ) {
		return { ...base, value: null, withheldReason: "insufficient_quality" };
	}
	if (input.eegStability.value === null && input.alphaRelative.value === null) {
		// No EEG was recorded at all — a different fact from EEG that could not
		// be compared to the person, which falls through to the weight floor.
		return { ...base, value: null, withheldReason: "inputs_missing" };
	}
	const value = compositeValue(contributors);
	if (value === null) {
		return { ...base, value: null, withheldReason: "insufficient_baseline" };
	}
	return { ...base, value };
}
