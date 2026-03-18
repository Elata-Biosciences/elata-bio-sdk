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

export async function initEegWasm(
	moduleOrPath?: EegWasmInitOptions | InitInput | Promise<InitInput>,
): Promise<InitOutput> {
	if (!initPromise) {
		initPromise = initWasm(normalizeInitEegWasmInput(moduleOrPath));
	}
	return initPromise;
}

export function initEegWasmSync(
	module: EegWasmSyncInitOptions | SyncInitInput,
): InitOutput {
	return initSyncWasm(normalizeInitEegWasmSyncInput(module));
}

export type EegWebRppgPipeline = {
	push_sample(timestampMs: bigint | number, intensity: number): void;
	get_metrics(): string;
	free(): void;
};

export function createRppgPipeline(
	sampleRate: number,
	windowSec: number,
): EegWebRppgPipeline {
	const Constructor =
		(wasm as any).WasmRppgPipeline ?? (wasm as any).RppgPipeline;
	if (typeof Constructor !== "function") {
		throw new Error("rPPG pipeline constructor is not available in eeg-web.");
	}
	const instance = new Constructor(sampleRate, windowSec);
	const prototypeCandidates = [
		(wasm as any).WasmRppgPipeline?.prototype,
		(wasm as any).RppgPipeline?.prototype,
	];
	if (
		typeof instance?.push_sample !== "function" ||
		typeof instance?.get_metrics !== "function"
	) {
		for (const prototype of prototypeCandidates) {
			if (!prototype) continue;
			Object.setPrototypeOf(instance, prototype);
			if (
				typeof instance?.push_sample === "function" &&
				typeof instance?.get_metrics === "function"
			) {
				break;
			}
		}
	}
	if (
		typeof instance?.push_sample !== "function" ||
		typeof instance?.get_metrics !== "function"
	) {
		throw new Error("Unable to normalize the eeg-web rPPG pipeline export.");
	}
	return instance as EegWebRppgPipeline;
}

export type { InitInput, InitOutput };
export * from "./headband";
export * from "./errors";

// Compatibility export for advanced/debug use. Prefer the wrapper helpers above
// in app code so consumers stay on the normalized init and pipeline paths.
export * from "../wasm/eeg_wasm.js";
export { wasm };
