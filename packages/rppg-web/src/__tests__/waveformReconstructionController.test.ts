import { WaveformReconstructionController } from "../waveformReconstructionController";
import type {
	WaveformFeatureWindowV1,
	WaveformReconstructor,
} from "../waveformModel";

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
