import {
	FrameSource,
	Frame,
	ROI,
	type FrameSourceError,
	type FrameBlendshape,
	type FaceLandmarkPoint,
} from "./frameSource";
import { computeFusionSubRois } from "./faceRoiOverlay";
import type { FaceLandmarkerLike } from "./mediapipeLoader";

/**
 * Frame source backed by MediaPipe FaceLandmarker (tasks-vision). Each frame
 * carries the face ROI + forehead/cheek sub-ROIs (for rPPG) plus the raw
 * landmarks and blendshape coefficients (for affect / valence-arousal).
 *
 * Unlike the legacy FaceMesh (async send/onResults), FaceLandmarker.detectForVideo
 * is synchronous, so detection happens inline in the capture loop.
 */
export class MediaPipeFaceFrameSource implements FrameSource {
	public onFrame: ((frame: Frame) => void) | null = null;
	public onError: ((error: FrameSourceError) => void) | null = null;
	private running = false;
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private vfcHandle: number | null = null;
	private smoothedFaceRoi: ROI | null = null;
	private lastError: FrameSourceError | null = null;

	constructor(
		private video: HTMLVideoElement,
		private faceLandmarker: FaceLandmarkerLike,
		private fps = 30,
	) {
		this.canvas = document.createElement("canvas") as HTMLCanvasElement;
		this.canvas.width = video.videoWidth || (video as any).width || 320;
		this.canvas.height = video.videoHeight || (video as any).height || 240;
		const ctx = this.canvas.getContext("2d");
		if (!ctx) throw new Error("2D context unavailable");
		this.ctx = ctx;
	}

	async start(): Promise<void> {
		if (this.running) return;
		this.running = true;
		const interval = 1000 / this.fps;
		const vfc = (this.video as any).requestVideoFrameCallback;
		if (typeof vfc === "function") {
			const cb = (now: number, metadata: any) => {
				if (!this.running) return;
				this.detectAndEmit(now, metadata);
				this.vfcHandle = (this.video as any).requestVideoFrameCallback(cb);
			};
			this.vfcHandle = (this.video as any).requestVideoFrameCallback(cb);
		} else {
			const tick = () => {
				if (!this.running) return;
				this.detectAndEmit(Date.now(), null);
				setTimeout(tick, interval);
			};
			tick();
		}
	}

	async stop(): Promise<void> {
		this.running = false;
		this.smoothedFaceRoi = null;
		const cancel = (this.video as any).cancelVideoFrameCallback;
		if (this.vfcHandle !== null && typeof cancel === "function") {
			cancel.call(this.video, this.vfcHandle);
			this.vfcHandle = null;
		}
	}

	getLastError(): FrameSourceError | null {
		return this.lastError;
	}

	private detectAndEmit(now: number, metadata: any) {
		// Resize canvas if the video dimensions became known after construction.
		if (this.video.videoWidth && this.canvas.width !== this.video.videoWidth) {
			this.canvas.width = this.video.videoWidth;
			this.canvas.height = this.video.videoHeight;
		}

		let landmarks: FaceLandmarkPoint[] | null = null;
		let blendshapes: FrameBlendshape[] | undefined;
		try {
			const result = this.faceLandmarker.detectForVideo(this.video, now);
			landmarks = result?.faceLandmarks?.[0] ?? null;
			const categories = result?.faceBlendshapes?.[0]?.categories;
			if (categories && categories.length) {
				blendshapes = categories.map((c) => ({
					categoryName: c.categoryName,
					score: c.score,
				}));
			}
		} catch (error) {
			this.reportError("face_mesh_failed", "face_mesh", error);
		}

		try {
			this.ctx.drawImage(
				this.video as CanvasImageSource,
				0,
				0,
				this.canvas.width,
				this.canvas.height,
			);
			const img = this.ctx.getImageData(
				0,
				0,
				this.canvas.width,
				this.canvas.height,
			);
			const ts =
				typeof metadata?.mediaTime === "number" && metadata.mediaTime > 0
					? metadata.mediaTime * 1000
					: now;
			const frame: Frame = {
				data: img.data,
				width: this.canvas.width,
				height: this.canvas.height,
				timestampMs: ts,
			};
			if (landmarks) {
				const raw = this.landmarksToROI(landmarks, frame.width, frame.height);
				const roi = this.smoothRoi(raw, frame.width, frame.height);
				frame.roi = roi;
				// Forehead/cheek sub-ROIs come from the shared overlay geometry, so the
				// pixels sampled for the pulse are exactly the boxes drawn by
				// drawFaceOverlay (single source of truth for ROI placement).
				frame.rois = computeFusionSubRois(landmarks, frame.width, frame.height);
				frame.landmarks = landmarks;
			}
			if (blendshapes) frame.blendshapes = blendshapes;
			if (this.onFrame) this.onFrame(frame);
		} catch (error) {
			this.reportError("capture_failed", "capture", error);
		}
	}

	private landmarksToROI(
		landmarks: FaceLandmarkPoint[],
		width: number,
		height: number,
	): ROI {
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const p of landmarks) {
			const x = (p.x ?? 0) * width;
			const y = (p.y ?? 0) * height;
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}
		const padX = Math.max(4, Math.floor((maxX - minX) * 0.15));
		const padY = Math.max(4, Math.floor((maxY - minY) * 0.15));
		const x = Math.max(0, Math.floor(minX - padX));
		const y = Math.max(0, Math.floor(minY - padY));
		const w = Math.min(width - x, Math.ceil(maxX - minX + 2 * padX));
		const h = Math.min(height - y, Math.ceil(maxY - minY + 2 * padY));
		return { x, y, w, h };
	}

	private smoothRoi(next: ROI, width: number, height: number): ROI {
		const prev = this.smoothedFaceRoi;
		if (!prev) {
			const init = clampRoi(next, { x: 0, y: 0, w: width, h: height });
			this.smoothedFaceRoi = init;
			return init;
		}
		const prevCx = prev.x + prev.w * 0.5;
		const prevCy = prev.y + prev.h * 0.5;
		const nextCx = next.x + next.w * 0.5;
		const nextCy = next.y + next.h * 0.5;
		const dx = nextCx - prevCx;
		const dy = nextCy - prevCy;
		const dist = Math.sqrt(dx * dx + dy * dy);
		const maxDim = Math.max(prev.w, prev.h);
		const jump = dist > maxDim * 0.35;
		const alpha = jump ? 0.65 : 0.22;
		const blended: ROI = {
			x: prev.x + (next.x - prev.x) * alpha,
			y: prev.y + (next.y - prev.y) * alpha,
			w: prev.w + (next.w - prev.w) * alpha,
			h: prev.h + (next.h - prev.h) * alpha,
		};
		const clamped = clampRoi(blended, { x: 0, y: 0, w: width, h: height });
		this.smoothedFaceRoi = clamped;
		return clamped;
	}

	private reportError(
		code: FrameSourceError["code"],
		stage: FrameSourceError["stage"],
		cause: unknown,
	) {
		const message =
			cause instanceof Error
				? cause.message
				: stage === "face_mesh"
					? "FaceLandmarker failed while processing a browser video frame."
					: "Failed to capture a browser video frame.";
		const error: FrameSourceError = {
			code,
			stage,
			message,
			timestampMs: Date.now(),
			cause,
		};
		this.lastError = error;
		this.onError?.(error);
	}
}

function clampRoi(roi: ROI, bounds: ROI): ROI {
	const x = Math.max(bounds.x, Math.min(bounds.x + bounds.w - 1, roi.x));
	const y = Math.max(bounds.y, Math.min(bounds.y + bounds.h - 1, roi.y));
	const w = Math.max(1, Math.min(bounds.x + bounds.w - x, roi.w));
	const h = Math.max(1, Math.min(bounds.y + bounds.h - y, roi.h));
	return { x, y, w, h };
}
