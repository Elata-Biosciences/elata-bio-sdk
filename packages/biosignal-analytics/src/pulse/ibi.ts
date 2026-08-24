/**
 * nn_clean@1 — NN-interval cleaning over an already-extracted IBI series (ms).
 *
 * Implemented in-package (mirroring the Python oracle) because rppg-web's
 * `cleanNnIntervalsMs` operates on `PulsePeak[]`, not interval arrays; peak-
 * based paths should keep using the optional `@elata-biosciences/rppg-web`
 * peer (`detectPeaks`, `cleanNnIntervalsMs`, `computeRmssdMs`).
 *
 * Algorithm: keep intervals within the physiologic range [300, 2000] ms, then
 * drop intervals deviating from the median of the in-range set by more than
 * 30% of that median. Order is preserved; successive-difference metrics are
 * computed over the cleaned sequence as-is.
 */

export const NN_MIN_MS = 300;
export const NN_MAX_MS = 2000;
export const NN_MEDIAN_TOLERANCE = 0.3;

function medianOf(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
}

export function cleanNnIntervalsMs(ibisMs: readonly number[]): number[] {
	const inRange = ibisMs.filter(
		(ibi) => Number.isFinite(ibi) && ibi >= NN_MIN_MS && ibi <= NN_MAX_MS,
	);
	if (inRange.length === 0) return [];
	const center = medianOf(inRange);
	const tolerance = NN_MEDIAN_TOLERANCE * center;
	return inRange.filter((ibi) => Math.abs(ibi - center) <= tolerance);
}
