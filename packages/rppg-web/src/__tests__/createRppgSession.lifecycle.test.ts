jest.mock("../mediapipeLoader", () => ({
	loadFaceMesh: jest.fn(async () => null),
}));

jest.mock("../videoPlayback", () => ({
	ensureVideoPlaying: jest.fn(async () => undefined),
}));

jest.mock("../wasmBackend", () => ({
	loadWasmBackend: jest.fn(async () => ({
		newPipeline: () => ({
			push_sample: jest.fn(),
			get_metrics: jest.fn(() => ({ bpm: 72, confidence: 0.8, signal_quality: 0.7 })),
			free: jest.fn(),
		}),
	})),
	createUnavailableBackend: jest.fn(() => ({
		newPipeline: () => ({
			push_sample: jest.fn(),
			get_metrics: jest.fn(() => ({ bpm: null, confidence: 0, signal_quality: 0 })),
			free: jest.fn(),
		}),
	})),
}));

const frameSourceStart = jest.fn(async () => {});
const frameSourceStop = jest.fn(async () => {});
const faceFrameSourceStart = jest.fn(async () => {});
const faceFrameSourceStop = jest.fn(async () => {});

jest.mock("../mediaPipeFrameSource", () => ({
	MediaPipeFrameSource: jest.fn().mockImplementation(function MediaPipeFrameSource(this: any) {
		this.onFrame = null;
		this.start = frameSourceStart;
		this.stop = frameSourceStop;
	}),
}));

jest.mock("../mediaPipeFaceFrameSource", () => ({
	MediaPipeFaceFrameSource: jest.fn().mockImplementation(function MediaPipeFaceFrameSource(this: any) {
		this.onFrame = null;
		this.start = faceFrameSourceStart;
		this.stop = faceFrameSourceStop;
	}),
}));

const runnerStart = jest.fn(async () => {});
const runnerStop = jest.fn(async () => {});

jest.mock("../demoRunner", () => ({
	DemoRunner: jest.fn().mockImplementation(function DemoRunner(this: any) {
		this.start = runnerStart;
		this.stop = runnerStop;
		this.getDiagnostics = jest.fn(() => ({
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
		}));
	}),
}));

import { createRppgSession } from "../rppgSession";
import { loadFaceMesh } from "../mediapipeLoader";
import { ensureVideoPlaying } from "../videoPlayback";
import { MediaPipeFrameSource } from "../mediaPipeFrameSource";
import { MediaPipeFaceFrameSource } from "../mediaPipeFaceFrameSource";
import { loadWasmBackend } from "../wasmBackend";

const mockedLoadFaceMesh = loadFaceMesh as jest.MockedFunction<typeof loadFaceMesh>;
const mockedEnsureVideoPlaying = ensureVideoPlaying as jest.MockedFunction<typeof ensureVideoPlaying>;
const mockedMediaPipeFrameSource = MediaPipeFrameSource as unknown as jest.Mock;
const mockedMediaPipeFaceFrameSource = MediaPipeFaceFrameSource as unknown as jest.Mock;
const mockedLoadWasmBackend = loadWasmBackend as jest.MockedFunction<typeof loadWasmBackend>;

describe("createRppgSession lifecycle", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		frameSourceStart.mockClear();
		frameSourceStop.mockClear();
		faceFrameSourceStart.mockClear();
		faceFrameSourceStop.mockClear();
		runnerStart.mockClear();
		runnerStop.mockClear();
	});

	test("uses ensureVideoPlaying by default before auto-starting", async () => {
		const video = document.createElement("video");

		const session = await createRppgSession({
			video,
			faceMesh: "off",
		});

		expect(mockedEnsureVideoPlaying).toHaveBeenCalledTimes(1);
		expect(mockedEnsureVideoPlaying).toHaveBeenCalledWith(
			video,
			{ timeoutMs: undefined },
		);
		expect(mockedLoadFaceMesh).not.toHaveBeenCalled();
		expect(mockedMediaPipeFrameSource).toHaveBeenCalledTimes(1);
		expect(session.faceTrackingMode).toBe("video_frame");
		expect(runnerStart).toHaveBeenCalledTimes(1);
	});

	test("skips video playback coordination when ensureVideoPlayback is false", async () => {
		await createRppgSession({
			video: document.createElement("video"),
			faceMesh: "off",
			ensureVideoPlayback: false,
		});

		expect(mockedEnsureVideoPlaying).not.toHaveBeenCalled();
		expect(runnerStart).toHaveBeenCalledTimes(1);
	});

	test("defers video playback coordination until manual start when autoStart is false", async () => {
		const video = document.createElement("video");
		const session = await createRppgSession({
			video,
			faceMesh: "off",
			autoStart: false,
			videoPlaybackTimeoutMs: 1234,
		});

		expect(mockedEnsureVideoPlaying).not.toHaveBeenCalled();
		expect(runnerStart).not.toHaveBeenCalled();

		await session.start();

		expect(mockedEnsureVideoPlaying).toHaveBeenCalledTimes(1);
		expect(mockedEnsureVideoPlaying).toHaveBeenCalledWith(
			video,
			{ timeoutMs: 1234 },
		);
		expect(runnerStart).toHaveBeenCalledTimes(1);
	});

	test("uses the face frame source when FaceMesh resolves successfully", async () => {
		mockedLoadFaceMesh.mockResolvedValueOnce({
			onResults: jest.fn(),
			send: jest.fn(),
		} as any);

		const session = await createRppgSession({
			video: document.createElement("video"),
			faceMesh: "auto",
			ensureVideoPlayback: false,
		});

		expect(mockedLoadFaceMesh).toHaveBeenCalledTimes(1);
		expect(mockedMediaPipeFaceFrameSource).toHaveBeenCalledTimes(1);
		expect(session.faceTrackingMode).toBe("face_mesh");
	});

	test("dispose frees the created backend pipeline", async () => {
		const free = jest.fn();
		mockedLoadWasmBackend.mockResolvedValueOnce({
			newPipeline: () => ({
				push_sample: jest.fn(),
				get_metrics: jest.fn(() => ({ bpm: 72, confidence: 0.8, signal_quality: 0.7 })),
				free,
			}),
		} as any);

		const session = await createRppgSession({
			video: document.createElement("video"),
			faceMesh: "off",
			ensureVideoPlayback: false,
		});

		await session.dispose();

		expect(free).toHaveBeenCalledTimes(1);
	});
});
