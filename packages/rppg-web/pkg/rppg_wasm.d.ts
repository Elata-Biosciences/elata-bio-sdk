/* tslint:disable */
/* eslint-disable */

export class WasmRppgPipeline {
    free(): void;
    [Symbol.dispose](): void;
    enable_tracker(min_bpm: number, max_bpm: number, num_particles: number): void;
    get_metrics(): string;
    constructor(sample_rate: number, window_sec: number);
    push_sample(timestamp_ms: bigint, intensity: number): void;
    push_sample_rgb(timestamp_ms: bigint, r: number, g: number, b: number, skin_ratio: number): void;
    push_sample_rgb_meta(timestamp_ms: bigint, r: number, g: number, b: number, skin_ratio: number, motion: number, clip: number): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmrppgpipeline_free: (a: number, b: number) => void;
    readonly wasmrppgpipeline_enable_tracker: (a: number, b: number, c: number, d: number) => void;
    readonly wasmrppgpipeline_get_metrics: (a: number) => [number, number];
    readonly wasmrppgpipeline_new: (a: number, b: number) => number;
    readonly wasmrppgpipeline_push_sample: (a: number, b: bigint, c: number) => void;
    readonly wasmrppgpipeline_push_sample_rgb: (a: number, b: bigint, c: number, d: number, e: number, f: number) => void;
    readonly wasmrppgpipeline_push_sample_rgb_meta: (a: number, b: bigint, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
