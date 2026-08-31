/**
 * hrv_time_domain@1 — meanNN / SDNN / RMSSD over the cleaned NN sequence.
 * Parity-tested against fixtures/pulse/hrv_time_domain.json (atol 0.5 ms).
 *
 * sdnn uses the sample standard deviation (ddof = 1) and is null under 2
 * cleaned intervals; rmssd = sqrt(mean of squared successive differences)
 * over the cleaned sequence as-is (same convention as rppg-web's
 * `computeRmssdMs`), null under 2 cleaned intervals.
 */

import { cleanNnIntervalsMs } from "./ibi.js";

export interface HrvTimeDomain {
	/** Cleaned NN intervals actually used (order preserved). */
	cleanedNnMs: readonly number[];
	ibiCount: number;
	/** cleaned / original interval count (0 for empty input). */
	usableIbiFraction: number;
	meanNnMs: number | null;
	sdnnMs: number | null;
	rmssdMs: number | null;
}

export function hrvTimeDomain(ibisMs: readonly number[]): HrvTimeDomain {
	const cleaned = cleanNnIntervalsMs(ibisMs);
	const count = cleaned.length;
	const usableIbiFraction = ibisMs.length > 0 ? count / ibisMs.length : 0;

	let meanNnMs: number | null = null;
	let sdnnMs: number | null = null;
	let rmssdMs: number | null = null;

	if (count >= 1) {
		let sum = 0;
		for (const value of cleaned) sum += value;
		meanNnMs = sum / count;
	}
	if (count >= 2 && meanNnMs !== null) {
		let acc = 0;
		for (const value of cleaned) {
			const delta = value - meanNnMs;
			acc += delta * delta;
		}
		sdnnMs = Math.sqrt(acc / (count - 1));

		let diffAcc = 0;
		for (let i = 1; i < count; i++) {
			const diff = cleaned[i] - cleaned[i - 1];
			diffAcc += diff * diff;
		}
		rmssdMs = Math.sqrt(diffAcc / (count - 1));
	}

	return {
		cleanedNnMs: cleaned,
		ibiCount: count,
		usableIbiFraction,
		meanNnMs,
		sdnnMs,
		rmssdMs,
	};
}
