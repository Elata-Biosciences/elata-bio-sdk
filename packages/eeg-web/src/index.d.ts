import * as wasm from "../wasm/eeg_wasm.js";
import type { InitInput, InitOutput } from "../wasm/eeg_wasm.js";
export declare function initEegWasm(moduleOrPath?: InitInput | Promise<InitInput>): Promise<InitOutput>;
export declare function initEegWasmSync(module: {
    module: InitInput;
} | InitInput): InitOutput;
export type { InitInput, InitOutput };
export * from "./headband";
export * from "../wasm/eeg_wasm.js";
export { wasm };
//# sourceMappingURL=index.d.ts.map