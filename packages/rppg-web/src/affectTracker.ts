import {
	type AffectState,
	type FaceBlendshapeCategory,
	blendshapeValenceArousal,
	physiologyArousal,
	fuseAffect,
} from "./affect";

/**
 * Stateful affect estimator: combines face blendshapes (valence + face arousal)
 * with rPPG physiology (arousal from HR elevation / HRV suppression vs a resting
 * baseline). Valence comes from the face; arousal is physiology-primary, fused
 * with face arousal and each gated by confidence. Builds the resting baseline
 * automatically from the first N stable physiology samples.
 */

export type AffectBaseline = { bpm: number; rmssd: number };

export type AffectTrackerOptions = {
	/** Physiology samples to average into the resting baseline (default 60). */
	baselineSamples?: number;
	/** Face affect older than this (ms) is ignored when fusing (default 1500). */
	faceStaleMs?: number;
	/** Fallback RMSSD if none observed during baseline (default 50 ms). */
	defaultRmssd?: number;
};

function median(values: number[]): number {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

export class AffectTracker {
	private lastFaceValence: number | null = null;
	private lastFaceArousal: number | null = null;
	private lastFaceAtMs = 0;
	private baseline: AffectBaseline | null = null;
	private calibBpm: number[] = [];
	private calibRmssd: number[] = [];
	private readonly baselineSamples: number;
	private readonly faceStaleMs: number;
	private readonly defaultRmssd: number;

	constructor(options: AffectTrackerOptions = {}) {
		this.baselineSamples = options.baselineSamples ?? 60;
		this.faceStaleMs = options.faceStaleMs ?? 1500;
		this.defaultRmssd = options.defaultRmssd ?? 50;
	}

	reset(): void {
		this.lastFaceValence = null;
		this.lastFaceArousal = null;
		this.lastFaceAtMs = 0;
		this.baseline = null;
		this.calibBpm = [];
		this.calibRmssd = [];
	}

	getBaseline(): AffectBaseline | null {
		return this.baseline;
	}

	setBaseline(baseline: AffectBaseline | null): void {
		this.baseline = baseline;
	}

	/** Feed face blendshapes; stores valence + face arousal with a timestamp. */
	observeFace(
		blendshapes: FaceBlendshapeCategory[] | null | undefined,
		nowMs: number = Date.now(),
	): void {
		if (!blendshapes || !blendshapes.length) return;
		const va = blendshapeValenceArousal(blendshapes);
		if (!va) return;
		this.lastFaceValence = va.valence;
		this.lastFaceArousal = va.arousal;
		this.lastFaceAtMs = nowMs;
	}

	/** Feed physiology; accumulates the resting baseline until enough samples seen. */
	observePhysiology(bpm: number | null, rmssd: number | null): void {
		if (this.baseline) return;
		if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) return;
		this.calibBpm.push(bpm);
		if (rmssd != null && Number.isFinite(rmssd) && rmssd > 0) {
			this.calibRmssd.push(rmssd);
		}
		if (this.calibBpm.length >= this.baselineSamples) {
			this.baseline = {
				bpm: median(this.calibBpm),
				rmssd: this.calibRmssd.length ? median(this.calibRmssd) : this.defaultRmssd,
			};
		}
	}

	/** Compute the current fused affect state. */
	compute(input: {
		bpm: number | null;
		rmssd: number | null;
		physioConfidence?: number;
		faceConfidence?: number;
		nowMs?: number;
	}): AffectState {
		const nowMs = input.nowMs ?? Date.now();
		const faceFresh = nowMs - this.lastFaceAtMs < this.faceStaleMs;
		const physioAr = physiologyArousal(input.bpm, input.rmssd, this.baseline);
		return fuseAffect(
			faceFresh ? this.lastFaceValence : null,
			faceFresh ? this.lastFaceArousal : null,
			physioAr,
			input.physioConfidence ?? (physioAr != null ? 1 : 0),
			input.faceConfidence ?? (faceFresh ? 1 : 0),
		);
	}
}
