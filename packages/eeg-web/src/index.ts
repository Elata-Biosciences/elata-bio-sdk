import initWasm, { initSync as initSyncWasm } from "../wasm/eeg_wasm.js";
import * as wasm from "../wasm/eeg_wasm.js";
import type { InitInput, InitOutput } from "../wasm/eeg_wasm.js";

let initPromise: Promise<InitOutput> | null = null;

export async function initEegWasm(
	moduleOrPath?: InitInput | Promise<InitInput>,
): Promise<InitOutput> {
	if (!initPromise) {
		initPromise = initWasm(moduleOrPath);
	}
	return initPromise;
}

export function initEegWasmSync(
	module: { module: InitInput } | InitInput,
): InitOutput {
	return initSyncWasm(module);
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
	const prototype = (wasm as any).WasmRppgPipeline?.prototype;
	if (
		prototype &&
		(typeof instance?.push_sample !== "function" ||
			typeof instance?.get_metrics !== "function")
	) {
		Object.setPrototypeOf(instance, prototype);
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

export * from "../wasm/eeg_wasm.js";
export { wasm };
