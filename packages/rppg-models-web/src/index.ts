import {
	MCD_WAVEFORM_CHANNELS,
	type WaveformFeatureWindowV1,
	type WaveformModelManifestV1,
	type WaveformReconstructionV1,
	type WaveformReconstructor,
} from "@elata-biosciences/rppg-web";

export const MCD_WAVEFORM_MODEL_MANIFEST_V1: WaveformModelManifestV1 =
	Object.freeze({
		schema: "elata.rppg.waveform-model/v1",
		id: "rppg-waveform-mcd-proxy-v1",
		version: "1",
		status: "diagnostic",
		input: Object.freeze({
			profileId: "mcd-proxy-input-v1",
			channels: Object.freeze([...MCD_WAVEFORM_CHANNELS]),
			length: 300,
			normalization: "per-channel-linear-resample-zscore-dynamic-roi-weight",
		}),
		output: Object.freeze({ kind: "normalized-waveform", length: 300 }),
		hashes: Object.freeze({
			modelSha256:
				"2d56ed5a25a15b9e135c75d6658d71d696106484e87c86303182736428723635",
			metadataSha256:
				"e9a8a25c56041c175f645dd3666d1badff86c7007bc7ae0e27314c800af1ad31",
		}),
		runtime: Object.freeze({ engine: "onnxruntime-web", opset: 17 }),
	});

export const MCD_WAVEFORM_MODEL_CARD_V1 = {
	status: "diagnostic_only",
	claim:
		"MCD-validated browser-feasible morphology proxy; not live browser or contact-PPG ground truth.",
	inputShape: [1, 15, 300] as const,
	outputShape: [1, 1, 300] as const,
	heldOutMcd: {
		meanCorrelation: 0.652469,
		meanNrmse: 0.79092,
		dominantBpmMae: 5.393514,
	},
	notFor: [
		"replacing deterministic or Bayesian BPM",
		"clinical interpretation",
		"blood pressure or vascular claims",
	],
} as const;

type OrtModule = typeof import("onnxruntime-web");

export function createMcdWaveformReconstructor(options: {
	modelUrl: string;
	runtimeImporter?: () => Promise<OrtModule>;
}): WaveformReconstructor {
	let runtime: OrtModule | null = null;
	let session: Awaited<
		ReturnType<OrtModule["InferenceSession"]["create"]>
	> | null = null;

	return {
		manifest: MCD_WAVEFORM_MODEL_MANIFEST_V1,
		async init(signal) {
			if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
			runtime = await (options.runtimeImporter?.() ??
				import("onnxruntime-web"));
			session = await runtime.InferenceSession.create(options.modelUrl, {
				executionProviders: ["wasm"],
			});
		},
		async reconstruct(window, signal) {
			if (!runtime || !session) throw new Error("Model is not initialized");
			validateWindow(window);
			if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
			const tensor = new runtime.Tensor("float32", window.data, [1, 15, 300]);
			const output = await session.run({ input: tensor });
			const raw = output.reconstructed?.data;
			if (!raw || raw.length !== 300) {
				throw new Error("Unexpected reconstructed waveform tensor");
			}
			return reconstruction(
				window,
				Float32Array.from(raw as ArrayLike<number>),
			);
		},
		async dispose() {
			await session?.release();
			session = null;
			runtime = null;
		},
	};
}

function validateWindow(window: WaveformFeatureWindowV1): void {
	const expected = MCD_WAVEFORM_MODEL_MANIFEST_V1.input;
	if (
		window.profileId !== expected.profileId ||
		window.length !== expected.length ||
		window.data.length !== expected.channels.length * expected.length ||
		window.channels.length !== expected.channels.length ||
		window.channels.some(
			(channel, index) => channel !== expected.channels[index],
		)
	) {
		throw new Error("Waveform window does not match the model manifest");
	}
}

function reconstruction(
	window: WaveformFeatureWindowV1,
	values: Float32Array,
): WaveformReconstructionV1 {
	const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
	const std = Math.sqrt(
		values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length,
	);
	return {
		schema: "elata.rppg.waveform-reconstruction/v1",
		modelId: MCD_WAVEFORM_MODEL_MANIFEST_V1.id,
		startTimeMs: window.startTimeMs,
		endTimeMs: window.endTimeMs,
		sampleRate: window.sourceSampleRate,
		values: Float32Array.from(values, (value) =>
			std > 1e-8 ? (value - mean) / std : 0,
		),
		reliability: null,
	};
}
