import { WaveformReconstructionController } from "../waveformReconstructionController";
import type {
	WaveformFeatureWindowV1,
	WaveformReconstructor,
} from "../waveformModel";
import { WaveformModelError } from "../waveformModel";

const manifest = {
	schema: "elata.rppg.waveform-model/v1",
	id: "test-model",
	version: "1",
	status: "diagnostic",
	input: { profileId: "test-profile", channels: ["x"], length: 2, normalization: "zscore" },
	output: { kind: "normalized-waveform", length: 2 },
	hashes: { modelSha256: "a", metadataSha256: "b" },
	runtime: { engine: "test" },
} as const;

const window: WaveformFeatureWindowV1 = {
	schema: "elata.rppg.waveform-window/v1",
	profileId: "test-profile",
	channels: ["x"],
	length: 2,
	startTimeMs: 0,
	endTimeMs: 100,
	sourceSampleRate: 10,
	data: new Float32Array([0, 1]),
};

test("runs inference off the caller path and skips overlapping work", async () => {
	let resolve!: () => void;
	const pending = new Promise<void>((done) => { resolve = done; });
	const model: WaveformReconstructor = {
		manifest,
		init: async () => {},
		reconstruct: async () => {
			await pending;
			return {
				schema: "elata.rppg.waveform-reconstruction/v1",
				modelId: "test-model",
				startTimeMs: 0,
				endTimeMs: 100,
				sampleRate: 10,
				values: new Float32Array([0, 1]),
				reliability: 0.8,
			};
		},
		dispose: async () => {},
	};
	const controller = new WaveformReconstructionController(model, 0);
	await controller.init();
	expect(controller.offer(window, 100)).toBe(true);
	expect(controller.offer(window, 101)).toBe(false);
	resolve();
	await pending;
	await Promise.resolve();
	expect(controller.getLatest()?.reliability).toBe(0.8);
});

test("contains model failures without throwing into deterministic processing", async () => {
	const model: WaveformReconstructor = {
		manifest,
		init: async () => { throw new Error("load failed"); },
		reconstruct: async () => null,
		dispose: async () => {},
	};
	const controller = new WaveformReconstructionController(model);
	await expect(controller.init()).resolves.toBeUndefined();
	expect(controller.offer(window)).toBe(false);
	expect(controller.getDiagnostics()).toMatchObject({
		modelStatus: "failed",
		fallbackReason: "model_init_failed",
	});
});

test("aborts in-flight work on stop and can initialize again", async () => {
	const init = jest.fn(async () => {});
	const dispose = jest.fn(async () => {});
	const reconstruct = jest.fn(
		async (_window: WaveformFeatureWindowV1, signal?: AbortSignal) =>
			new Promise<null>((resolve) => {
				signal?.addEventListener("abort", () => resolve(null), { once: true });
			}),
	);
	const controller = new WaveformReconstructionController({
		manifest,
		init,
		reconstruct,
		dispose,
	});
	await controller.init();
	expect(controller.offer(window, 1000)).toBe(true);

	await controller.stop();
	expect(dispose).toHaveBeenCalledTimes(1);
	expect(controller.getDiagnostics().modelStatus).toBe("disposed");
	expect(controller.getLatest()).toBeNull();

	await controller.init();
	expect(init).toHaveBeenCalledTimes(2);
	expect(controller.getDiagnostics().modelStatus).toBe("ready");
});

test("terminal dispose is idempotent and late work cannot overwrite it", async () => {
	let finish!: (value: null) => void;
	const dispose = jest.fn(async () => {});
	const controller = new WaveformReconstructionController({
		manifest,
		init: async () => {},
		reconstruct: async () => new Promise<null>((resolve) => { finish = resolve; }),
		dispose,
	});
	await controller.init();
	controller.offer(window, 1000);
	const disposing = controller.dispose();
	finish(null);
	await disposing;
	await controller.dispose();
	await controller.init();

	expect(dispose).toHaveBeenCalledTimes(1);
	expect(controller.getDiagnostics().modelStatus).toBe("disposed");
});

test("reports typed tensor failures separately from inference failures", async () => {
	const controller = new WaveformReconstructionController({
		manifest,
		init: async () => {},
		reconstruct: async () => {
			throw new WaveformModelError("invalid_output", "bad tensor");
		},
		dispose: async () => {},
	}, 0);
	await controller.init();
	controller.offer(window, 1000);
	await Promise.resolve();
	await Promise.resolve();
	expect(controller.getDiagnostics().fallbackReason).toBe("invalid_output");
});
