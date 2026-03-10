import { RppgProcessor } from "./rppgProcessor";
import { MediaPipeFaceFrameSource } from "./mediaPipeFaceFrameSource";
import { MediaPipeFrameSource } from "./mediaPipeFrameSource";
import { loadFaceMesh } from "./mediapipeLoader";
import type { DemoRunnerOptions } from "./demoRunner";

export async function initDemo(
	videoEl: HTMLVideoElement,
	opts: DemoRunnerOptions & { sampleRate?: number; windowSec?: number } = {},
) {
	// try to load FaceMesh
	const faceMesh = await loadFaceMesh();
	let source: any;
	if (faceMesh) {
		source = new MediaPipeFaceFrameSource(videoEl, faceMesh, 30);
	} else {
		source = new MediaPipeFrameSource(videoEl, { fps: 30 });
	}

	// Try to load WASM backend and fall back to JS backend
	let backend: any = null;
	try {
		const { loadWasmBackend } = await import("./wasmBackend");
		backend = await loadWasmBackend();
	} catch (e) {
		backend = null;
	}

	if (!backend) {
		// JS fallback: create a fake wasm-compatible pipeline using RppgProcessor's injected backend style
		backend = {
			newPipeline: (sr: number, w: number) => ({
				push_sample: () => {},
				get_metrics: () => ({ bpm: null, confidence: 0, signal_quality: 0 }),
			}),
		};
	}

	// Slightly longer window improves stability.
	const sampleRate = opts.sampleRate ?? 30;
	const windowSec = opts.windowSec ?? 10;
	const proc = new RppgProcessor(backend as any, sampleRate, windowSec);
	// Enable backend tracker smoothing to reduce occasional octave jumps in displayed BPM.
	proc.enableTracker(55, 150, 200);
	const runner = new (await import("./demoRunner")).DemoRunner(source, proc, {
		roiSmoothingAlpha: 0.25,
		useSkinMask: true,
		...opts,
	});
	await runner.start();
	// expose info for debugging
	(window as any).__rppg_demo = {
		source,
		proc,
		runner,
		backendAvailable: !!(backend && backend.newPipeline),
	};
	return { source, proc, runner };
}
