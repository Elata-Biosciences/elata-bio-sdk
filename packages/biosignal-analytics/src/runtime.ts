/**
 * WASM runtime singleton (clone of eeg-web's `initEegWasm` pattern): static
 * import of the web-target glue so bundlers and module workers resolve it
 * without URL probing, plus an idempotent init promise.
 */

import initWasm, {
	initSync as initSyncWasm,
	WasmEegWindowAnalyzer,
} from "../wasm/biosignal_features_wasm.js";
import type {
	InitInput,
	InitOutput,
	SyncInitInput,
} from "../wasm/biosignal_features_wasm.js";

let initPromise: Promise<InitOutput> | null = null;

type AnalyticsWasmInitOptions = {
	module_or_path: InitInput | Promise<InitInput>;
};

type AnalyticsWasmSyncInitOptions = {
	module: SyncInitInput;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return (
		value !== null &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function normalizeInitInput(
	moduleOrPath?: AnalyticsWasmInitOptions | InitInput | Promise<InitInput>,
): AnalyticsWasmInitOptions | undefined {
	if (moduleOrPath === undefined) return undefined;
	if (isPlainObject(moduleOrPath) && "module_or_path" in moduleOrPath) {
		return moduleOrPath as AnalyticsWasmInitOptions;
	}
	return { module_or_path: moduleOrPath as InitInput | Promise<InitInput> };
}

function normalizeSyncInitInput(
	module: AnalyticsWasmSyncInitOptions | SyncInitInput,
): AnalyticsWasmSyncInitOptions {
	if (isPlainObject(module) && "module" in module) {
		return module as AnalyticsWasmSyncInitOptions;
	}
	return { module: module as SyncInitInput };
}

/**
 * Initialize the analytics WASM module exactly once. Subsequent calls return
 * the same promise. Pass bytes (`fs.readFileSync(...)`), a URL, a Response,
 * or a compiled module; omit to use the glue's default URL discovery
 * (bundler-resolved relative to the glue file).
 */
export async function initAnalyticsWasm(
	moduleOrPath?: AnalyticsWasmInitOptions | InitInput | Promise<InitInput>,
): Promise<InitOutput> {
	if (!initPromise) {
		initPromise = initWasm(normalizeInitInput(moduleOrPath));
	}
	return initPromise;
}

/** Synchronous variant (compiled module / bytes already in hand). */
export function initAnalyticsWasmSync(
	module: AnalyticsWasmSyncInitOptions | SyncInitInput,
): InitOutput {
	return initSyncWasm(normalizeSyncInitInput(module));
}

/** True once `initAnalyticsWasm` has been called (init may still be pending). */
export function isAnalyticsWasmInitStarted(): boolean {
	return initPromise !== null;
}

/** Minimal surface of the raw wasm analyzer object. */
export interface RawEegWindowAnalyzer {
	analyze_window(interleaved: Float32Array): string;
	update_layout(sampleRateHz: number, channelCount: number): void;
	config_id(): string;
	free(): void;
}

/**
 * Construct the raw wasm analyzer. `initAnalyticsWasm` must have resolved
 * first (the higher-level `EegWindowFeatureExtractor` handles that for you).
 */
export function createEegWindowAnalyzerRaw(
	sampleRateHz: number,
	channelCount: number,
	configJson?: string,
): RawEegWindowAnalyzer {
	return new WasmEegWindowAnalyzer(
		sampleRateHz,
		channelCount,
		configJson ?? null,
	);
}
