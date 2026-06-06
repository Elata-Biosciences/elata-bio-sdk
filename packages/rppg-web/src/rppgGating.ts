import {
	DEFAULT_FRAMING_THRESHOLDS,
	faceFramingFromBox,
	type FaceBox,
	type FramingThresholds,
} from "./faceFraming";

export type RppgGuidanceCode =
	| "idle"
	| "no_face"
	// Positioning guidance — emitted when a face is present but mis-framed
	// (which is itself a common cause of low signal quality).
	| "move_closer"
	| "move_back"
	| "center_face"
	| "face_too_high"
	| "face_too_low"
	| "increase_lighting"
	| "finding_pulse"
	| "calibrating"
	| "active_monitoring"
	| "motion_hold";

export type RppgGatingState =
	| "idle"
	| "needs_face"
	| "needs_position"
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
		/** 0..1 capture-environment confidence (motion + lighting), if available. */
		capture_confidence?: number;
		/** Which dimension is limiting capture confidence, if available. */
		capture_limiting?: "motion" | "lighting" | null;
	};
	/**
	 * If the host app already knows whether a face is detected (e.g. via
	 * MediaPipe FaceMesh), pass it here to improve guidance accuracy.
	 */
	hasFace?: boolean;
	/**
	 * Normalized (0..1) head box for the tracked face, or `null` when no face
	 * is in frame. When provided, it drives both face presence and positioning
	 * guidance (move closer / center / …). Omit (leave `undefined`) to keep the
	 * legacy skin-ratio face heuristic and no positioning hints.
	 */
	faceBox?: FaceBox | null;
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
	/** Distance/centering tolerances for positioning guidance (head-box terms). */
	framingThresholds?: FramingThresholds;
	/**
	 * Below this `capture_confidence`, while still finding the pulse / calibrating,
	 * guidance is overridden with the limiting motion/lighting hint so the user
	 * fixes the environment instead of waiting on a stalled bar.
	 */
	minCaptureConfidence?: number;
};

export type RppgGatingOutput = {
	state: RppgGatingState;
	guidance: { code: RppgGuidanceCode; message: string };
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
			return { code: "no_face", message: "Position your face in frame" };
		case "needs_position":
			// Overridden with the specific framing message by the caller; this is
			// only the fallback if framing detail is somehow unavailable.
			return { code: "center_face", message: "Center your face in the frame" };
		case "needs_light":
			return { code: "increase_lighting", message: "Increase lighting" };
		case "finding_pulse":
			return { code: "finding_pulse", message: "Hold still — finding pulse" };
		case "calibrating":
			return { code: "calibrating", message: "Calibrating…" };
		case "motion_hold":
			return { code: "motion_hold", message: "Hold still — stabilizing" };
		case "active":
			return { code: "active_monitoring", message: "Active monitoring" };
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
			framingThresholds:
				options.framingThresholds ?? DEFAULT_FRAMING_THRESHOLDS,
			minCaptureConfidence: options.minCaptureConfidence ?? 0.4,
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

		// When a face box is supplied, framing is authoritative for both face
		// presence and positioning; otherwise fall back to the skin heuristic.
		const framing =
			input.faceBox === undefined
				? null
				: faceFramingFromBox(input.faceBox, this.opts.framingThresholds);

		const hasFace =
			input.hasFace ??
			(framing
				? framing.code !== "no_face"
				: skin >= this.opts.minSkinRatio &&
					(metrics.reason_codes == null ||
						!metrics.reason_codes.includes("no_face")));

		// A present-but-mis-framed face (move closer / center / …) — the most
		// actionable thing to fix, and a frequent root cause of low signal.
		const misframed =
			framing != null && framing.code !== "ok" && framing.code !== "no_face";

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
		} else if (misframed) {
			// Fix positioning before light: re-sizing/centering the face is what
			// actually recovers the signal here.
			state = "needs_position";
			reasons.push(`framing_${framing!.code}`);
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

		// Positioning carries five distinct messages, so surface the framing
		// detail directly rather than the single-message fallback.
		let guidance =
			state === "needs_position" && framing
				? {
						// `misframed` guarantees a positioning code here (never "ok").
						code: framing.code as RppgGuidanceCode,
						message: framing.message,
					}
				: pickGuidance(state);

		// While still acquiring (finding pulse / calibrating), a stalled bar is
		// only frustrating if the user doesn't know why. When capture confidence
		// is low, replace the generic message with the limiting motion/lighting
		// hint so they fix the environment and the bar starts moving.
		const captureConfidence = metrics.capture_confidence;
		if (
			(state === "finding_pulse" || state === "calibrating") &&
			captureConfidence != null &&
			captureConfidence < this.opts.minCaptureConfidence
		) {
			reasons.push(`low_capture_confidence_${metrics.capture_limiting ?? "unknown"}`);
			if (metrics.capture_limiting === "lighting") {
				guidance = {
					code: "increase_lighting",
					message: "Increase lighting to calibrate",
				};
			} else {
				guidance = {
					code: "motion_hold",
					message: "Hold still to calibrate",
				};
			}
		}

		return {
			state,
			guidance,
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

