export type WasmModule = {
	RppgPipeline?: any;
	WasmRppgPipeline?: any; // legacy constructor name
	default?: any;
};

export type Backend = {
	newPipeline: (sampleRate: number, windowSec: number) => any;
};

export type WasmImporter = (url: string) => Promise<WasmModule>;

export type LoadWasmBackendOptions = {
	strict?: boolean;
	jsUrl?: string;
	binaryUrl?: string;
	candidateUrls?: string[];
};

async function defaultImporter(url: string): Promise<WasmModule> {
	return import(/* @vite-ignore */ url);
}

function hasPipelineMethods(value: unknown): boolean {
	if (!value || typeof value !== "object") return false;
	const pipeline = value as Record<string, unknown>;
	return (
		typeof pipeline.push_sample === "function" ||
		typeof pipeline.pushSample === "function" ||
		typeof pipeline.push_sample_rgb === "function" ||
		typeof pipeline.pushSampleRgb === "function" ||
		typeof pipeline.push_sample_rgb_meta === "function" ||
		typeof pipeline.pushSampleRgbMeta === "function"
	) &&
		(typeof pipeline.get_metrics === "function" ||
			typeof pipeline.getMetrics === "function");
}

function normalizePipelineInstance(
	instance: unknown,
	module: WasmModule,
): unknown {
	if (hasPipelineMethods(instance)) return instance;
	if (!instance || typeof instance !== "object") return instance;

	const prototypeCandidates = [
		module.WasmRppgPipeline?.prototype,
		module.RppgPipeline?.prototype,
	];
	for (const prototype of prototypeCandidates) {
		if (
			prototype &&
			(hasPipelineMethods(prototype) || typeof prototype.free === "function")
		) {
			Object.setPrototypeOf(instance, prototype);
			if (hasPipelineMethods(instance)) {
				return instance;
			}
		}
	}
	return instance;
}

function createNormalizedPipelineFactory(
	module: WasmModule,
	Constructor: new (sampleRate: number, windowSec: number) => unknown,
) {
	return (sampleRate: number, windowSec: number) =>
		normalizePipelineInstance(new Constructor(sampleRate, windowSec), module);
}

export class RppgWasmLoadError extends Error {
	public readonly code = "RPPG_WASM_LOAD_FAILED";
	public readonly attemptedUrls: string[];
	public readonly lastError?: unknown;

	constructor(attemptedUrls: string[], lastError?: unknown) {
		super(
			`Unable to load rPPG WASM backend. Tried: ${attemptedUrls.join(
				", ",
			)}. Set up the bundle so one of these URLs resolves.`,
		);
		this.name = "RppgWasmLoadError";
		this.attemptedUrls = attemptedUrls;
		this.lastError = lastError;
	}
}

// Try to dynamically import the wasm JS bundle from a few common locations
export async function loadWasmBackend(
	importer: WasmImporter = defaultImporter,
	options: LoadWasmBackendOptions = {},
): Promise<Backend | null> {
	const candidates = options.jsUrl
		? [options.jsUrl]
		: options.candidateUrls && options.candidateUrls.length > 0
			? options.candidateUrls
			: [
					"/pkg/rppg_wasm.js",
					"/rppg_wasm.js",
				];
	let lastError: unknown = undefined;
	for (const url of candidates) {
		try {
			const mod: WasmModule = await importer(url);
			// wasm-bindgen bundles export a default init function; call it before using constructors.
			if (typeof mod.default === "function") {
				if (options.binaryUrl) {
					await mod.default(options.binaryUrl);
				} else {
					await mod.default();
				}
			}
			const Constructor =
				mod.RppgPipeline ??
				mod.WasmRppgPipeline ??
				mod.default?.RppgPipeline ??
				mod.default?.WasmRppgPipeline;
			if (Constructor) {
				return {
					newPipeline: createNormalizedPipelineFactory(
						mod,
						Constructor as new (
							sampleRate: number,
							windowSec: number,
						) => unknown,
					),
				};
			}

			// Some bundles expose constructor directly as default
			if (mod.default && typeof mod.default === "function") {
				return {
					newPipeline: (sr: number, ws: number) =>
						new (mod.default as any)(sr, ws),
				};
			}
		} catch (e) {
			lastError = e;
		}
	}
	if (options.strict) {
		throw new RppgWasmLoadError(candidates, lastError);
	}
	return null;
}

export function createUnavailableBackend(): Backend {
	return {
		newPipeline: () => ({
			push_sample: () => {},
			get_metrics: () => ({ bpm: null, confidence: 0, signal_quality: 0 }),
		}),
	};
}
