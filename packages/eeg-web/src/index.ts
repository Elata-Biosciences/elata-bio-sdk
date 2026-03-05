import initWasm, { initSync as initSyncWasm } from "../wasm/eeg_wasm.js";
import * as wasm from "../wasm/eeg_wasm.js";
import type { InitInput, InitOutput } from "../wasm/eeg_wasm.js";

let initPromise: Promise<InitOutput> | null = null;

export async function initEegWasm(moduleOrPath?: InitInput | Promise<InitInput>): Promise<InitOutput> {
  if (!initPromise) {
    initPromise = initWasm(moduleOrPath);
  }
  return initPromise;
}

export function initEegWasmSync(module: { module: InitInput } | InitInput): InitOutput {
  return initSyncWasm(module);
}

export type { InitInput, InitOutput };
export * from "./headband";

export * from "../wasm/eeg_wasm.js";
export { wasm };
