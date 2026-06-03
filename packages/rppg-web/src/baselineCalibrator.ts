/**
 * Monotonic baseline calibration.
 *
 * Captures a stable resting baseline (bpm + HRV) from a stream of per-frame
 * readings without the progress ever retreating — the failure mode of a
 * settle-style ring that *backs off* when the signal gets jittery, which reads
 * as the percentage going backwards and is disturbing to watch.
 *
 *   - progress = acceptedSamples / neededSamples, so it only ever climbs;
 *   - a jittery / out-of-range frame is *rejected* (doesn't add), never
 *     subtracted — progress pauses instead of retreating;
 *   - early-exit once the recent samples converge (low stdDev) → jump to 100%;
 *   - the final baseline is a trimmed median (drop the tails).
 *
 * Pure and frame-driven: push one reading per poll. The caller owns the gating
 * (only push when a face is in frame with a good signal — see the gating /
 * framing helpers) and any UI smoothing; this class makes no assumptions about
 * poll cadence, the DOM, or a rendering layer.
 */

export interface BaselineCalibratorConfig {
	/** Accepted samples for a full (non-early) calibration. */
	neededSamples: number;
	/** Reject a reading this many bpm off the running average (anti-spike). */
	outlierBpm: number;
	/** Minimum accepted samples before the convergence early-exit can fire. */
	minForStability: number;
	/** Window (most-recent N) used for the convergence stdDev check. */
	stabilityWindow: number;
	/** Below this bpm stdDev over the window, we call it converged → 100%. */
	stabilityStdDev: number;
	/** Fraction of each tail dropped before the median (per side). */
	trimFraction: number;
}

// Tuned for a ~300 ms poll: ~13 s hard cap, early-exit ~5–6 s once the
// (already smoothed) bpm settles. Override per consumer/cadence as needed.
export const DEFAULT_BASELINE_CALIBRATOR_CONFIG: BaselineCalibratorConfig = {
	neededSamples: 42,
	outlierBpm: 15,
	minForStability: 18,
	stabilityWindow: 12,
	stabilityStdDev: 2.5,
	trimFraction: 0.1,
};

function median(xs: number[]): number {
	const s = [...xs].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Trimmed median: drop the lowest/highest `frac` before taking the median. */
function trimmedMedian(xs: number[], frac: number): number {
	if (xs.length < 5) return median(xs);
	const s = [...xs].sort((a, b) => a - b);
	const trim = Math.floor(s.length * frac);
	return median(s.slice(trim, s.length - trim));
}

export interface BaselineCalibrationResult {
	bpm: number | null;
	hrv: number | null;
}

export class BaselineCalibrator {
	private readonly cfg: BaselineCalibratorConfig;
	private bpm: number[] = [];
	private hrv: number[] = [];
	private rejectStreak = 0;
	private rejected = 0;
	private qualitySum = 0;

	constructor(
		cfg: BaselineCalibratorConfig = DEFAULT_BASELINE_CALIBRATOR_CONFIG,
	) {
		this.cfg = cfg;
	}

	/**
	 * Offer one reading (with its 0..1 signal quality). Outliers are rejected —
	 * they don't advance progress and they count against the confidence score.
	 */
	push(bpm: number, hrv: number | null, quality = 1): void {
		if (!Number.isFinite(bpm)) return;
		if (this.bpm.length > 5) {
			const avg = this.bpm.reduce((a, b) => a + b, 0) / this.bpm.length;
			if (Math.abs(bpm - avg) > this.cfg.outlierBpm) {
				this.rejectStreak += 1;
				this.rejected += 1;
				// A bad early average can wedge us — if we keep rejecting before
				// we've really started, drop what we have and re-seed.
				if (
					this.bpm.length < this.cfg.minForStability &&
					this.rejectStreak > 10
				) {
					this.bpm = [];
					this.hrv = [];
					this.rejectStreak = 0;
				}
				return;
			}
		}
		this.rejectStreak = 0;
		this.bpm.push(bpm);
		this.qualitySum += Math.max(0, Math.min(1, quality));
		if (hrv != null && Number.isFinite(hrv)) this.hrv.push(hrv);
	}

	get sampleCount(): number {
		return this.bpm.length;
	}

	/** True once the recent window has converged to a stable bpm. */
	private get converged(): boolean {
		if (this.bpm.length < this.cfg.minForStability) return false;
		const recent = this.bpm.slice(-this.cfg.stabilityWindow);
		const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
		const variance =
			recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length;
		return Math.sqrt(variance) < this.cfg.stabilityStdDev;
	}

	/** 0..1, monotonic. Reaches 1 at the needed count or on convergence. */
	get progress(): number {
		if (this.converged) return 1;
		return Math.min(1, this.bpm.length / this.cfg.neededSamples);
	}

	get isComplete(): boolean {
		return this.bpm.length >= this.cfg.neededSamples || this.converged;
	}

	/**
	 * 0..1 trust in this calibration, for gating downstream scores/insights.
	 * Blends: tightness of the accepted bpm spread, sample sufficiency, how few
	 * frames were rejected as outliers, and mean signal quality. Low trust =
	 * don't show a hard score or feed it into the baseline.
	 */
	get confidence(): number {
		const n = this.bpm.length;
		if (n === 0) return 0;
		const mean = this.bpm.reduce((a, b) => a + b, 0) / n;
		const sd = Math.sqrt(this.bpm.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
		const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
		const spread = clamp01(1 - sd / 12); // tight spread → 1, ≥12 bpm → 0
		const sufficiency = clamp01(n / this.cfg.minForStability);
		const total = n + this.rejected;
		const rejectScore =
			total > 0 ? clamp01(1 - (this.rejected / total) * 1.5) : 1;
		const quality = clamp01(this.qualitySum / n);
		// Stability earns the score; signal quality gates it multiplicatively
		// (a rock-steady reading off a near-zero signal is still untrustworthy).
		const stability = 0.4 * spread + 0.25 * sufficiency + 0.35 * rejectScore;
		return clamp01(stability * (0.4 + 0.6 * quality));
	}

	/** Trimmed-median baseline over the accepted samples. */
	result(): BaselineCalibrationResult {
		return {
			bpm: this.bpm.length
				? Math.round(trimmedMedian(this.bpm, this.cfg.trimFraction))
				: null,
			hrv: this.hrv.length
				? Math.round(trimmedMedian(this.hrv, this.cfg.trimFraction))
				: null,
		};
	}

	reset(): void {
		this.bpm = [];
		this.hrv = [];
		this.rejectStreak = 0;
		this.rejected = 0;
		this.qualitySum = 0;
	}
}
