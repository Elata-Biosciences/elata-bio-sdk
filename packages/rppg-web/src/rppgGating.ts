import type { FaceMeshAlignmentSnapshot } from "./faceMeshAlignment";

export type RppgGuidanceCode =
	| "idle"
	| "no_face"
	| "increase_lighting"
	| "finding_pulse"
	| "calibrating"
	| "active_monitoring"
	| "motion_hold"
	| "face_move_closer"
	| "face_move_back"
	| "face_lower_head"
	| "face_raise_head";

export type RppgGatingState =
	| "idle"
	| "needs_face"
	| "needs_light"
	| "finding_pulse"
	| "calibrating"
	| "active"
	| "motion_hold";

export type RppgGatingInputs = {
	nowMs: number;
	metrics: {
		bpm?: number | null;
		confidence?: number;
		signal_quality?: number;
		reason_codes?: string[];
		skin_ratio_mean?: number;
		motion_mean?: number;
		clip_mean?: number;
		calibration_trained?: boolean;
		baseline_bpm?: number | null;
	};
	/**
	 * If the host app already knows whether a face is detected (e.g. via
	 * MediaPipe FaceMesh), pass it here to improve guidance accuracy.
	 */
	hasFace?: boolean;
	/**
	 * Face Mesh landmark geometry from the latest frame (e.g. {@link Frame.faceMeshAlignment}).
	 * When present and not aligned, UI layers typically prefer this over generic gating text.
	 */
	faceMeshAlignment?: FaceMeshAlignmentSnapshot | null;
};

export type RppgGatingOptions = {
	/**
	 * Motion gate threshold. Values are expected to be in [0, 1].
	 * When motion is above this threshold, we enter a "motion hold" state.
	 */
	motionGateThreshold?: number;
	/** Motion level that releases a motion hold early. */
	motionReleaseThreshold?: number;
	/** Minimum time to hold once the gate triggers. */
	motionHoldMs?: number;
	/** Minimum skin ratio to consider the ROI usable (heuristic). */
	minSkinRatio?: number;
	/** Below this, guidance will suggest more light (signal quality is [0, 1]). */
	minSignalQualityForPulse?: number;
	/** Below this, we avoid updating the stable BPM anchor. */
	minConfidenceForStable?: number;
	/** How long a stable BPM can be shown when metrics go null. */
	stableDisplayHoldMs?: number;
};

export type RppgGatingOutput = {
	state: RppgGatingState;
	guidance: { code: RppgGuidanceCode; message: string };
	/**
	 * MediaPipe-style framing hints when the face is visible but poorly framed.
	 * Does not change BPM gating; {@link RppgAppAdapter} promotes this for display when set.
	 */
	faceAlignmentGuidance: { code: RppgGuidanceCode; message: string } | null;
	/** BPM that should be shown/used by the host app after gating. */
	publishBpm: number | null;
	/** True if we are currently holding a prior BPM due to motion. */
	holding: boolean;
	/** Debug details intended for logs / UI. */
	debug: {
		reasons: string[];
		motionHoldUntilMs: number | null;
		lastStableBpm: number | null;
		lastStableAtMs: number | null;
	};
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function pickGuidance(state: RppgGatingState): RppgGatingOutput["guidance"] {
	switch (state) {
		case "needs_face":
			return {
				code: "no_face",
				message: "Return to frame — face not visible",
			};
		case "needs_light":
			return { code: "increase_lighting", message: "Increase Lighting" };
		case "finding_pulse":
			return {
				code: "finding_pulse",
				message: "Hold Still - Finding Pulse",
			};
		case "calibrating":
			return { code: "calibrating", message: "Calibrating..." };
		case "motion_hold":
			return { code: "motion_hold", message: "Hold Still - stabilizing" };
		case "active":
			return { code: "active_monitoring", message: "Active Monitoring" };
		default:
			return { code: "idle", message: "Idle" };
	}
}

/**
 * Framework-agnostic progressive gating for rPPG heart rate.
 *
 * The SDK already exposes raw metrics (`RppgProcessor.getMetrics()`), but apps
 * often need a stable, user-friendly "gated" BPM and actionable guidance.
 * This controller provides:
 * - Motion-hold gating (freeze BPM during high motion)
 * - Basic "face / light / pulse" guidance
 * - A stable BPM anchor that survives brief dropouts
 */
export class RppgGatingController {
	private readonly opts: Required<RppgGatingOptions>;
	private motionHoldUntilMs: number | null = null;
	private lastStableBpm: number | null = null;
	private lastStableAtMs: number | null = null;

	constructor(options: RppgGatingOptions = {}) {
		this.opts = {
			motionGateThreshold: options.motionGateThreshold ?? 0.15,
			motionReleaseThreshold: options.motionReleaseThreshold ?? 0.05,
			motionHoldMs: options.motionHoldMs ?? 2000,
			minSkinRatio: options.minSkinRatio ?? 0.12,
			minSignalQualityForPulse: options.minSignalQualityForPulse ?? 0.25,
			minConfidenceForStable: options.minConfidenceForStable ?? 0.45,
			stableDisplayHoldMs: options.stableDisplayHoldMs ?? 2500,
		};
	}

	reset() {
		this.motionHoldUntilMs = null;
		this.lastStableBpm = null;
		this.lastStableAtMs = null;
	}

	update(input: RppgGatingInputs): RppgGatingOutput {
		const { metrics, nowMs } = input;
		const reasons: string[] = [];

		const bpm = metrics.bpm ?? null;
		const confidence = clamp01(Number(metrics.confidence ?? 0));
		const signalQ = clamp01(Number(metrics.signal_quality ?? 0));
		const skin = clamp01(Number(metrics.skin_ratio_mean ?? 0));
		const motion = clamp01(Number(metrics.motion_mean ?? 0));

		const hasFace =
			input.hasFace ??
			(skin >= this.opts.minSkinRatio &&
				(metrics.reason_codes == null ||
					!metrics.reason_codes.includes("no_face")));

		const calibrated =
			metrics.baseline_bpm != null ||
			metrics.calibration_trained === true ||
			false;

		// --- Motion hold gate (mirrors the TradeLock pattern) ---
		if (this.motionHoldUntilMs != null && nowMs > this.motionHoldUntilMs) {
			this.motionHoldUntilMs = null;
		}

		if (this.motionHoldUntilMs == null) {
			if (motion > this.opts.motionGateThreshold && calibrated && hasFace) {
				this.motionHoldUntilMs = nowMs + this.opts.motionHoldMs;
				reasons.push("motion_gate_triggered");
			}
		} else if (motion < this.opts.motionReleaseThreshold * 1.2) {
			this.motionHoldUntilMs = null;
			reasons.push("motion_gate_released_early");
		}

		const holding = this.motionHoldUntilMs != null;

		// Update stable BPM anchor when conditions are good and not holding.
		const stableEligible =
			!holding &&
			bpm != null &&
			Number.isFinite(bpm) &&
			bpm > 0 &&
			confidence >= this.opts.minConfidenceForStable &&
			signalQ >= this.opts.minSignalQualityForPulse &&
			hasFace;
		if (stableEligible) {
			this.lastStableBpm = bpm;
			this.lastStableAtMs = nowMs;
		}

		const stableFresh =
			this.lastStableBpm != null &&
			this.lastStableAtMs != null &&
			nowMs - this.lastStableAtMs <= this.opts.stableDisplayHoldMs;

		let publishBpm: number | null = bpm;
		if (holding) {
			if (stableFresh) {
				publishBpm = this.lastStableBpm;
			} else {
				publishBpm = null;
				reasons.push("motion_hold_no_stable_bpm");
			}
		} else if (bpm == null && stableFresh) {
			// Brief dropout — keep the UI stable.
			publishBpm = this.lastStableBpm;
			reasons.push("dropout_hold");
		}

		// --- Progressive guidance ---
		let state: RppgGatingState = "idle";
		if (!hasFace) {
			state = "needs_face";
			reasons.push("no_face");
		} else if (signalQ < this.opts.minSignalQualityForPulse) {
			state = "needs_light";
			reasons.push("low_signal_quality");
		} else if (holding) {
			state = "motion_hold";
		} else if (!calibrated) {
			// Calibration in SDK is implicit (baseline/training). We treat this as
			// "finding pulse" until there's enough evidence to be stable.
			state = bpm != null ? "calibrating" : "finding_pulse";
		} else if (publishBpm == null) {
			state = "finding_pulse";
			reasons.push("no_bpm_yet");
		} else {
			state = "active";
		}

		const guidance = pickGuidance(state);

		const faceAlignmentGuidance =
			hasFace &&
			input.faceMeshAlignment &&
			!input.faceMeshAlignment.aligned &&
			input.faceMeshAlignment.guidance
				? {
						code: input.faceMeshAlignment.guidance.code,
						message: input.faceMeshAlignment.guidance.message,
					}
				: null;

		return {
			state,
			guidance,
			faceAlignmentGuidance,
			publishBpm,
			holding,
			debug: {
				reasons: reasons.concat(metrics.reason_codes ?? []),
				motionHoldUntilMs: this.motionHoldUntilMs,
				lastStableBpm: this.lastStableBpm,
				lastStableAtMs: this.lastStableAtMs,
			},
		};
	}
}

