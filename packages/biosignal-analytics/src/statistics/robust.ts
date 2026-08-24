/**
 * robust_stats@1 + robust_z@1 — median/MAD statistics and the clamped robust
 * z-score used by every baseline comparison. Mirrors the Python oracle.
 */

/** Consistency constant making scaled MAD comparable to a Gaussian sigma. */
export const MAD_SCALE = 1.4826;

/** Robust z-scores are clamped to this magnitude. */
export const ROBUST_Z_CLAMP = 3;

export interface RobustStats {
	median: number | null;
	mad: number | null;
	/** `1.4826 * mad`. */
	madScaled: number | null;
}

export function median(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
}

export function mad(values: readonly number[]): number | null {
	const center = median(values);
	if (center === null) return null;
	return median(values.map((value) => Math.abs(value - center)));
}

export function robustStats(values: readonly number[]): RobustStats {
	const center = median(values);
	if (center === null) return { median: null, mad: null, madScaled: null };
	const spread = median(values.map((value) => Math.abs(value - center)));
	if (spread === null) return { median: center, mad: null, madScaled: null };
	return { median: center, mad: spread, madScaled: MAD_SCALE * spread };
}

/**
 * `(value - median) / (1.4826 * mad)` clamped to ±3; 0 when the scaled MAD
 * is not positive (degenerate spread).
 */
export function robustZ(
	value: number,
	medianValue: number,
	madValue: number,
): number {
	const scaled = MAD_SCALE * madValue;
	if (!(scaled > 0)) return 0;
	const z = (value - medianValue) / scaled;
	return Math.min(ROBUST_Z_CLAMP, Math.max(-ROBUST_Z_CLAMP, z));
}
