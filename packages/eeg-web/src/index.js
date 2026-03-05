import initWasm, { initSync as initSyncWasm } from "../wasm/eeg_wasm.js";
import * as wasm from "../wasm/eeg_wasm.js";
let initPromise = null;
export async function initEegWasm(moduleOrPath) {
    if (!initPromise) {
        initPromise = initWasm(moduleOrPath);
    }
    return initPromise;
}
export function initEegWasmSync(module) {
    return initSyncWasm(module);
}
export * from "./headband";
export * from "../wasm/eeg_wasm.js";
export { wasm };
