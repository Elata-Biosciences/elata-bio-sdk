/* @ts-self-types="./eeg_wasm.d.ts" */

export class AthenaWasmDecoder {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AthenaWasmDecoderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_athenawasmdecoder_free(ptr, 0);
    }
    /**
     * @param {Uint8Array} payload
     * @returns {AthenaWasmOutput}
     */
    decode(payload) {
        const ptr0 = passArray8ToWasm0(payload, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.athenawasmdecoder_decode(this.__wbg_ptr, ptr0, len0);
        return AthenaWasmOutput.__wrap(ret);
    }
    constructor() {
        const ret = wasm.athenawasmdecoder_new();
        this.__wbg_ptr = ret >>> 0;
        AthenaWasmDecoderFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    reset() {
        wasm.athenawasmdecoder_reset(this.__wbg_ptr);
    }
    /**
     * @param {string} kind
     */
    set_clock_kind(kind) {
        const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.athenawasmdecoder_set_clock_kind(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} max_frames
     */
    set_max_buffer_frames(max_frames) {
        wasm.athenawasmdecoder_set_max_buffer_frames(this.__wbg_ptr, max_frames);
    }
    /**
     * @param {number} window_ms
     */
    set_reorder_window_ms(window_ms) {
        wasm.athenawasmdecoder_set_reorder_window_ms(this.__wbg_ptr, window_ms);
    }
    /**
     * @param {boolean} enabled
     */
    set_use_device_timestamps(enabled) {
        wasm.athenawasmdecoder_set_use_device_timestamps(this.__wbg_ptr, enabled);
    }
}
if (Symbol.dispose) AthenaWasmDecoder.prototype[Symbol.dispose] = AthenaWasmDecoder.prototype.free;

export class AthenaWasmOutput {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(AthenaWasmOutput.prototype);
        obj.__wbg_ptr = ptr;
        AthenaWasmOutputFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AthenaWasmOutputFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_athenawasmoutput_free(ptr, 0);
    }
    /**
     * @returns {Float32Array}
     */
    get accgyro_samples() {
        const ret = wasm.athenawasmoutput_accgyro_samples(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    get accgyro_timestamps_ms() {
        const ret = wasm.athenawasmoutput_accgyro_timestamps_ms(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Float32Array}
     */
    get battery_samples() {
        const ret = wasm.athenawasmoutput_battery_samples(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    get battery_timestamps_ms() {
        const ret = wasm.athenawasmoutput_battery_timestamps_ms(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {number}
     */
    get eeg_channel_count() {
        const ret = wasm.athenawasmoutput_eeg_channel_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Float32Array}
     */
    get eeg_samples() {
        const ret = wasm.athenawasmoutput_eeg_samples(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    get eeg_timestamps_ms() {
        const ret = wasm.athenawasmoutput_eeg_timestamps_ms(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {number}
     */
    get optics_channel_count() {
        const ret = wasm.athenawasmoutput_optics_channel_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Float32Array}
     */
    get optics_samples() {
        const ret = wasm.athenawasmoutput_optics_samples(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    get optics_timestamps_ms() {
        const ret = wasm.athenawasmoutput_optics_timestamps_ms(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
}
if (Symbol.dispose) AthenaWasmOutput.prototype[Symbol.dispose] = AthenaWasmOutput.prototype.free;

/**
 * Standard EEG band definitions (for reference)
 */
export class EegBands {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        EegBandsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_eegbands_free(ptr, 0);
    }
    /**
     * Alpha band: 8-13 Hz (relaxed, eyes closed)
     * @returns {Float32Array}
     */
    static get alpha() {
        const ret = wasm.eegbands_alpha();
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Beta band: 13-30 Hz (active thinking, focus)
     * @returns {Float32Array}
     */
    static get beta() {
        const ret = wasm.eegbands_beta();
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Delta band: 0.5-4 Hz (deep sleep)
     * @returns {Float32Array}
     */
    static get delta() {
        const ret = wasm.eegbands_delta();
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Gamma band: 30-100 Hz (high-level cognition)
     * @returns {Float32Array}
     */
    static get gamma() {
        const ret = wasm.eegbands_gamma();
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Theta band: 4-8 Hz (drowsiness, meditation)
     * @returns {Float32Array}
     */
    static get theta() {
        const ret = wasm.eegbands_theta();
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
}
if (Symbol.dispose) EegBands.prototype[Symbol.dispose] = EegBands.prototype.free;

/**
 * WASM wrapper for the Alpha Bump Detector
 * Detects transitions between relaxed (eyes closed, high alpha)
 * and alert (eyes open, low alpha) states
 */
export class WasmAlphaBumpDetector {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmAlphaBumpDetectorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmalphabumpdetector_free(ptr, 0);
    }
    /**
     * Get minimum samples required
     * @returns {number}
     */
    min_samples() {
        const ret = wasm.wasmalphabumpdetector_min_samples(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get the model name
     * @returns {string}
     */
    name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmalphabumpdetector_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Create a new alpha bump detector
     *
     * # Arguments
     * * `sample_rate` - Sample rate in Hz (e.g., 256)
     * * `channel_count` - Number of EEG channels
     * @param {number} sample_rate
     * @param {number} channel_count
     */
    constructor(sample_rate, channel_count) {
        const ret = wasm.wasmalphabumpdetector_new(sample_rate, channel_count);
        this.__wbg_ptr = ret >>> 0;
        WasmAlphaBumpDetectorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Process EEG data and detect alpha state
     *
     * # Arguments
     * * `data` - Float32Array of interleaved EEG samples
     *           Format: [s0_ch0, s0_ch1, ..., s1_ch0, s1_ch1, ...]
     *
     * # Returns
     * WasmAlphaBumpResult with current state and metrics
     * @param {Float32Array} data
     * @returns {WasmAlphaBumpResult | undefined}
     */
    process(data) {
        const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmalphabumpdetector_process(this.__wbg_ptr, ptr0, len0);
        return ret === 0 ? undefined : WasmAlphaBumpResult.__wrap(ret);
    }
    /**
     * Reset the detector state
     */
    reset() {
        wasm.wasmalphabumpdetector_reset(this.__wbg_ptr);
    }
    /**
     * Set the baseline smoothing factor (0-1)
     * Lower values = slower adaptation = more stable baseline
     * @param {number} alpha
     */
    set_baseline_smoothing(alpha) {
        wasm.wasmalphabumpdetector_set_baseline_smoothing(this.__wbg_ptr, alpha);
    }
    /**
     * Set the threshold multiplier for state detection (default 1.5)
     * Higher values require larger changes to detect transitions
     * @param {number} multiplier
     */
    set_threshold(multiplier) {
        wasm.wasmalphabumpdetector_set_threshold(this.__wbg_ptr, multiplier);
    }
}
if (Symbol.dispose) WasmAlphaBumpDetector.prototype[Symbol.dispose] = WasmAlphaBumpDetector.prototype.free;

/**
 * Result from the alpha bump detector
 */
export class WasmAlphaBumpResult {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmAlphaBumpResult.prototype);
        obj.__wbg_ptr = ptr;
        WasmAlphaBumpResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmAlphaBumpResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmalphabumpresult_free(ptr, 0);
    }
    /**
     * Current alpha power level
     * @returns {number}
     */
    get alpha_power() {
        const ret = wasm.wasmalphabumpresult_alpha_power(this.__wbg_ptr);
        return ret;
    }
    /**
     * Running baseline alpha power
     * @returns {number}
     */
    get baseline() {
        const ret = wasm.wasmalphabumpresult_baseline(this.__wbg_ptr);
        return ret;
    }
    /**
     * Is this a "high alpha" (relaxed/eyes closed) state?
     * @returns {boolean}
     */
    is_high() {
        const ret = wasm.wasmalphabumpresult_is_high(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Is this a "low alpha" (alert/eyes open) state?
     * @returns {boolean}
     */
    is_low() {
        const ret = wasm.wasmalphabumpresult_is_low(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Previous state if changed
     * @returns {string | undefined}
     */
    get previous_state() {
        const ret = wasm.wasmalphabumpresult_previous_state(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Current alpha state: "high", "low", "transitioning", or "unknown"
     * @returns {string}
     */
    get state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmalphabumpresult_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Whether state changed in this update
     * @returns {boolean}
     */
    get state_changed() {
        const ret = wasm.wasmalphabumpresult_state_changed(this.__wbg_ptr);
        return ret !== 0;
    }
}
if (Symbol.dispose) WasmAlphaBumpResult.prototype[Symbol.dispose] = WasmAlphaBumpResult.prototype.free;

/**
 * WASM wrapper for the Alpha Peak Model
 * Finds the dominant frequency within the alpha band (8-13 Hz)
 */
export class WasmAlphaPeakModel {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmAlphaPeakModelFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmalphapeakmodel_free(ptr, 0);
    }
    /**
     * Get minimum samples required
     * @returns {number}
     */
    min_samples() {
        const ret = wasm.wasmalphapeakmodel_min_samples(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get the model name
     * @returns {string}
     */
    name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmalphapeakmodel_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Create a new alpha peak model
     *
     * # Arguments
     * * `sample_rate` - Sample rate in Hz (e.g., 256)
     * * `channel_count` - Number of EEG channels
     * @param {number} sample_rate
     * @param {number} channel_count
     */
    constructor(sample_rate, channel_count) {
        const ret = wasm.wasmalphapeakmodel_new(sample_rate, channel_count);
        this.__wbg_ptr = ret >>> 0;
        WasmAlphaPeakModelFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Process EEG data and compute alpha peak metrics
     *
     * # Arguments
     * * `data` - Float32Array of interleaved EEG samples
     *           Format: [s0_ch0, s0_ch1, ..., s1_ch0, s1_ch1, ...]
     *
     * # Returns
     * WasmAlphaPeakResult with peak frequency and metrics
     * @param {Float32Array} data
     * @returns {WasmAlphaPeakResult | undefined}
     */
    process(data) {
        const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmalphapeakmodel_process(this.__wbg_ptr, ptr0, len0);
        return ret === 0 ? undefined : WasmAlphaPeakResult.__wrap(ret);
    }
    /**
     * Reset the model state
     */
    reset() {
        wasm.wasmalphapeakmodel_reset(this.__wbg_ptr);
    }
    /**
     * Set the smoothing factor (0-1)
     * Higher values = faster response to changes
     * @param {number} alpha
     */
    set_smoothing(alpha) {
        wasm.wasmalphapeakmodel_set_smoothing(this.__wbg_ptr, alpha);
    }
}
if (Symbol.dispose) WasmAlphaPeakModel.prototype[Symbol.dispose] = WasmAlphaPeakModel.prototype.free;

/**
 * Result from the alpha peak model
 */
export class WasmAlphaPeakResult {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmAlphaPeakResult.prototype);
        obj.__wbg_ptr = ptr;
        WasmAlphaPeakResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmAlphaPeakResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmalphapeakresult_free(ptr, 0);
    }
    /**
     * Average power across the alpha band
     * @returns {number}
     */
    get alpha_power() {
        const ret = wasm.wasmalphapeakresult_alpha_power(this.__wbg_ptr);
        return ret;
    }
    /**
     * Long-term peak frequency estimate (Hz)
     * @returns {number}
     */
    get long_term_peak_frequency() {
        const ret = wasm.wasmalphapeakresult_long_term_peak_frequency(this.__wbg_ptr);
        return ret;
    }
    /**
     * Peak frequency within the alpha band (Hz)
     * @returns {number}
     */
    get peak_frequency() {
        const ret = wasm.wasmalphapeakresult_peak_frequency(this.__wbg_ptr);
        return ret;
    }
    /**
     * Peak power at the alpha peak frequency
     * @returns {number}
     */
    get peak_power() {
        const ret = wasm.wasmalphapeakresult_peak_power(this.__wbg_ptr);
        return ret;
    }
    /**
     * Smoothed peak frequency within the alpha band (Hz)
     * @returns {number}
     */
    get smoothed_peak_frequency() {
        const ret = wasm.wasmalphapeakresult_smoothed_peak_frequency(this.__wbg_ptr);
        return ret;
    }
    /**
     * Signal-to-noise ratio within the alpha band
     * @returns {number}
     */
    get snr() {
        const ret = wasm.wasmalphapeakresult_snr(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmAlphaPeakResult.prototype[Symbol.dispose] = WasmAlphaPeakResult.prototype.free;

/**
 * Compute band powers from EEG signal data
 * Returns an object with delta, theta, alpha, beta, gamma powers
 */
export class WasmBandPowers {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmBandPowers.prototype);
        obj.__wbg_ptr = ptr;
        WasmBandPowersFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmBandPowersFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmbandpowers_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get alpha() {
        const ret = wasm.wasmbandpowers_alpha(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get beta() {
        const ret = wasm.wasmbandpowers_beta(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get delta() {
        const ret = wasm.wasmbandpowers_delta(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get gamma() {
        const ret = wasm.wasmbandpowers_gamma(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get relative powers (each band as fraction of total).
     * Returns a new WASM-owned object — call `.free()` on it when done,
     * or use the `using` keyword (TypeScript 5.2+).
     * @returns {WasmBandPowers}
     */
    relative() {
        const ret = wasm.wasmbandpowers_relative(this.__wbg_ptr);
        return WasmBandPowers.__wrap(ret);
    }
    /**
     * @returns {number}
     */
    get theta() {
        const ret = wasm.wasmbandpowers_theta(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get total() {
        const ret = wasm.wasmbandpowers_total(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmBandPowers.prototype[Symbol.dispose] = WasmBandPowers.prototype.free;

/**
 * WASM wrapper for the Calmness Model
 * Computes a continuous calmness score based on EEG frequency ratios
 */
export class WasmCalmnessModel {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmCalmnessModelFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmcalmnessmodel_free(ptr, 0);
    }
    /**
     * Get minimum samples required
     * @returns {number}
     */
    min_samples() {
        const ret = wasm.wasmcalmnessmodel_min_samples(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get the model name
     * @returns {string}
     */
    name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmcalmnessmodel_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Create a new calmness model
     *
     * # Arguments
     * * `sample_rate` - Sample rate in Hz (e.g., 256)
     * * `channel_count` - Number of EEG channels
     * @param {number} sample_rate
     * @param {number} channel_count
     */
    constructor(sample_rate, channel_count) {
        const ret = wasm.wasmcalmnessmodel_new(sample_rate, channel_count);
        this.__wbg_ptr = ret >>> 0;
        WasmCalmnessModelFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
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
     * @param {Float32Array} data
     * @returns {WasmCalmnessResult | undefined}
     */
    process(data) {
        const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmcalmnessmodel_process(this.__wbg_ptr, ptr0, len0);
        return ret === 0 ? undefined : WasmCalmnessResult.__wrap(ret);
    }
    /**
     * Reset the model state
     */
    reset() {
        wasm.wasmcalmnessmodel_reset(this.__wbg_ptr);
    }
    /**
     * Set the smoothing factor (0-1)
     * Higher values = faster response to changes
     * @param {number} alpha
     */
    set_smoothing(alpha) {
        wasm.wasmcalmnessmodel_set_smoothing(this.__wbg_ptr, alpha);
    }
}
if (Symbol.dispose) WasmCalmnessModel.prototype[Symbol.dispose] = WasmCalmnessModel.prototype.free;

/**
 * Result from the calmness model
 */
export class WasmCalmnessResult {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmCalmnessResult.prototype);
        obj.__wbg_ptr = ptr;
        WasmCalmnessResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmCalmnessResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmcalmnessresult_free(ptr, 0);
    }
    /**
     * Alpha/beta power ratio (primary calmness indicator)
     * @returns {number}
     */
    get alpha_beta_ratio() {
        const ret = wasm.wasmcalmnessresult_alpha_beta_ratio(this.__wbg_ptr);
        return ret;
    }
    /**
     * Alpha band power
     * @returns {number}
     */
    get alpha_power() {
        const ret = wasm.wasmcalmnessresult_alpha_power(this.__wbg_ptr);
        return ret;
    }
    /**
     * Beta band power
     * @returns {number}
     */
    get beta_power() {
        const ret = wasm.wasmcalmnessresult_beta_power(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get calmness as percentage (0-100)
     * @returns {number}
     */
    percentage() {
        const ret = wasm.wasmcalmnessresult_percentage(this.__wbg_ptr);
        return ret;
    }
    /**
     * Raw calmness score (0.0 = alert, 1.0 = very calm)
     * @returns {number}
     */
    get score() {
        const ret = wasm.wasmcalmnessresult_score(this.__wbg_ptr);
        return ret;
    }
    /**
     * Smoothed calmness score (less jittery)
     * @returns {number}
     */
    get smoothed_score() {
        const ret = wasm.wasmcalmnessresult_smoothed_score(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get state description: "very calm", "calm", "neutral", or "alert"
     * @returns {string}
     */
    state_description() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmcalmnessresult_state_description(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Theta power level
     * @returns {number}
     */
    get theta_level() {
        const ret = wasm.wasmcalmnessresult_theta_level(this.__wbg_ptr);
        return ret;
    }
    /**
     * Theta band power
     * @returns {number}
     */
    get theta_power() {
        const ret = wasm.wasmcalmnessresult_theta_power(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmCalmnessResult.prototype[Symbol.dispose] = WasmCalmnessResult.prototype.free;

export class WasmEegPreprocessor {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmEegPreprocessorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmeegpreprocessor_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    detrend_mode() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmeegpreprocessor_detrend_mode(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {boolean}
     */
    get enabled() {
        const ret = wasm.wasmeegpreprocessor_enabled(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {number} sample_rate_hz
     * @param {number} channel_count
     * @param {string | null} [config_json]
     */
    constructor(sample_rate_hz, channel_count, config_json) {
        var ptr0 = isLikeNone(config_json) ? 0 : passStringToWasm0(config_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmeegpreprocessor_new(sample_rate_hz, channel_count, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmEegPreprocessorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {Float32Array}
     */
    notch_frequencies_hz() {
        const ret = wasm.wasmeegpreprocessor_notch_frequencies_hz(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {boolean}
     */
    get preserve_raw() {
        const ret = wasm.wasmeegpreprocessor_preserve_raw(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {Float32Array} data
     * @returns {Float32Array}
     */
    process(data) {
        const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmeegpreprocessor_process(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    /**
     * @returns {string}
     */
    reference_mode() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmeegpreprocessor_reference_mode(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    reset() {
        wasm.wasmeegpreprocessor_reset(this.__wbg_ptr);
    }
    /**
     * @param {number} sample_rate_hz
     * @param {number} channel_count
     */
    update_layout(sample_rate_hz, channel_count) {
        wasm.wasmeegpreprocessor_update_layout(this.__wbg_ptr, sample_rate_hz, channel_count);
    }
}
if (Symbol.dispose) WasmEegPreprocessor.prototype[Symbol.dispose] = WasmEegPreprocessor.prototype.free;

/**
 * Compute power in the alpha band (8-13 Hz)
 * @param {Float32Array} data
 * @param {number} sample_rate
 * @returns {number}
 */
export function alpha_power(data, sample_rate) {
    const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.alpha_power(ptr0, len0, sample_rate);
    return ret;
}

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
 * @param {Float32Array} data
 * @param {number} sample_rate
 * @returns {WasmBandPowers}
 */
export function band_powers(data, sample_rate) {
    const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.band_powers(ptr0, len0, sample_rate);
    return WasmBandPowers.__wrap(ret);
}

/**
 * Compute power in the beta band (13-30 Hz)
 * @param {Float32Array} data
 * @param {number} sample_rate
 * @returns {number}
 */
export function beta_power(data, sample_rate) {
    const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.beta_power(ptr0, len0, sample_rate);
    return ret;
}

/**
 * Compute the power spectrum of EEG data
 * Returns Float32Array of power values for each frequency bin
 * @param {Float32Array} data
 * @returns {Float32Array}
 */
export function compute_power_spectrum(data) {
    const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compute_power_spectrum(ptr0, len0);
    var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v2;
}

/**
 * Compute power in a custom frequency band
 *
 * # Arguments
 * * `data` - Float32Array of EEG samples
 * * `sample_rate` - Sample rate in Hz
 * * `low_freq` - Lower bound of frequency band (Hz)
 * * `high_freq` - Upper bound of frequency band (Hz)
 * @param {Float32Array} data
 * @param {number} sample_rate
 * @param {number} low_freq
 * @param {number} high_freq
 * @returns {number}
 */
export function custom_band_power(data, sample_rate, low_freq, high_freq) {
    const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.custom_band_power(ptr0, len0, sample_rate, low_freq, high_freq);
    return ret;
}

/**
 * Compute power in the delta band (0.5-4 Hz)
 * @param {Float32Array} data
 * @param {number} sample_rate
 * @returns {number}
 */
export function delta_power(data, sample_rate) {
    const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.delta_power(ptr0, len0, sample_rate);
    return ret;
}

/**
 * Compute power in the gamma band (30-100 Hz)
 * @param {Float32Array} data
 * @param {number} sample_rate
 * @returns {number}
 */
export function gamma_power(data, sample_rate) {
    const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.gamma_power(ptr0, len0, sample_rate);
    return ret;
}

/**
 * Get frequency values corresponding to FFT bins
 *
 * # Arguments
 * * `n` - Number of samples (should match data length used in FFT)
 * * `sample_rate` - Sample rate in Hz
 * @param {number} n
 * @param {number} sample_rate
 * @returns {Float32Array}
 */
export function get_fft_frequencies(n, sample_rate) {
    const ret = wasm.get_fft_frequencies(n, sample_rate);
    var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
}

/**
 * Get the SDK version
 * @returns {string}
 */
export function get_version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.get_version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Initialize the WASM module (call once at startup)
 */
export function init() {
    wasm.init();
}

/**
 * Compute power in the theta band (4-8 Hz)
 * @param {Float32Array} data
 * @param {number} sample_rate
 * @returns {number}
 */
export function theta_power(data, sample_rate) {
    const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.theta_power(ptr0, len0, sample_rate);
    return ret;
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_81fc77679af83bc6: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_now_88621c9c9a4f3ffc: function() {
            const ret = Date.now();
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./eeg_wasm_bg.js": import0,
    };
}

const AthenaWasmDecoderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_athenawasmdecoder_free(ptr >>> 0, 1));
const AthenaWasmOutputFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_athenawasmoutput_free(ptr >>> 0, 1));
const EegBandsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_eegbands_free(ptr >>> 0, 1));
const WasmAlphaBumpDetectorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmalphabumpdetector_free(ptr >>> 0, 1));
const WasmAlphaBumpResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmalphabumpresult_free(ptr >>> 0, 1));
const WasmAlphaPeakModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmalphapeakmodel_free(ptr >>> 0, 1));
const WasmAlphaPeakResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmalphapeakresult_free(ptr >>> 0, 1));
const WasmBandPowersFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmbandpowers_free(ptr >>> 0, 1));
const WasmCalmnessModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmcalmnessmodel_free(ptr >>> 0, 1));
const WasmCalmnessResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmcalmnessresult_free(ptr >>> 0, 1));
const WasmEegPreprocessorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmeegpreprocessor_free(ptr >>> 0, 1));

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('eeg_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
