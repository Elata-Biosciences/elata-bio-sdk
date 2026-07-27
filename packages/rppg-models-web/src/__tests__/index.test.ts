import {
	MCD_WAVEFORM_CHANNELS,
	type WaveformFeatureWindowV1,
} from "@elata-biosciences/rppg-web";
import {
	createMcdWaveformReconstructor,
	MCD_WAVEFORM_MODEL_MANIFEST_V1,
} from "../index";

function window(profileId = "mcd-proxy-input-v1"): WaveformFeatureWindowV1 {
	return {
		schema: "elata.rppg.waveform-window/v1",
		profileId,
		channels: MCD_WAVEFORM_CHANNELS,
		length: 300,
		startTimeMs: 0,
		endTimeMs: 10_000,
		sourceSampleRate: 30,
		data: new Float32Array(15 * 300),
	};
}

test("runs the exact manifest tensor contract and normalizes output", async () => {
	const release = jest.fn();
	class Tensor {
		constructor(
			readonly type: string,
			readonly data: Float32Array,
			readonly dims: number[],
		) {}
	}
	const run = jest.fn(async (_feeds: Record<string, Tensor>) => ({
		reconstructed: { data: Float32Array.from({ length: 300 }, (_, i) => i) },
	}));
	const runtime = {
		Tensor,
		InferenceSession: { create: jest.fn(async () => ({ run, release })) },
	};
	const model = createMcdWaveformReconstructor({
		modelUrl: "/caller-owned/model.onnx",
		runtimeImporter: async () => runtime as never,
	});

	await model.init();
	const result = await model.reconstruct(window());

	expect(runtime.InferenceSession.create).toHaveBeenCalledWith(
		"/caller-owned/model.onnx",
		{ executionProviders: ["wasm"] },
	);
	const input = run.mock.calls[0][0].input as Tensor;
	expect(input.dims).toEqual([1, 15, 300]);
	expect(result?.values).toHaveLength(300);
	expect(result?.values[0]).toBeLessThan(0);
	expect(result?.values[299]).toBeGreaterThan(0);
	await model.dispose();
	expect(release).toHaveBeenCalled();
});

test("rejects windows outside the immutable model contract", async () => {
	const runtime = {
		Tensor: class {},
		InferenceSession: {
			create: jest.fn(async () => ({ run: jest.fn(), release: jest.fn() })),
		},
	};
	const model = createMcdWaveformReconstructor({
		modelUrl: "/model.onnx",
		runtimeImporter: async () => runtime as never,
	});
	await model.init();
	await expect(model.reconstruct(window("wrong-profile"))).rejects.toThrow(
		"does not match",
	);
	expect(MCD_WAVEFORM_MODEL_MANIFEST_V1.status).toBe("diagnostic");
	expect(MCD_WAVEFORM_MODEL_MANIFEST_V1.input.channels).toEqual(
		MCD_WAVEFORM_CHANNELS,
	);
	expect(Object.isFrozen(MCD_WAVEFORM_MODEL_MANIFEST_V1.input.channels)).toBe(
		true,
	);
});
