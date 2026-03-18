import { ensureVideoPlaying } from "../videoPlayback";

function setVideoState(
	video: HTMLVideoElement,
	state: { readyState?: number; paused?: boolean; ended?: boolean },
) {
	if (state.readyState != null) {
		Object.defineProperty(video, "readyState", {
			configurable: true,
			get: () => state.readyState,
		});
	}
	if (state.paused != null) {
		Object.defineProperty(video, "paused", {
			configurable: true,
			get: () => state.paused,
		});
	}
	if (state.ended != null) {
		Object.defineProperty(video, "ended", {
			configurable: true,
			get: () => state.ended,
		});
	}
}

describe("ensureVideoPlaying", () => {
	test("resolves immediately when the video is already playing", async () => {
		const video = document.createElement("video");
		setVideoState(video, {
			readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
			paused: false,
			ended: false,
		});
		video.play = jest.fn(async () => undefined);

		await expect(ensureVideoPlaying(video)).resolves.toBeUndefined();
		expect(video.play).not.toHaveBeenCalled();
	});

	test("waits for playback events when the video is not yet playing", async () => {
		const video = document.createElement("video");
		let readyState: number = HTMLMediaElement.HAVE_METADATA;
		let paused = true;
		setVideoState(video, { readyState, paused, ended: false });
		Object.defineProperty(video, "readyState", {
			configurable: true,
			get: () => readyState,
		});
		Object.defineProperty(video, "paused", {
			configurable: true,
			get: () => paused,
		});
		video.play = jest.fn(async () => undefined);

		const promise = ensureVideoPlaying(video, { timeoutMs: 500 });
		readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
		paused = false;
		video.dispatchEvent(new Event("playing"));

		await expect(promise).resolves.toBeUndefined();
		expect(video.play).toHaveBeenCalled();
	});

	test("rejects when playback never starts", async () => {
		jest.useFakeTimers();
		try {
			const video = document.createElement("video");
			setVideoState(video, {
				readyState: HTMLMediaElement.HAVE_METADATA,
				paused: true,
				ended: false,
			});
			video.play = jest.fn(async () => undefined);

			const promise = ensureVideoPlaying(video, { timeoutMs: 200 });
			jest.advanceTimersByTime(250);

			await expect(promise).rejects.toThrow("Camera video did not start playing");
		} finally {
			jest.useRealTimers();
		}
	});
});
