import {
	FrameSource,
	Frame,
	type FrameBlendshape,
	averageGreenInROI,
	averageGreenInROIWithSkinMaskStats,
	averageRgbInROI,
	averageRgbInROIWithSkinMaskStats,
} from "./frameSource";
import {
	faceBoxFromLandmarks,
	padFaceBoxToHead,
	type FaceBox,
} from "./faceFraming";
import {
	FUSION_ROIS,
	type FusionRoiName,
	type MultiRoiFusionResult,
	MultiRoiRppgFuser,
	type RoiRgbSample,
} from "./multiRoiFusion";
import { RppgProcessor } from "./rppgProcessor";
import {
	ELATA_YCBCR_V1_PIXEL_SAMPLER,
	type RoiPixelSampler,
} from "./roiPixelSampler";
import {
	ELATA_FACE_YCBCR_V1_PROFILE,
	type RoiGeometryProfile,
} from "./roiProfile";

export type LastBlendshapes = {
	blendshapes: FrameBlendshape[];
	atMs: number;
};

export type LastFaceBox = {
	/** Normalized (0..1) head box — the mesh bounds padded out to the head. */
	box: FaceBox;
	atMs: number;
};

export type DemoRunnerOptions = {
	roi?: { x: number; y: number; w: number; h: number } | null;
	/** Face-mesh ROI geometry profile. */
	roiGeometryProfile?: RoiGeometryProfile;
	sampleRate?: number;
	roiSmoothingAlpha?: number;
	useSkinMask?: boolean;
	onStats?: (stats: {
		intensity: number;
		skinRatio: number;
		fps: number | null;
		r: number;
		g: number;
		b: number;
		clipRatio: number;
		motion: number;
	}) => void;
	onDiagnostics?: (diagnostics: DemoRunnerDiagnostics) => void;
	onError?: (error: DemoRunnerError) => void;
	skinRatioSmoothingAlpha?: number;
	/**
	 * Multi-ROI rPPG fusion: run CHROM + bandpass per face region (forehead +
	 * both cheeks) and blend by in-band spectral SNR, so glare/hair/occlusion on
	 * one region no longer poisons the estimate. Requires sub-ROIs on the frame
	 * (face-mesh mode) + the skin mask. Defaults to on; falls back to the single
	 * aggregated-ROI path when sub-ROIs are unavailable.
	 */
	multiRoiFusion?: boolean;
	/**
	 * Pixel-selection and spatial-weighting profile. When omitted, the original
	 * SDK YCbCr helper is used unchanged.
	 */
	roiPixelSampler?: RoiPixelSampler;
};

export type DemoRunnerDropReason =
	| "frame_invalid"
	| "roi_missing"
	| "non_finite_intensity"
	| "processor_error";

export type DemoRunnerDiagnostics = {
	framesSeen: number;
	framesWithFaceRoi: number;
	framesWithFallbackRoi: number;
	framesWithMultiRoi: number;
	samplesPushed: number;
	droppedFrames: number;
	lastDropReason: DemoRunnerDropReason | null;
	lastTimestampMs: number | null;
	lastIntensity: number | null;
	lastSkinRatio: number | null;
	lastClipRatio: number | null;
	lastMotion: number | null;
	lastProcessorMethod: "rgb_meta" | "rgb" | "intensity" | "fused" | null;
	lastRoiSource: "multi_roi" | "face_roi" | "fallback_roi" | null;
	/** Frames fed through the multi-ROI fuser (subset of framesWithMultiRoi). */
	framesWithFusion: number;
	/** Per-region fusion weights (sum to 1), SNR-driven; null until fusion runs. */
	lastFusionWeights: Record<FusionRoiName, number> | null;
	/** In-band spectral SNR (linear) of the fused signal, or null. */
	lastFusedSnr: number | null;
	/** Versioned ROI contracts active for this runner. */
	roiGeometryProfileId: string;
	roiPixelSamplerId: string;
};

export type DemoRunnerError = {
	code: "processor_error";
	stage: "processor";
	message: string;
	timestampMs: number;
	diagnostics: DemoRunnerDiagnostics;
	cause?: unknown;
};

export class DemoRunner {
	private running = false;
	private frameCount = 0;
	private lastSampleTs = 0;
	private smoothedRoi: { x: number; y: number; w: number; h: number } | null =
		null;
	private frameTimes: number[] = [];
	private lastFps: number | null = null;
	private lastCenter: { x: number; y: number } | null = null;
	private smoothedSkinRatio: number | null = null;
	private diagnostics: DemoRunnerDiagnostics = {
		framesSeen: 0,
		framesWithFaceRoi: 0,
		framesWithFallbackRoi: 0,
		framesWithMultiRoi: 0,
		samplesPushed: 0,
		droppedFrames: 0,
		lastDropReason: null,
		lastTimestampMs: null,
		lastIntensity: null,
		lastSkinRatio: null,
		lastClipRatio: null,
		lastMotion: null,
		lastProcessorMethod: null,
		lastRoiSource: null,
		framesWithFusion: 0,
		lastFusionWeights: null,
		lastFusedSnr: null,
		roiGeometryProfileId: ELATA_FACE_YCBCR_V1_PROFILE.id,
		roiPixelSamplerId: ELATA_YCBCR_V1_PIXEL_SAMPLER.id,
	};
	private lastError: DemoRunnerError | null = null;
	private lastBlendshapes: LastBlendshapes | null = null;
	private lastFaceBox: LastFaceBox | null = null;
	private fuser: MultiRoiRppgFuser | null = null;

	constructor(
		private source: FrameSource,
		private processor: RppgProcessor,
		private opts: DemoRunnerOptions = {},
	) {
		this.source.onFrame = this.onFrame.bind(this);
		this.diagnostics.roiGeometryProfileId =
			opts.roiGeometryProfile?.id ?? ELATA_FACE_YCBCR_V1_PROFILE.id;
		this.diagnostics.roiPixelSamplerId =
			opts.roiPixelSampler?.id ?? ELATA_YCBCR_V1_PIXEL_SAMPLER.id;
		if (opts.multiRoiFusion !== false) {
			this.fuser = new MultiRoiRppgFuser(opts.sampleRate ?? 30);
		}
	}

	/** Latest face blendshapes (for affect estimation), with capture timestamp. */
	getLastBlendshapes(): LastBlendshapes | null {
		return this.lastBlendshapes;
	}

	/**
	 * Latest normalized head box (for framing guidance), with capture timestamp.
	 * Null until a face is tracked; consumers should treat a stale entry as
	 * "no face" against their own clock.
	 */
	getLastFaceBox(): LastFaceBox | null {
		return this.lastFaceBox;
	}

	async start() {
		this.running = true;
		await this.source.start();
	}

	async stop() {
		this.running = false;
		this.fuser?.reset();
		await this.source.stop();
	}

	getDiagnostics(): DemoRunnerDiagnostics {
		return { ...this.diagnostics };
	}

	getLastError(): DemoRunnerError | null {
		return this.lastError;
	}

	private onFrame(frame: Frame) {
		if (!this.running) return;
		this.diagnostics.framesSeen += 1;
		if (frame.blendshapes && frame.blendshapes.length) {
			this.lastBlendshapes = {
				blendshapes: frame.blendshapes,
				atMs: frame.timestampMs ?? Date.now(),
			};
		}
		// Capture the head box for framing guidance. Wall-clock `atMs` (not the
		// frame's media time) so consumers can age it against Date.now().
		if (frame.landmarks && frame.landmarks.length) {
			const mesh = faceBoxFromLandmarks(frame.landmarks);
			if (mesh) {
				this.lastFaceBox = { box: padFaceBoxToHead(mesh), atMs: Date.now() };
			}
		}
		const now =
			typeof performance !== "undefined" ? performance.now() : Date.now();
		this.frameTimes.push(now);
		if (this.frameTimes.length > 30) this.frameTimes.shift();
		if (this.frameTimes.length >= 2) {
			const dt =
				(this.frameTimes[this.frameTimes.length - 1] - this.frameTimes[0]) /
				1000;
			if (dt > 0) this.lastFps = (this.frameTimes.length - 1) / dt;
		}
		const useSkinMask = this.opts.useSkinMask !== false;
		let rgb = { r: 0, g: 0, b: 0 };
		let skinRatio = 1;
		let clipRatio = 0;
		let intensity = 0;
		let motion = 0;
		let roiSource: DemoRunnerDiagnostics["lastRoiSource"] = null;
		let fusionResult: MultiRoiFusionResult | null = null;

		const rois = frame.rois && frame.rois.length > 0 ? frame.rois : null;
		if (rois) {
			roiSource = "multi_roi";
			this.diagnostics.framesWithMultiRoi += 1;
			const agg = aggregateRgbFromRois(
				frame,
				rois,
				useSkinMask,
				this.opts.roiPixelSampler,
			);
			rgb = { r: agg.r, g: agg.g, b: agg.b };
			skinRatio = agg.skinRatio;
			clipRatio = agg.clipRatio;
			intensity = agg.g;
			// Multi-ROI fusion: per-region CHROM blended by in-band SNR. The
			// aggregate above is still computed for diagnostics/onStats and as the
			// fallback if the fuser can't produce a valid frame this tick.
			if (this.fuser && useSkinMask) {
				fusionResult = this.runFusion(frame, rois);
			}
			if (frame.roi) {
				motion = computeMotion(frame.roi, this.lastCenter);
				this.lastCenter = {
					x: frame.roi.x + frame.roi.w * 0.5,
					y: frame.roi.y + frame.roi.h * 0.5,
				};
			}
		} else {
			let roi = this.opts.roi;
			if (typeof roi === "undefined") {
				roi = frame.roi ?? null;
			}
			if (frame.roi) {
				this.diagnostics.framesWithFaceRoi += 1;
				roiSource = "face_roi";
			}
			if (!roi) {
				if (frame.width <= 0 || frame.height <= 0 || !frame.data.length) {
					this.recordDrop("frame_invalid");
					return;
				}
				roi = {
					x: Math.floor((frame.width - 100) / 2),
					y: Math.floor((frame.height - 100) / 2),
					w: 100,
					h: 100,
				};
				this.diagnostics.framesWithFallbackRoi += 1;
				roiSource = "fallback_roi";
			}
			const clamped = clampRoiToFrame(roi, frame.width, frame.height);
			const smoothed = smoothRoi(
				this.smoothedRoi,
				clamped,
				this.opts.roiSmoothingAlpha,
			);
			const smoothedClamped = clampRoiToFrame(
				smoothed,
				frame.width,
				frame.height,
			);
			this.smoothedRoi = smoothedClamped;
			if (useSkinMask) {
				const rgbRes = sampleRgbWithSkinMask(
					frame,
					smoothedClamped,
					this.opts.roiPixelSampler,
				);
				rgb = { r: rgbRes.r, g: rgbRes.g, b: rgbRes.b };
				skinRatio = rgbRes.skinRatio;
				clipRatio = rgbRes.clipRatio;
				intensity = rgbRes.g;
			} else {
				rgb = averageRgbInROI(
					frame,
					smoothedClamped.x,
					smoothedClamped.y,
					smoothedClamped.w,
					smoothedClamped.h,
				);
				intensity = rgb.g;
				skinRatio = 1;
				clipRatio = 0;
			}
			motion = computeMotion(smoothedClamped, this.lastCenter);
			this.lastCenter = {
				x: smoothedClamped.x + smoothedClamped.w * 0.5,
				y: smoothedClamped.y + smoothedClamped.h * 0.5,
			};
		}
		if (!Number.isFinite(intensity)) {
			this.recordDrop("non_finite_intensity");
			return;
		}
		skinRatio = smooth01(
			this.smoothedSkinRatio,
			skinRatio,
			this.opts.skinRatioSmoothingAlpha ?? 0.2,
		);
		this.smoothedSkinRatio = skinRatio;
		const ts = frame.timestampMs ?? Date.now();
		const proc = this.processor as any;
		try {
			if (
				fusionResult?.valid &&
				typeof proc.pushFusedSample === "function"
			) {
				// Fused pulse already carries CHROM + SNR-weighted blending; feed it
				// straight to spectral BPM/HRV, with the fused SNR as quality.
				proc.pushFusedSample(ts, fusionResult.fused, fusionResult.fusedSnr);
				this.diagnostics.lastProcessorMethod = "fused";
				this.diagnostics.framesWithFusion += 1;
				this.diagnostics.lastFusionWeights = fusionResult.weights;
				this.diagnostics.lastFusedSnr = fusionResult.fusedSnr;
			} else if (typeof proc.pushSampleRgbMeta === "function") {
				proc.pushSampleRgbMeta(
					ts,
					rgb.r,
					rgb.g,
					rgb.b,
					skinRatio,
					motion,
					clipRatio,
				);
				this.diagnostics.lastProcessorMethod = "rgb_meta";
			} else if (typeof proc.pushSampleRgb === "function") {
				proc.pushSampleRgb(ts, rgb.r, rgb.g, rgb.b, skinRatio);
				this.diagnostics.lastProcessorMethod = "rgb";
			} else if (typeof proc.pushSample === "function") {
				proc.pushSample(ts, intensity);
				this.diagnostics.lastProcessorMethod = "intensity";
			} else {
				throw new TypeError("processor has no push sample API");
			}
		} catch (error) {
			this.recordDrop("processor_error");
			this.running = false;
			void this.source.stop().catch(() => {});
			this.recordError(error);
			return;
		}
		this.diagnostics.samplesPushed += 1;
		this.diagnostics.lastDropReason = null;
		this.diagnostics.lastTimestampMs = ts;
		this.diagnostics.lastIntensity = intensity;
		this.diagnostics.lastSkinRatio = skinRatio;
		this.diagnostics.lastClipRatio = clipRatio;
		this.diagnostics.lastMotion = motion;
		this.diagnostics.lastRoiSource = roiSource;
		this.emitDiagnostics();
		if (this.opts.onStats) {
			this.opts.onStats({
				intensity,
				skinRatio,
				fps: this.lastFps,
				r: rgb.r,
				g: rgb.g,
				b: rgb.b,
				clipRatio,
				motion,
			});
		}
	}

	/**
	 * Sample per-region skin-masked RGB and push one frame through the fuser. The
	 * sub-ROIs arrive ordered as {@link FUSION_ROIS} (forehead, leftCheek,
	 * rightCheek) from `computeFusionSubRois`; a region with too little skin is
	 * skipped by the fuser.
	 */
	private runFusion(
		frame: Frame,
		rois: { x: number; y: number; w: number; h: number }[],
	): MultiRoiFusionResult | null {
		if (!this.fuser) return null;
		const samples: Partial<Record<FusionRoiName, RoiRgbSample>> = {};
		const n = Math.min(FUSION_ROIS.length, rois.length);
		for (let i = 0; i < n; i++) {
			const c = clampRoiToFrame(rois[i]!, frame.width, frame.height);
			const s = sampleRgbWithSkinMask(
				frame,
				c,
				this.opts.roiPixelSampler,
			);
			samples[FUSION_ROIS[i]!] = {
				r: s.r,
				g: s.g,
				b: s.b,
				skinFraction: s.skinRatio,
			};
		}
		return this.fuser.pushFrame(samples);
	}

	private recordDrop(reason: DemoRunnerDropReason) {
		this.diagnostics.droppedFrames += 1;
		this.diagnostics.lastDropReason = reason;
		this.emitDiagnostics();
	}

	private recordError(cause: unknown) {
		const error: DemoRunnerError = {
			code: "processor_error",
			stage: "processor",
			message:
				cause instanceof Error
					? cause.message
					: "The rPPG processor rejected a frame sample.",
			timestampMs: Date.now(),
			diagnostics: this.getDiagnostics(),
			cause,
		};
		this.lastError = error;
		this.opts.onError?.(error);
	}

	private emitDiagnostics() {
		if (this.opts.onDiagnostics) {
			this.opts.onDiagnostics(this.getDiagnostics());
		}
	}
}

function clampRoiToFrame(
	roi: { x: number; y: number; w: number; h: number },
	width: number,
	height: number,
) {
	const x = Math.max(0, Math.min(width - 1, Math.floor(roi.x)));
	const y = Math.max(0, Math.min(height - 1, Math.floor(roi.y)));
	const w = Math.max(1, Math.min(width - x, Math.floor(roi.w)));
	const h = Math.max(1, Math.min(height - y, Math.floor(roi.h)));
	return { x, y, w, h };
}

function smoothRoi(
	prev: { x: number; y: number; w: number; h: number } | null,
	next: { x: number; y: number; w: number; h: number },
	alpha = 0.2,
) {
	if (!prev) return next;
	const prevCx = prev.x + prev.w * 0.5;
	const prevCy = prev.y + prev.h * 0.5;
	const nextCx = next.x + next.w * 0.5;
	const nextCy = next.y + next.h * 0.5;
	const dx = nextCx - prevCx;
	const dy = nextCy - prevCy;
	const maxDim = Math.max(prev.w, prev.h);
	if (Math.sqrt(dx * dx + dy * dy) > maxDim * 0.35) {
		return next;
	}
	const a = Math.min(0.9, Math.max(0.05, alpha));
	return {
		x: prev.x + (next.x - prev.x) * a,
		y: prev.y + (next.y - prev.y) * a,
		w: prev.w + (next.w - prev.w) * a,
		h: prev.h + (next.h - prev.h) * a,
	};
}

function aggregateRgbFromRois(
	frame: Frame,
	rois: { x: number; y: number; w: number; h: number }[],
	useSkinMask: boolean,
	pixelSampler?: RoiPixelSampler,
) {
	let sumR = 0;
	let sumG = 0;
	let sumB = 0;
	let sumW = 0; // weight for RGB (skin pixels)
	let sumArea = 0;
	let sumSkinArea = 0;
	let sumClipArea = 0;
	for (const roi of rois) {
		const clamped = clampRoiToFrame(roi, frame.width, frame.height);
		const area = clamped.w * clamped.h;
		sumArea += area;
		if (useSkinMask) {
			const rgbRes = sampleRgbWithSkinMask(frame, clamped, pixelSampler);
			// Keep ROI contribution from collapsing to near-zero on transient skin-mask misses.
			const weight = area * Math.max(0.15, rgbRes.skinRatio);
			sumR += rgbRes.r * weight;
			sumG += rgbRes.g * weight;
			sumB += rgbRes.b * weight;
			sumW += weight;
			sumSkinArea += rgbRes.skinRatio * area;
			sumClipArea += rgbRes.clipRatio * area;
		} else {
			const rgbRes = averageRgbInROI(
				frame,
				clamped.x,
				clamped.y,
				clamped.w,
				clamped.h,
			);
			sumR += rgbRes.r * area;
			sumG += rgbRes.g * area;
			sumB += rgbRes.b * area;
			sumW += area;
			sumSkinArea += area;
		}
	}
	if (sumW <= 0 || sumArea <= 0) {
		return { r: 0, g: 0, b: 0, skinRatio: 0, clipRatio: 0 };
	}
	return {
		r: sumR / sumW,
		g: sumG / sumW,
		b: sumB / sumW,
		skinRatio: sumSkinArea / sumArea,
		clipRatio: sumClipArea / sumArea,
	};
}

function sampleRgbWithSkinMask(
	frame: Frame,
	roi: { x: number; y: number; w: number; h: number },
	pixelSampler?: RoiPixelSampler,
) {
	if (!pixelSampler) {
		return averageRgbInROIWithSkinMaskStats(
			frame,
			roi.x,
			roi.y,
			roi.w,
			roi.h,
		);
	}
	const sample = pixelSampler.sample(frame, roi);
	return {
		r: sample.r,
		g: sample.g,
		b: sample.b,
		skinRatio: sample.effectiveSkinFraction,
		clipRatio: sample.clipRatio,
	};
}

function computeMotion(
	roi: { x: number; y: number; w: number; h: number },
	last: { x: number; y: number } | null,
) {
	if (!last) return 0;
	const cx = roi.x + roi.w * 0.5;
	const cy = roi.y + roi.h * 0.5;
	const dx = cx - last.x;
	const dy = cy - last.y;
	const dist = Math.sqrt(dx * dx + dy * dy);
	const norm = Math.max(1, Math.max(roi.w, roi.h));
	return Math.min(1, dist / norm);
}

function smooth01(prev: number | null, next: number, alpha: number): number {
	const n = Math.max(0, Math.min(1, next));
	if (prev === null || !Number.isFinite(prev)) return n;
	const a = Math.min(0.8, Math.max(0.05, alpha));
	const delta = n - prev;
	const effectiveAlpha = Math.abs(delta) > 0.3 ? a * 0.35 : a;
	return Math.max(0, Math.min(1, prev + delta * effectiveAlpha));
}
