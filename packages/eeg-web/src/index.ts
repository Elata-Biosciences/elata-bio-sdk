/**
 * Elata EEG WebAssembly bindings for the browser: WASM init, headband frame types,
 * and transport-facing helpers. Prefer `initEegWasm` / `initEegWasmSync` over
 * importing the raw wasm module directly.
 */
import initWasm, { initSync as initSyncWasm } from "../wasm/eeg_wasm.js";
import * as wasm from "../wasm/eeg_wasm.js";
import type {
	InitInput,
	InitOutput,
	SyncInitInput,
} from "../wasm/eeg_wasm.js";

let initPromise: Promise<InitOutput> | null = null;

type EegWasmInitOptions = {
	module_or_path: InitInput | Promise<InitInput>;
};

type EegWasmSyncInitOptions = {
	module: SyncInitInput;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return (
		value !== null &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function normalizeInitEegWasmInput(
	moduleOrPath?: EegWasmInitOptions | InitInput | Promise<InitInput>,
): EegWasmInitOptions | undefined {
	if (moduleOrPath === undefined) return undefined;
	if (isPlainObject(moduleOrPath) && "module_or_path" in moduleOrPath) {
		return moduleOrPath as EegWasmInitOptions;
	}
	return { module_or_path: moduleOrPath as InitInput | Promise<InitInput> };
}

function normalizeInitEegWasmSyncInput(
	module: EegWasmSyncInitOptions | SyncInitInput,
): EegWasmSyncInitOptions {
	if (isPlainObject(module) && "module" in module) {
		return module as EegWasmSyncInitOptions;
	}
	return { module };
}

/**
 * Loads and initializes the EEG WASM module once (singleton). Pass a URL string,
 * `fetch` Response, or `{ module_or_path }` as required by your bundler’s asset
 * handling.
 */
export async function initEegWasm(
	moduleOrPath?: EegWasmInitOptions | InitInput | Promise<InitInput>,
): Promise<InitOutput> {
	if (!initPromise) {
		initPromise = initWasm(normalizeInitEegWasmInput(moduleOrPath));
	}
	return initPromise;
}

/**
 * Synchronous WASM init when the module bytes are already available (e.g. inlined
 * `ArrayBuffer`). Prefer {@link initEegWasm} for typical app bundling.
 */
export function initEegWasmSync(
	module: EegWasmSyncInitOptions | SyncInitInput,
): InitOutput {
	return initSyncWasm(normalizeInitEegWasmSyncInput(module));
}

export type { InitInput, InitOutput };
export * from "./headband";
export * from "./errors";

// Compatibility export for advanced/debug use. Prefer the wrapper helpers above
// in app code so consumers stay on the normalized init and pipeline paths.
export * from "../wasm/eeg_wasm.js";
export { wasm };
