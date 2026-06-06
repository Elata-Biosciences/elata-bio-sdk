import { type FaceBox, faceBoxFromLandmarks } from "./faceFraming";

/**
 * Capture-confidence score for rPPG.
 *
 * rPPG is fragile: motion artifacts and bad lighting silently wreck the signal,
 * and the classic failure mode is a calibration bar that freezes with no
 * explanation (the user stares at a number that won't move). This module turns
 * that fragility into honest UX by emitting a 0..1 confidence in the *capture
 * environment* — separate from the pulse-domain `confidence`/`signal_quality` —
 * plus the limiting factor ("motion" vs "lighting") so the host can say exactly
 * what to fix and gate calibration on it.
 *
 * Provenance — the motion half ports the open features from Arevalillo-Herráez
 * et al., "Motion-Based Confidence Score to Support the Practical Application of
 * rPPG Methods in Health Monitoring", J. Med. Syst. (2026) 50:82:
 *   - TI  — Temporal Perceptual Information (ITU-T Rec. P.910): the std of the
 *           frame-to-frame luminance difference, taken as the window max (eq. 1).
 *   - FMX/FMY — mean per-landmark absolute x/y displacement (eqs. 2–3).
 *   - FSM — Face Size Motion: mean relative change in ROI pixel count (eq. 4),
 *           i.e. the z-axis / distance term.
 * The four features are combined via a noisy-OR whose per-feature reliabilities
 * are the paper's *published* Pearson correlations (Table 4) — a transparent,
 * citable rule, NOT a trained model. The paper's headline classifier (bagged
 * trees) is deliberately not reproduced here; that trained IP stays out of the
 * SDK.
 *
 * The paper is motion-only and names lighting as future work; we add a
 * lighting term (clipping / brightness / skin exposure) as that extension,
 * clearly separated so `motion` and `lighting` are reported independently and
 * the overall `score` is governed by the worse (limiting) of the two.
 *
 * Pure and frame-driven (plain numbers, no MediaPipe/DOM import): push one
 * sample per processed frame; the caller owns frame decoding and any UI.
 */

/** One processed frame's worth of capture cues. Every field is optional — the
 *  scorer degrades to whatever the host can supply (landmarks → face box →
 *  coarse motion scalar; explicit luminance → coarse motion scalar). */
export interface CaptureFrameSample {
	/** Normalized (0..1) face landmarks — the richest input for FMX/FMY. */
	landmarks?: { x: number; y: number }[] | null;
	/** Normalized head/face box; fallback for FMX/FMY (center) and FSM (area). */
	faceBox?: FaceBox | null;
	/** Paper's N_i — pixel count of the skin ROI, the most faithful FSM input. */
	roiPixelCount?: number | null;
	/** Per-frame TI term: std (0..1) of the luminance frame-difference. */
	luminanceDiffStd?: number | null;
	/** Coarse 0..1 motion scalar (e.g. `motion_mean`); fallback for TI. */
	motion?: number | null;
	/** Mean pixel clipping fraction (0..1); overexposure washes out the pulse. */
	clipRatio?: number | null;
	/** Skin-pixel fraction of the ROI (0..1); low ⇒ poor lighting/framing. */
	skinRatio?: number | null;
	/** Mean ROI luminance (0..1); too dark or too bright both hurt. */
	meanLuma?: number | null;
}

export interface CaptureConfidenceConfig {
	/** Rolling window length in frames (≈1.5 s at 30 fps). */
	windowFrames: number;
	/** Frames required before `ready` flips true. */
	minSamples: number;
	/** Above this overall score there is no actionable limiting factor. */
	okThreshold: number;
	/** Feature value that maps to fully "bad" (badness = 1). Tune on-device. */
	tiBadAt: number;
	faceMotionBadAt: number;
	faceSizeMotionBadAt: number;
	clipBadAt: number;
	/** Usable luminance band; outside it darkness/brightness counts against. */
	lumaLow: number;
	lumaHigh: number;
	/** Skin fraction at/below which lighting/framing is fully penalized. */
	skinMin: number;
}

export const DEFAULT_CAPTURE_CONFIDENCE_CONFIG: CaptureConfidenceConfig = {
	windowFrames: 45,
	minSamples: 8,
	okThreshold: 0.6,
	// Defaults assume the coarse `motion`-scalar fallback (0..1, gate ≈0.15,
	// excessive ≈0.35 elsewhere in the SDK) and displacements as a fraction of
	// the face-box diagonal. Heuristic — override per camera/cadence.
	tiBadAt: 0.3,
	faceMotionBadAt: 0.04,
	faceSizeMotionBadAt: 0.04,
	clipBadAt: 0.2,
	lumaLow: 0.2,
	lumaHigh: 0.9,
	skinMin: 0.25,
};

// Pearson correlations between each motion feature and HR error (paper Table 4).
// We use them as per-feature *reliabilities*, normalized so the strongest cue
// (TI) is 1.0 — i.e. how much a saturated value of that cue should count against
// motion confidence. The aggregation below is a noisy-OR, so any single strong
// artifact lowers confidence (a weighted mean would dilute it), while a weak cue
// (FSM) on its own only dents it.
const PCC = { ti: 0.594, fmy: 0.546, fmx: 0.512, fsm: 0.374 };
const PCC_MAX = Math.max(PCC.ti, PCC.fmy, PCC.fmx, PCC.fsm);
export const CAPTURE_MOTION_RELIABILITY = {
	ti: PCC.ti / PCC_MAX,
	fmx: PCC.fmx / PCC_MAX,
	fmy: PCC.fmy / PCC_MAX,
	fsm: PCC.fsm / PCC_MAX,
} as const;

export type CaptureLimiting = "motion" | "lighting" | null;

export interface CaptureConfidenceResult {
	/** Overall 0..1 capture confidence = min(motion, lighting). */
	score: number;
	/** 0..1 motion-only confidence (the paper's contribution). */
	motion: number;
	/** 0..1 lighting-only confidence (the SDK's extension). */
	lighting: number;
	/** Raw windowed features, for telemetry/debug. */
	features: { ti: number; fmx: number; fmy: number; fsm: number };
	/** Which dimension is holding the score down, or null when fine. */
	limiting: CaptureLimiting;
	/** Actionable reason codes (e.g. "high_ti", "clipping", "low_light"). */
	reasons: string[];
	/** False until the window has `minSamples` frames. */
	ready: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const num = (v: number | null | undefined): number | null =>
	v != null && Number.isFinite(v) ? v : null;

export interface CaptureFeatureInputs {
	/** Window max of the per-frame luminance-diff std (or motion fallback). */
	ti: number;
	/** Mean per-landmark |Δx| over the window (face-diagonal units). */
	fmx: number;
	/** Mean per-landmark |Δy| over the window (face-diagonal units). */
	fmy: number;
	/** Mean relative |ΔN| of the ROI area/pixel-count over the window. */
	fsm: number;
	/** Latest lighting cues (any may be null/unknown → not penalized). */
	clipRatio?: number | null;
	skinRatio?: number | null;
	meanLuma?: number | null;
}

/**
 * Pure scorer over already-extracted features — the math, isolated from frame
 * accumulation so it can be unit-tested directly.
 */
export function scoreCaptureFeatures(
	f: CaptureFeatureInputs,
	cfg: CaptureConfidenceConfig = DEFAULT_CAPTURE_CONFIDENCE_CONFIG,
): Omit<CaptureConfidenceResult, "ready"> {
	const tiBad = clamp01(f.ti / cfg.tiBadAt);
	const fmxBad = clamp01(f.fmx / cfg.faceMotionBadAt);
	const fmyBad = clamp01(f.fmy / cfg.faceMotionBadAt);
	const fsmBad = clamp01(f.fsm / cfg.faceSizeMotionBadAt);

	// Noisy-OR over reliability-scaled per-feature badness: motion confidence is
	// the probability that *no* cue indicates a corrupting artifact.
	const motion =
		(1 - CAPTURE_MOTION_RELIABILITY.ti * tiBad) *
		(1 - CAPTURE_MOTION_RELIABILITY.fmx * fmxBad) *
		(1 - CAPTURE_MOTION_RELIABILITY.fmy * fmyBad) *
		(1 - CAPTURE_MOTION_RELIABILITY.fsm * fsmBad);

	const clip = num(f.clipRatio);
	const skin = num(f.skinRatio);
	const luma = num(f.meanLuma);

	const clipBad = clip == null ? 0 : clamp01(clip / cfg.clipBadAt);
	const skinBad =
		skin == null ? 0 : clamp01((cfg.skinMin - skin) / cfg.skinMin);
	let lumaBad = 0;
	let lumaDark = false;
	if (luma != null) {
		if (luma < cfg.lumaLow) {
			lumaBad = clamp01((cfg.lumaLow - luma) / cfg.lumaLow);
			lumaDark = true;
		} else if (luma > cfg.lumaHigh) {
			lumaBad = clamp01((luma - cfg.lumaHigh) / (1 - cfg.lumaHigh));
		}
	}
	const lightingBad = Math.max(clipBad, skinBad, lumaBad);
	const lighting = 1 - lightingBad;

	const score = Math.min(motion, lighting);

	const reasons: string[] = [];
	if (tiBad > 0.5) reasons.push("high_ti");
	if (fmxBad > 0.5) reasons.push("face_translation_x");
	if (fmyBad > 0.5) reasons.push("face_translation_y");
	if (fsmBad > 0.5) reasons.push("face_size_motion");
	if (clipBad > 0.5) reasons.push("clipping");
	if (lumaBad > 0.5) reasons.push(lumaDark ? "low_light" : "bright_light");
	if (skinBad > 0.5) reasons.push("low_skin");

	const limiting: CaptureLimiting =
		score >= cfg.okThreshold
			? null
			: motion <= lighting
				? "motion"
				: "lighting";

	return {
		score,
		motion,
		lighting,
		features: { ti: f.ti, fmx: f.fmx, fmy: f.fmy, fsm: f.fsm },
		limiting,
		reasons,
	};
}

/** Mean per-landmark |Δ| along each axis between two normalized landmark sets. */
function landmarkDisplacement(
	prev: { x: number; y: number }[],
	cur: { x: number; y: number }[],
): { dx: number; dy: number } | null {
	const n = Math.min(prev.length, cur.length);
	if (n === 0) return null;
	let sx = 0;
	let sy = 0;
	for (let i = 0; i < n; i++) {
		sx += Math.abs(cur[i].x - prev[i].x);
		sy += Math.abs(cur[i].y - prev[i].y);
	}
	return { dx: sx / n, dy: sy / n };
}

const boxDiagonal = (b: FaceBox) =>
	Math.sqrt(b.width * b.width + b.height * b.height) || 1;

const boxCenter = (b: FaceBox) => ({
	x: b.x + b.width / 2,
	y: b.y + b.height / 2,
});

/**
 * Stateful, frame-driven capture-confidence scorer. Push one
 * {@link CaptureFrameSample} per processed frame; `push` returns the current
 * {@link CaptureConfidenceResult} over the rolling window.
 */
export class CaptureConfidenceScorer {
	private readonly cfg: CaptureConfidenceConfig;
	private readonly tiBuf: number[] = [];
	private readonly fmxBuf: number[] = [];
	private readonly fmyBuf: number[] = [];
	private readonly fsmBuf: number[] = [];
	private prevLandmarks: { x: number; y: number }[] | null = null;
	private prevBox: FaceBox | null = null;
	private prevRoi: number | null = null;
	private clipRatio: number | null = null;
	private skinRatio: number | null = null;
	private meanLuma: number | null = null;
	private frames = 0;

	constructor(cfg: Partial<CaptureConfidenceConfig> = {}) {
		this.cfg = { ...DEFAULT_CAPTURE_CONFIDENCE_CONFIG, ...cfg };
	}

	reset(): void {
		this.tiBuf.length = 0;
		this.fmxBuf.length = 0;
		this.fmyBuf.length = 0;
		this.fsmBuf.length = 0;
		this.prevLandmarks = null;
		this.prevBox = null;
		this.prevRoi = null;
		this.clipRatio = null;
		this.skinRatio = null;
		this.meanLuma = null;
		this.frames = 0;
	}

	push(sample: CaptureFrameSample): CaptureConfidenceResult {
		this.frames++;

		// Derive a usable face box: explicit, else from landmarks.
		const landmarks = sample.landmarks ?? null;
		const box =
			sample.faceBox ?? (landmarks ? faceBoxFromLandmarks(landmarks) : null);

		// --- TI (per frame): max over window of luminance-diff std (motion fallback)
		const ti = num(sample.luminanceDiffStd) ?? num(sample.motion) ?? 0;
		this.pushBuf(this.tiBuf, ti);

		// --- FMX/FMY (per pair): landmark displacement, else box-center delta,
		// normalized by face-box diagonal so it is scale-invariant.
		const diag = box
			? boxDiagonal(box)
			: this.prevBox
				? boxDiagonal(this.prevBox)
				: 1;
		let disp: { dx: number; dy: number } | null = null;
		if (landmarks && this.prevLandmarks) {
			disp = landmarkDisplacement(this.prevLandmarks, landmarks);
		} else if (box && this.prevBox) {
			const a = boxCenter(box);
			const b = boxCenter(this.prevBox);
			disp = { dx: Math.abs(a.x - b.x), dy: Math.abs(a.y - b.y) };
		}
		if (disp) {
			this.pushBuf(this.fmxBuf, disp.dx / diag);
			this.pushBuf(this.fmyBuf, disp.dy / diag);
		}

		// --- FSM (per pair): relative change in ROI pixel count (box-area fallback)
		const roi =
			num(sample.roiPixelCount) ?? (box ? box.width * box.height : null);
		if (roi != null && this.prevRoi != null) {
			const mean = (roi + this.prevRoi) / 2 || 1;
			this.pushBuf(this.fsmBuf, Math.abs(roi - this.prevRoi) / mean);
		}

		// --- Lighting cues: latest known value (changes slowly).
		if (num(sample.clipRatio) != null) this.clipRatio = sample.clipRatio!;
		if (num(sample.skinRatio) != null) this.skinRatio = sample.skinRatio!;
		if (num(sample.meanLuma) != null) this.meanLuma = sample.meanLuma!;

		this.prevLandmarks = landmarks;
		this.prevBox = box;
		this.prevRoi = roi;

		const scored = scoreCaptureFeatures(
			{
				ti: this.tiBuf.length ? Math.max(...this.tiBuf) : 0,
				fmx: mean(this.fmxBuf),
				fmy: mean(this.fmyBuf),
				fsm: mean(this.fsmBuf),
				clipRatio: this.clipRatio,
				skinRatio: this.skinRatio,
				meanLuma: this.meanLuma,
			},
			this.cfg,
		);
		return { ...scored, ready: this.frames >= this.cfg.minSamples };
	}

	private pushBuf(buf: number[], v: number): void {
		buf.push(v);
		if (buf.length > this.cfg.windowFrames) buf.shift();
	}
}

function mean(xs: number[]): number {
	if (!xs.length) return 0;
	let s = 0;
	for (const x of xs) s += x;
	return s / xs.length;
}
