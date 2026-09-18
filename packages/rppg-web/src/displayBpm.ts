import { shouldAllowDisplayJumpReset } from "./displayGuard";

/**
 * Always-live BPM readout smoothing.
 *
 * The trusted/gated BPM that feeds baseline and state should change slowly and
 * only when confidence is high — but a UI readout that goes blank or freezes
 * whenever the gate suppresses a frame looks broken. {@link DisplayBpmTracker}
 * maintains a number that keeps moving every cycle:
 *
 *  - a short **median window** rejects single-frame harmonic flips,
 *  - a light **EMA** keeps it visually smooth,
 *  - **jump protection** ignores a >30 bpm jump from the smoothed value unless a
 *    sustained, self-consistent distant rate is seen for several cycles
 *    (persistent-disagreement catch-up) or a high-confidence tracker / reference
 *    allows it — this frees the display from a wrong initial seed without
 *    chasing transient artifacts, and
 *  - {@link hold} keeps the readout live (preferring the tracker estimate, else
 *    the last shown value) on cycles the caller suppresses entirely.
 *
 * Callers decide whether to render the value dimmed (e.g. when the trusted gate
 * is failing); the tracker only supplies the live number.
 */

export interface DisplayBpmOptions {
	/** Below/above this range a candidate is ignored entirely (default 40/180). */
	minBpm?: number;
	maxBpm?: number;
	/** Median window length in cycles (default 24 ≈ 4 s at ~6 Hz analysis). */
	medianWindow?: number;
	/** EMA weight on the new median (default 0.12 ≈ 1.5 s time constant). */
	emaAlpha?: number;
	/** A jump beyond this many bpm from the smoothed value triggers protection (default 30). */
	jumpThresholdBpm?: number;
	/** Consecutive self-consistent distant cycles required to adopt a jump (default 8). */
	catchupFrames?: number;
	/** Tolerance (bpm) for a distant rate to count as "the same" across cycles (default 12). */
	catchupToleranceBpm?: number;
	/** Upper bound for accepting a tracker estimate during {@link hold} (default 200). */
	holdMaxBpm?: number;
}

export type DisplayBpmStatus =
	| "tracking"
	| "jump_adopted"
	| "jump_rejected"
	| "out_of_range";

export interface DisplayBpmUpdateContext {
	trackerBpm?: number | null;
	trackerConfidence?: number;
	hasReferenceLock?: boolean;
	/** Running count of consecutive large beat-to-beat jumps (panic/sprint). */
	bpmJumpCounter?: number;
}

export interface DisplayBpmUpdate {
	/** Live value to render (unchanged from last cycle when a jump is rejected). */
	displayBpm: number | null;
	/** The smoothed value (same as displayBpm unless out of range / rejected). */
	smoothedBpm: number | null;
	/** The rounded raw candidate that was fed in. */
	rawBpm: number | null;
	status: DisplayBpmStatus;
}

export class DisplayBpmTracker {
	private readonly minBpm: number;
	private readonly maxBpm: number;
	private readonly medianWindow: number;
	private readonly emaAlpha: number;
	private readonly jumpThresholdBpm: number;
	private readonly catchupFrames: number;
	private readonly catchupToleranceBpm: number;
	private readonly holdMaxBpm: number;

	private history: number[] = [];
	private smoothedVal: number | null = null;
	private catchupRef: number | null = null;
	private catchupCount = 0;
	private lastDisplay: number | null = null;

	constructor(options: DisplayBpmOptions = {}) {
		this.minBpm = options.minBpm ?? 40;
		this.maxBpm = options.maxBpm ?? 180;
		this.medianWindow = Math.max(1, options.medianWindow ?? 24);
		this.emaAlpha = options.emaAlpha ?? 0.12;
		this.jumpThresholdBpm = options.jumpThresholdBpm ?? 30;
		this.catchupFrames = Math.max(1, options.catchupFrames ?? 8);
		this.catchupToleranceBpm = options.catchupToleranceBpm ?? 12;
		this.holdMaxBpm = options.holdMaxBpm ?? 200;
	}

	get displayBpm(): number | null {
		return this.lastDisplay;
	}

	get smoothedBpm(): number | null {
		return this.smoothedVal == null ? null : Math.round(this.smoothedVal);
	}

	reset() {
		this.history = [];
		this.smoothedVal = null;
		this.catchupRef = null;
		this.catchupCount = 0;
		this.lastDisplay = null;
	}

	/**
	 * Feed the resolved camera BPM for this cycle and get the value to display.
	 * A rejected jump leaves the display unchanged; an adopted jump or a normal
	 * cycle advances the median + EMA.
	 */
	update(candidateBpm: number, ctx: DisplayBpmUpdateContext = {}): DisplayBpmUpdate {
		if (
			!Number.isFinite(candidateBpm) ||
			candidateBpm <= this.minBpm ||
			candidateBpm >= this.maxBpm
		) {
			return {
				displayBpm: this.lastDisplay,
				smoothedBpm: this.smoothedBpm,
				rawBpm: null,
				status: "out_of_range",
			};
		}

		let status: DisplayBpmStatus = "tracking";

		if (
			this.smoothedVal !== null &&
			Math.abs(candidateBpm - this.smoothedVal) > this.jumpThresholdBpm
		) {
			// Track a *steady* distant rate: consecutive cycles whose value is
			// self-consistent. A sustained, self-consistent rate is a real change,
			// not a transient artifact, so adopt it even without a reference lock.
			if (
				this.catchupRef != null &&
				Math.abs(candidateBpm - this.catchupRef) <= this.catchupToleranceBpm
			) {
				this.catchupCount++;
			} else {
				this.catchupCount = 1;
			}
			this.catchupRef = candidateBpm;
			const persistentCatchup = this.catchupCount >= this.catchupFrames;
			const allow =
				persistentCatchup ||
				shouldAllowDisplayJumpReset({
					hasReferenceLock: ctx.hasReferenceLock,
					bpmJumpCounter: ctx.bpmJumpCounter,
					candidateBpm,
					trackerBpm: ctx.trackerBpm,
					trackerConfidence: ctx.trackerConfidence,
				});
			if (allow) {
				this.smoothedVal = candidateBpm; // reset smoothing to catch up
				this.catchupCount = 0;
				status = "jump_adopted";
			} else {
				return {
					displayBpm: this.lastDisplay,
					smoothedBpm: this.smoothedBpm,
					rawBpm: Math.round(candidateBpm),
					status: "jump_rejected",
				};
			}
		}

		// Once the display agrees with the live rate again, clear catch-up tracking.
		if (
			this.smoothedVal !== null &&
			Math.abs(candidateBpm - this.smoothedVal) <= this.jumpThresholdBpm
		) {
			this.catchupCount = 0;
			this.catchupRef = null;
		}

		this.history.push(candidateBpm);
		if (this.history.length > this.medianWindow) this.history.shift();
		const sorted = [...this.history].sort((a, b) => a - b);
		const median = sorted[Math.floor(sorted.length / 2)];

		if (this.smoothedVal === null) {
			this.smoothedVal = median;
		} else {
			this.smoothedVal =
				this.smoothedVal * (1 - this.emaAlpha) + median * this.emaAlpha;
		}

		const finalSmoothed = Math.round(this.smoothedVal);
		this.lastDisplay = finalSmoothed;
		return {
			displayBpm: finalSmoothed,
			smoothedBpm: finalSmoothed,
			rawBpm: Math.round(candidateBpm),
			status,
		};
	}

	/**
	 * Keep the readout live on a cycle the caller suppressed (no trusted BPM):
	 * prefer the tracker estimate when plausible, otherwise hold the last shown
	 * value. Does not touch the smoothed state.
	 */
	hold(ctx: { trackerBpm?: number | null } = {}): number | null {
		const t = ctx.trackerBpm;
		if (t != null && Number.isFinite(t) && t > this.minBpm && t < this.holdMaxBpm) {
			this.lastDisplay = Math.round(t);
		}
		return this.lastDisplay;
	}
}
