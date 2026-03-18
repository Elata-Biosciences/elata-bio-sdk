export type EnsureVideoPlayingOptions = {
	timeoutMs?: number;
};

const DEFAULT_VIDEO_PLAYBACK_TIMEOUT_MS = 5_000;

function hasCurrentVideoData(video: HTMLVideoElement): boolean {
	return (
		video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
		!video.paused &&
		!video.ended
	);
}

export async function ensureVideoPlaying(
	video: HTMLVideoElement,
	options: EnsureVideoPlayingOptions = {},
): Promise<void> {
	if (hasCurrentVideoData(video)) {
		return;
	}

	const timeoutMs =
		options.timeoutMs ?? DEFAULT_VIDEO_PLAYBACK_TIMEOUT_MS;

	await new Promise<void>((resolve, reject) => {
		let settled = false;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;

		const cleanup = () => {
			video.removeEventListener("loadedmetadata", tryPlay);
			video.removeEventListener("canplay", tryPlay);
			video.removeEventListener("playing", finish);
			video.removeEventListener("error", fail);
			if (timeoutId != null) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
		};

		const finish = () => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve();
		};

		const fail = () => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(new Error("Camera video did not start playing"));
		};

		const tryPlay = () => {
			if (hasCurrentVideoData(video)) {
				finish();
				return;
			}

			try {
				const playResult = video.play();
				if (playResult && typeof playResult.then === "function") {
					void playResult.then(() => {
						if (hasCurrentVideoData(video)) {
							finish();
						}
					}).catch(() => {
						// Keep waiting for playback-related events until timeout.
					});
				}
			} catch {
				// Keep waiting for playback-related events until timeout.
			}
		};

		video.addEventListener("loadedmetadata", tryPlay);
		video.addEventListener("canplay", tryPlay);
		video.addEventListener("playing", finish);
		video.addEventListener("error", fail);

		timeoutId = setTimeout(fail, timeoutMs);
		tryPlay();
	});
}
