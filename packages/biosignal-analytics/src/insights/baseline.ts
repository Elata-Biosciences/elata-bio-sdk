/**
 * Personal baselines and the robust z-score used by every headline score.
 * `robust_z@1`: `(value - median) / (1.4826 * MAD)` clamped to ±3; a
 * degenerate MAD yields z = 0 with an explicit flag (never a silent signal).
 */

import { MAD_SCALE, ROBUST_Z_CLAMP } from "../statistics/robust.js";

export interface PersonalBaseline {
	metricId: string;
	contextBucket: string;
	median: number;
	mad: number;
	sessionCount: number;
	updatedAtMs: number;
}

export interface BaselineProvider {
	get(
		metricId: string,
		contextBucket: string,
	): Promise<PersonalBaseline | null>;
}

export interface RobustZResult {
	z: number;
	/** True when the baseline MAD was not positive (z forced to 0). */
	degenerate: boolean;
}

export function robustZFromBaseline(
	value: number,
	baseline: PersonalBaseline,
): RobustZResult {
	const scaled = MAD_SCALE * baseline.mad;
	if (!(scaled > 0)) {
		return { z: 0, degenerate: true };
	}
	const z = (value - baseline.median) / scaled;
	return {
		z: Math.min(ROBUST_Z_CLAMP, Math.max(-ROBUST_Z_CLAMP, z)),
		degenerate: false,
	};
}

/** Minimum sessions before a baseline participates in scoring. */
export const BASELINE_MIN_SESSIONS = 5;

export function isBaselineUsable(
	baseline: PersonalBaseline | null,
): baseline is PersonalBaseline {
	return baseline !== null && baseline.sessionCount >= BASELINE_MIN_SESSIONS;
}
