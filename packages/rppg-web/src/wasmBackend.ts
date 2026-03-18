export type WasmModule = {
	RppgPipeline?: any;
	WasmRppgPipeline?: any; // legacy constructor name
	default?: any;
};

export type Backend = {
	newPipeline: (sampleRate: number, windowSec: number) => any;
};

type WasmImporter = (url: string) => Promise<WasmModule>;

async function defaultImporter(url: string): Promise<WasmModule> {
	return import(/* @vite-ignore */ url);
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
	options: { strict?: boolean } = {},
): Promise<Backend | null> {
	const candidates = [
		"/pkg/rppg_wasm.js",
		"/pkg/eeg_wasm.js",
		"/rppg_wasm.js",
		"/eeg_wasm.js",
	];
	let lastError: unknown = undefined;
	for (const url of candidates) {
		try {
			const mod: WasmModule = await importer(url);
			// wasm-bindgen bundles export a default init function; call it before using constructors.
			if (typeof mod.default === "function") {
				await mod.default();
			}
			const Constructor =
				mod.RppgPipeline ??
				mod.WasmRppgPipeline ??
				mod.default?.RppgPipeline ??
				mod.default?.WasmRppgPipeline;
			if (Constructor) {
				return {
					newPipeline: (sr: number, ws: number) => new Constructor(sr, ws),
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
