import { createRppgSession } from "./rppgSession";
import type { CreateRppgSessionOptions } from "./rppgSession";

export async function initDemo(
	videoEl: HTMLVideoElement,
	opts: Omit<CreateRppgSessionOptions, "video"> = {},
) {
	const session = await createRppgSession({
		video: videoEl,
		backend: "auto",
		faceMesh: "auto",
		enableTracker: { minBpm: 55, maxBpm: 150, numParticles: 200 },
		roiSmoothingAlpha: 0.25,
		useSkinMask: true,
		...opts,
	});

	const { source, processor: proc, runner } = session;
	// expose info for debugging
	(window as any).__rppg_demo = {
		source,
		proc,
		runner,
		session,
		backendAvailable: session.backendMode === "wasm",
	};
	return { source, proc, runner, session };
}
