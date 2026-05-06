/* tslint:disable */
/* eslint-disable */

export class AthenaWasmDecoder {
    free(): void;
    [Symbol.dispose](): void;
    decode(payload: Uint8Array): AthenaWasmOutput;
    constructor();
    reset(): void;
    set_clock_kind(kind: string): void;
    set_max_buffer_frames(max_frames: number): void;
    set_reorder_window_ms(window_ms: number): void;
    set_use_device_timestamps(enabled: boolean): void;
}

export class AthenaWasmOutput {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly accgyro_samples: Float32Array;
    readonly accgyro_timestamps_ms: Float64Array;
    readonly battery_samples: Float32Array;
    readonly battery_timestamps_ms: Float64Array;
    readonly eeg_channel_count: number;
    readonly eeg_samples: Float32Array;
    readonly eeg_timestamps_ms: Float64Array;
    readonly optics_channel_count: number;
    readonly optics_samples: Float32Array;
    readonly optics_timestamps_ms: Float64Array;
}

/**
 * Standard EEG band definitions (for reference)
 */
export class EegBands {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Alpha band: 8-13 Hz (relaxed, eyes closed)
     */
    static readonly alpha: Float32Array;
    /**
     * Beta band: 13-30 Hz (active thinking, focus)
     */
    static readonly beta: Float32Array;
    /**
     * Delta band: 0.5-4 Hz (deep sleep)
     */
    static readonly delta: Float32Array;
    /**
     * Gamma band: 30-100 Hz (high-level cognition)
     */
    static readonly gamma: Float32Array;
    /**
     * Theta band: 4-8 Hz (drowsiness, meditation)
     */
    static readonly theta: Float32Array;
}

/**
 * WASM wrapper for the Alpha Bump Detector
 * Detects transitions between relaxed (eyes closed, high alpha)
 * and alert (eyes open, low alpha) states
 */
export class WasmAlphaBumpDetector {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get minimum samples required
     */
    min_samples(): number;
    /**
     * Get the model name
     */
    name(): string;
    /**
     * Create a new alpha bump detector
     *
     * # Arguments
     * * `sample_rate` - Sample rate in Hz (e.g., 256)
     * * `channel_count` - Number of EEG channels
     */
    constructor(sample_rate: number, channel_count: number);
    /**
     * Process EEG data and detect alpha state
     *
     * # Arguments
     * * `data` - Float32Array of interleaved EEG samples
     *           Format: [s0_ch0, s0_ch1, ..., s1_ch0, s1_ch1, ...]
     *
     * # Returns
     * WasmAlphaBumpResult with current state and metrics
     */
    process(data: Float32Array): WasmAlphaBumpResult | undefined;
    /**
     * Reset the detector state
     */
    reset(): void;
    /**
     * Set the baseline smoothing factor (0-1)
     * Lower values = slower adaptation = more stable baseline
     */
    set_baseline_smoothing(alpha: number): void;
    /**
     * Set the threshold multiplier for state detection (default 1.5)
     * Higher values require larger changes to detect transitions
     */
    set_threshold(multiplier: number): void;
}

/**
 * Result from the alpha bump detector
 */
export class WasmAlphaBumpResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Is this a "high alpha" (relaxed/eyes closed) state?
     */
    is_high(): boolean;
    /**
     * Is this a "low alpha" (alert/eyes open) state?
     */
    is_low(): boolean;
    /**
     * Current alpha power level
     */
    readonly alpha_power: number;
    /**
     * Running baseline alpha power
     */
    readonly baseline: number;
    /**
     * Previous state if changed
     */
    readonly previous_state: string | undefined;
    /**
     * Current alpha state: "high", "low", "transitioning", or "unknown"
     */
    readonly state: string;
    /**
     * Whether state changed in this update
     */
    readonly state_changed: boolean;
}

/**
 * WASM wrapper for the Alpha Peak Model
 * Finds the dominant frequency within the alpha band (8-13 Hz)
 */
export class WasmAlphaPeakModel {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get minimum samples required
     */
    min_samples(): number;
    /**
     * Get the model name
     */
    name(): string;
    /**
     * Create a new alpha peak model
     *
     * # Arguments
     * * `sample_rate` - Sample rate in Hz (e.g., 256)
     * * `channel_count` - Number of EEG channels
     */
    constructor(sample_rate: number, channel_count: number);
    /**
     * Process EEG data and compute alpha peak metrics
     *
     * # Arguments
     * * `data` - Float32Array of interleaved EEG samples
     *           Format: [s0_ch0, s0_ch1, ..., s1_ch0, s1_ch1, ...]
     *
     * # Returns
     * WasmAlphaPeakResult with peak frequency and metrics
     */
    process(data: Float32Array): WasmAlphaPeakResult | undefined;
    /**
     * Reset the model state
     */
    reset(): void;
    /**
     * Set the smoothing factor (0-1)
     * Higher values = faster response to changes
     */
    set_smoothing(alpha: number): void;
}

/**
 * Result from the alpha peak model
 */
export class WasmAlphaPeakResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Average power across the alpha band
     */
    readonly alpha_power: number;
    /**
     * Long-term peak frequency estimate (Hz)
     */
    readonly long_term_peak_frequency: number;
    /**
     * Peak frequency within the alpha band (Hz)
     */
    readonly peak_frequency: number;
    /**
     * Peak power at the alpha peak frequency
     */
    readonly peak_power: number;
    /**
     * Smoothed peak frequency within the alpha band (Hz)
     */
    readonly smoothed_peak_frequency: number;
    /**
     * Signal-to-noise ratio within the alpha band
     */
    readonly snr: number;
}

/**
 * Compute band powers from EEG signal data
 * Returns an object with delta, theta, alpha, beta, gamma powers
 */
export class WasmBandPowers {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get relative powers (each band as fraction of total).
     * Returns a new WASM-owned object — call `.free()` on it when done,
     * or use the `using` keyword (TypeScript 5.2+).
     */
    relative(): WasmBandPowers;
    readonly alpha: number;
    readonly beta: number;
    readonly delta: number;
    readonly gamma: number;
    readonly theta: number;
    readonly total: number;
}

/**
 * WASM wrapper for the Calmness Model
 * Computes a continuous calmness score based on EEG frequency ratios
 */
export class WasmCalmnessModel {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get minimum samples required
     */
    min_samples(): number;
    /**
     * Get the model name
     */
    name(): string;
    /**
     * Create a new calmness model
     *
     * # Arguments
     * * `sample_rate` - Sample rate in Hz (e.g., 256)
     * * `channel_count` - Number of EEG channels
     */
    constructor(sample_rate: number, channel_count: number);
    /**
     * Process EEG data and compute calmness score
     *
     * # Arguments
     * * `data` - Float32Array of interleaved EEG samples
     *           Format: [s0_ch0, s0_ch1, ..., s1_ch0, s1_ch1, ...]
     *
     * # Returns
     * `WasmCalmnessResult` once enough data has accumulated, or `undefined`
     * during the initial warm-up period. Call `min_samples()` to know the
     * required sample count before results are produced.
     */
    process(data: Float32Array): WasmCalmnessResult | undefined;
    /**
     * Reset the model state
     */
    reset(): void;
    /**
     * Set the smoothing factor (0-1)
     * Higher values = faster response to changes
     */
    set_smoothing(alpha: number): void;
}

/**
 * Result from the calmness model
 */
export class WasmCalmnessResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get calmness as percentage (0-100)
     */
    percentage(): number;
    /**
     * Get state description: "very calm", "calm", "neutral", or "alert"
     */
    state_description(): string;
    /**
     * Alpha/beta power ratio (primary calmness indicator)
     */
    readonly alpha_beta_ratio: number;
    /**
     * Alpha band power
     */
    readonly alpha_power: number;
    /**
     * Beta band power
     */
    readonly beta_power: number;
    /**
     * Raw calmness score (0.0 = alert, 1.0 = very calm)
     */
    readonly score: number;
    /**
     * Smoothed calmness score (less jittery)
     */
    readonly smoothed_score: number;
    /**
     * Theta power level
     */
    readonly theta_level: number;
    /**
     * Theta band power
     */
    readonly theta_power: number;
}

export class WasmEegPreprocessor {
    free(): void;
    [Symbol.dispose](): void;
    detrend_mode(): string;
    constructor(sample_rate_hz: number, channel_count: number, config_json?: string | null);
    notch_frequencies_hz(): Float32Array;
    process(data: Float32Array): Float32Array;
    reference_mode(): string;
    reset(): void;
    update_layout(sample_rate_hz: number, channel_count: number): void;
    readonly enabled: boolean;
    readonly preserve_raw: boolean;
}

/**
 * Compute power in the alpha band (8-13 Hz)
 */
export function alpha_power(data: Float32Array, sample_rate: number): number;

/**
 * Compute band powers for a single channel of EEG data
 *
 * # Arguments
 * * `data` - Single-channel EEG samples as Float32Array (microvolts).
 *            Must be Float32Array — passing a plain JS number[] will cause a
 *            runtime error. Convert with `new Float32Array(samples[channelIdx])`.
 * * `sample_rate` - Sample rate in Hz (e.g., 256)
 *
 * # Returns
 * WasmBandPowers object with power in each frequency band.
 * Call `.free()` when done (or use the `using` keyword in TypeScript 5.2+).
 */
export function band_powers(data: Float32Array, sample_rate: number): WasmBandPowers;

/**
 * Compute power in the beta band (13-30 Hz)
 */
export function beta_power(data: Float32Array, sample_rate: number): number;

/**
 * Compute the power spectrum of EEG data
 * Returns Float32Array of power values for each frequency bin
 */
export function compute_power_spectrum(data: Float32Array): Float32Array;

/**
 * Compute power in a custom frequency band
 *
 * # Arguments
 * * `data` - Float32Array of EEG samples
 * * `sample_rate` - Sample rate in Hz
 * * `low_freq` - Lower bound of frequency band (Hz)
 * * `high_freq` - Upper bound of frequency band (Hz)
 */
export function custom_band_power(data: Float32Array, sample_rate: number, low_freq: number, high_freq: number): number;

/**
 * Compute power in the delta band (0.5-4 Hz)
 */
export function delta_power(data: Float32Array, sample_rate: number): number;

/**
 * Compute power in the gamma band (30-100 Hz)
 */
export function gamma_power(data: Float32Array, sample_rate: number): number;

/**
 * Get frequency values corresponding to FFT bins
 *
 * # Arguments
 * * `n` - Number of samples (should match data length used in FFT)
 * * `sample_rate` - Sample rate in Hz
 */
export function get_fft_frequencies(n: number, sample_rate: number): Float32Array;

/**
 * Get the SDK version
 */
export function get_version(): string;

/**
 * Initialize the WASM module (call once at startup)
 */
export function init(): void;

/**
 * Compute power in the theta band (4-8 Hz)
 */
export function theta_power(data: Float32Array, sample_rate: number): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_athenawasmdecoder_free: (a: number, b: number) => void;
    readonly __wbg_athenawasmoutput_free: (a: number, b: number) => void;
    readonly athenawasmdecoder_decode: (a: number, b: number, c: number) => number;
    readonly athenawasmdecoder_new: () => number;
    readonly athenawasmdecoder_reset: (a: number) => void;
    readonly athenawasmdecoder_set_clock_kind: (a: number, b: number, c: number) => void;
    readonly athenawasmdecoder_set_max_buffer_frames: (a: number, b: number) => void;
    readonly athenawasmdecoder_set_reorder_window_ms: (a: number, b: number) => void;
    readonly athenawasmdecoder_set_use_device_timestamps: (a: number, b: number) => void;
    readonly athenawasmoutput_accgyro_samples: (a: number) => [number, number];
    readonly athenawasmoutput_accgyro_timestamps_ms: (a: number) => [number, number];
    readonly athenawasmoutput_battery_samples: (a: number) => [number, number];
    readonly athenawasmoutput_battery_timestamps_ms: (a: number) => [number, number];
    readonly athenawasmoutput_eeg_channel_count: (a: number) => number;
    readonly athenawasmoutput_eeg_samples: (a: number) => [number, number];
    readonly athenawasmoutput_eeg_timestamps_ms: (a: number) => [number, number];
    readonly athenawasmoutput_optics_channel_count: (a: number) => number;
    readonly athenawasmoutput_optics_samples: (a: number) => [number, number];
    readonly athenawasmoutput_optics_timestamps_ms: (a: number) => [number, number];
    readonly __wbg_wasmalphabumpdetector_free: (a: number, b: number) => void;
    readonly __wbg_wasmalphabumpresult_free: (a: number, b: number) => void;
    readonly __wbg_wasmalphapeakmodel_free: (a: number, b: number) => void;
    readonly __wbg_wasmalphapeakresult_free: (a: number, b: number) => void;
    readonly __wbg_wasmcalmnessmodel_free: (a: number, b: number) => void;
    readonly __wbg_wasmcalmnessresult_free: (a: number, b: number) => void;
    readonly wasmalphabumpdetector_min_samples: (a: number) => number;
    readonly wasmalphabumpdetector_name: (a: number) => [number, number];
    readonly wasmalphabumpdetector_new: (a: number, b: number) => number;
    readonly wasmalphabumpdetector_process: (a: number, b: number, c: number) => number;
    readonly wasmalphabumpdetector_reset: (a: number) => void;
    readonly wasmalphabumpdetector_set_baseline_smoothing: (a: number, b: number) => void;
    readonly wasmalphabumpdetector_set_threshold: (a: number, b: number) => void;
    readonly wasmalphabumpresult_alpha_power: (a: number) => number;
    readonly wasmalphabumpresult_baseline: (a: number) => number;
    readonly wasmalphabumpresult_is_high: (a: number) => number;
    readonly wasmalphabumpresult_is_low: (a: number) => number;
    readonly wasmalphabumpresult_previous_state: (a: number) => [number, number];
    readonly wasmalphabumpresult_state: (a: number) => [number, number];
    readonly wasmalphabumpresult_state_changed: (a: number) => number;
    readonly wasmalphapeakmodel_min_samples: (a: number) => number;
    readonly wasmalphapeakmodel_name: (a: number) => [number, number];
    readonly wasmalphapeakmodel_new: (a: number, b: number) => number;
    readonly wasmalphapeakmodel_process: (a: number, b: number, c: number) => number;
    readonly wasmalphapeakmodel_reset: (a: number) => void;
    readonly wasmalphapeakmodel_set_smoothing: (a: number, b: number) => void;
    readonly wasmalphapeakresult_alpha_power: (a: number) => number;
    readonly wasmalphapeakresult_long_term_peak_frequency: (a: number) => number;
    readonly wasmalphapeakresult_peak_frequency: (a: number) => number;
    readonly wasmalphapeakresult_peak_power: (a: number) => number;
    readonly wasmalphapeakresult_smoothed_peak_frequency: (a: number) => number;
    readonly wasmalphapeakresult_snr: (a: number) => number;
    readonly wasmcalmnessmodel_min_samples: (a: number) => number;
    readonly wasmcalmnessmodel_name: (a: number) => [number, number];
    readonly wasmcalmnessmodel_new: (a: number, b: number) => number;
    readonly wasmcalmnessmodel_process: (a: number, b: number, c: number) => number;
    readonly wasmcalmnessmodel_reset: (a: number) => void;
    readonly wasmcalmnessmodel_set_smoothing: (a: number, b: number) => void;
    readonly wasmcalmnessresult_alpha_beta_ratio: (a: number) => number;
    readonly wasmcalmnessresult_alpha_power: (a: number) => number;
    readonly wasmcalmnessresult_beta_power: (a: number) => number;
    readonly wasmcalmnessresult_percentage: (a: number) => number;
    readonly wasmcalmnessresult_score: (a: number) => number;
    readonly wasmcalmnessresult_smoothed_score: (a: number) => number;
    readonly wasmcalmnessresult_state_description: (a: number) => [number, number];
    readonly wasmcalmnessresult_theta_level: (a: number) => number;
    readonly wasmcalmnessresult_theta_power: (a: number) => number;
    readonly __wbg_wasmeegpreprocessor_free: (a: number, b: number) => void;
    readonly get_version: () => [number, number];
    readonly init: () => void;
    readonly wasmeegpreprocessor_detrend_mode: (a: number) => [number, number];
    readonly wasmeegpreprocessor_enabled: (a: number) => number;
    readonly wasmeegpreprocessor_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmeegpreprocessor_notch_frequencies_hz: (a: number) => [number, number];
    readonly wasmeegpreprocessor_preserve_raw: (a: number) => number;
    readonly wasmeegpreprocessor_process: (a: number, b: number, c: number) => [number, number];
    readonly wasmeegpreprocessor_reference_mode: (a: number) => [number, number];
    readonly wasmeegpreprocessor_reset: (a: number) => void;
    readonly wasmeegpreprocessor_update_layout: (a: number, b: number, c: number) => void;
    readonly __wbg_eegbands_free: (a: number, b: number) => void;
    readonly __wbg_wasmbandpowers_free: (a: number, b: number) => void;
    readonly alpha_power: (a: number, b: number, c: number) => number;
    readonly band_powers: (a: number, b: number, c: number) => number;
    readonly beta_power: (a: number, b: number, c: number) => number;
    readonly compute_power_spectrum: (a: number, b: number) => [number, number];
    readonly custom_band_power: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly delta_power: (a: number, b: number, c: number) => number;
    readonly eegbands_alpha: () => [number, number];
    readonly eegbands_beta: () => [number, number];
    readonly eegbands_delta: () => [number, number];
    readonly eegbands_gamma: () => [number, number];
    readonly eegbands_theta: () => [number, number];
    readonly gamma_power: (a: number, b: number, c: number) => number;
    readonly get_fft_frequencies: (a: number, b: number) => [number, number];
    readonly theta_power: (a: number, b: number, c: number) => number;
    readonly wasmbandpowers_alpha: (a: number) => number;
    readonly wasmbandpowers_beta: (a: number) => number;
    readonly wasmbandpowers_delta: (a: number) => number;
    readonly wasmbandpowers_gamma: (a: number) => number;
    readonly wasmbandpowers_relative: (a: number) => number;
    readonly wasmbandpowers_theta: (a: number) => number;
    readonly wasmbandpowers_total: (a: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
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
