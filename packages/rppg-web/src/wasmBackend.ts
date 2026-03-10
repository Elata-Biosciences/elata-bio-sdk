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

// Try to dynamically import the wasm JS bundle from a few common locations
export async function loadWasmBackend(
	importer: WasmImporter = defaultImporter,
): Promise<Backend | null> {
	const candidates = [
		"/pkg/rppg_wasm.js",
		"/pkg/eeg_wasm.js",
		"/rppg_wasm.js",
		"/eeg_wasm.js",
	];
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
			// ignore and try next
		}
	}
	return null;
}
