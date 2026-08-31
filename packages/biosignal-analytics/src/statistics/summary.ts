/**
 * summary_stats@1 — session-summary statistics over a numeric series.
 * Definitions mirror the Python oracle (fixtures/stats/robust_summary.json):
 * numpy-linear percentiles, sample std/variance (ddof=1, null under 2
 * values), cv = std/|mean| (null when undefined).
 */

export interface SummaryStats {
	count: number;
	mean: number | null;
	median: number | null;
	min: number | null;
	max: number | null;
	std: number | null;
	variance: number | null;
	p5: number | null;
	p25: number | null;
	p50: number | null;
	p75: number | null;
	p95: number | null;
	iqr: number | null;
	cv: number | null;
}

/** numpy-default ("linear") percentile over a pre-sorted ascending array. */
export function percentileSorted(sorted: readonly number[], q: number): number {
	if (sorted.length === 0) return Number.NaN;
	if (sorted.length === 1) return sorted[0];
	const rank = (q / 100) * (sorted.length - 1);
	const lower = Math.floor(rank);
	const upper = Math.ceil(rank);
	if (lower === upper) return sorted[lower];
	const weight = rank - lower;
	return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function summaryStats(values: readonly number[]): SummaryStats {
	const count = values.length;
	if (count === 0) {
		return {
			count: 0,
			mean: null,
			median: null,
			min: null,
			max: null,
			std: null,
			variance: null,
			p5: null,
			p25: null,
			p50: null,
			p75: null,
			p95: null,
			iqr: null,
			cv: null,
		};
	}
	let sum = 0;
	for (const value of values) sum += value;
	const mean = sum / count;

	let variance: number | null = null;
	let std: number | null = null;
	if (count >= 2) {
		let acc = 0;
		for (const value of values) {
			const delta = value - mean;
			acc += delta * delta;
		}
		variance = acc / (count - 1);
		std = Math.sqrt(variance);
	}

	const sorted = [...values].sort((a, b) => a - b);
	const p5 = percentileSorted(sorted, 5);
	const p25 = percentileSorted(sorted, 25);
	const p50 = percentileSorted(sorted, 50);
	const p75 = percentileSorted(sorted, 75);
	const p95 = percentileSorted(sorted, 95);
	const cv = std !== null && mean !== 0 ? std / Math.abs(mean) : null;

	return {
		count,
		mean,
		median: p50,
		min: sorted[0],
		max: sorted[count - 1],
		std,
		variance,
		p5,
		p25,
		p50,
		p75,
		p95,
		iqr: p75 - p25,
		cv,
	};
}
