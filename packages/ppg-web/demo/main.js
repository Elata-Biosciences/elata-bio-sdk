var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../eeg-web/src/headband.ts
var HEADBAND_FRAME_SCHEMA_VERSION = "v1";

// ../eeg-web/src/errors.ts
var ElataError = class extends Error {
  constructor(code, message, options) {
    super(message);
    this.name = "ElataError";
    this.code = code;
    this.details = options?.details;
    this.recoverable = options?.recoverable;
    this.cause = options?.cause;
  }
};
function isElataError(value) {
  return typeof value === "object" && value !== null && value.name === "ElataError" && typeof value.code === "string";
}
function asElataError(value, fallback = {
  code: "UNKNOWN",
  message: "Unknown error"
}) {
  if (isElataError(value)) return value;
  if (value instanceof Error) {
    return new ElataError(fallback.code, fallback.message, {
      cause: value,
      details: { ...fallback.details || {}, originalMessage: value.message }
    });
  }
  return new ElataError(fallback.code, fallback.message, {
    details: { ...fallback.details || {}, original: value }
  });
}

// ../eeg-web/wasm/eeg_wasm.js
var eeg_wasm_exports = {};
__export(eeg_wasm_exports, {
  AthenaWasmDecoder: () => AthenaWasmDecoder,
  AthenaWasmOutput: () => AthenaWasmOutput,
  EegBands: () => EegBands,
  WasmAlphaBumpDetector: () => WasmAlphaBumpDetector,
  WasmAlphaBumpResult: () => WasmAlphaBumpResult,
  WasmAlphaPeakModel: () => WasmAlphaPeakModel,
  WasmAlphaPeakResult: () => WasmAlphaPeakResult,
  WasmBandPowers: () => WasmBandPowers,
  WasmCalmnessModel: () => WasmCalmnessModel,
  WasmCalmnessResult: () => WasmCalmnessResult,
  WasmEegPreprocessor: () => WasmEegPreprocessor,
  alpha_power: () => alpha_power,
  band_powers: () => band_powers,
  beta_power: () => beta_power,
  compute_power_spectrum: () => compute_power_spectrum,
  custom_band_power: () => custom_band_power,
  default: () => __wbg_init,
  delta_power: () => delta_power,
  gamma_power: () => gamma_power,
  get_fft_frequencies: () => get_fft_frequencies,
  get_version: () => get_version,
  init: () => init,
  initSync: () => initSync,
  theta_power: () => theta_power
});
var AthenaWasmDecoder = class {
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
};
if (Symbol.dispose) AthenaWasmDecoder.prototype[Symbol.dispose] = AthenaWasmDecoder.prototype.free;
var AthenaWasmOutput = class _AthenaWasmOutput {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_AthenaWasmOutput.prototype);
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
};
if (Symbol.dispose) AthenaWasmOutput.prototype[Symbol.dispose] = AthenaWasmOutput.prototype.free;
var EegBands = class {
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
};
if (Symbol.dispose) EegBands.prototype[Symbol.dispose] = EegBands.prototype.free;
var WasmAlphaBumpDetector = class {
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
    return ret === 0 ? void 0 : WasmAlphaBumpResult.__wrap(ret);
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
};
if (Symbol.dispose) WasmAlphaBumpDetector.prototype[Symbol.dispose] = WasmAlphaBumpDetector.prototype.free;
var WasmAlphaBumpResult = class _WasmAlphaBumpResult {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_WasmAlphaBumpResult.prototype);
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
};
if (Symbol.dispose) WasmAlphaBumpResult.prototype[Symbol.dispose] = WasmAlphaBumpResult.prototype.free;
var WasmAlphaPeakModel = class {
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
    return ret === 0 ? void 0 : WasmAlphaPeakResult.__wrap(ret);
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
};
if (Symbol.dispose) WasmAlphaPeakModel.prototype[Symbol.dispose] = WasmAlphaPeakModel.prototype.free;
var WasmAlphaPeakResult = class _WasmAlphaPeakResult {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_WasmAlphaPeakResult.prototype);
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
};
if (Symbol.dispose) WasmAlphaPeakResult.prototype[Symbol.dispose] = WasmAlphaPeakResult.prototype.free;
var WasmBandPowers = class _WasmBandPowers {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_WasmBandPowers.prototype);
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
    return _WasmBandPowers.__wrap(ret);
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
};
if (Symbol.dispose) WasmBandPowers.prototype[Symbol.dispose] = WasmBandPowers.prototype.free;
var WasmCalmnessModel = class {
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
    return ret === 0 ? void 0 : WasmCalmnessResult.__wrap(ret);
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
};
if (Symbol.dispose) WasmCalmnessModel.prototype[Symbol.dispose] = WasmCalmnessModel.prototype.free;
var WasmCalmnessResult = class _WasmCalmnessResult {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_WasmCalmnessResult.prototype);
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
};
if (Symbol.dispose) WasmCalmnessResult.prototype[Symbol.dispose] = WasmCalmnessResult.prototype.free;
var WasmEegPreprocessor = class {
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
};
if (Symbol.dispose) WasmEegPreprocessor.prototype[Symbol.dispose] = WasmEegPreprocessor.prototype.free;
function alpha_power(data, sample_rate) {
  const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.alpha_power(ptr0, len0, sample_rate);
  return ret;
}
function band_powers(data, sample_rate) {
  const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.band_powers(ptr0, len0, sample_rate);
  return WasmBandPowers.__wrap(ret);
}
function beta_power(data, sample_rate) {
  const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.beta_power(ptr0, len0, sample_rate);
  return ret;
}
function compute_power_spectrum(data) {
  const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.compute_power_spectrum(ptr0, len0);
  var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
  wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
  return v2;
}
function custom_band_power(data, sample_rate, low_freq, high_freq) {
  const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.custom_band_power(ptr0, len0, sample_rate, low_freq, high_freq);
  return ret;
}
function delta_power(data, sample_rate) {
  const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.delta_power(ptr0, len0, sample_rate);
  return ret;
}
function gamma_power(data, sample_rate) {
  const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.gamma_power(ptr0, len0, sample_rate);
  return ret;
}
function get_fft_frequencies(n, sample_rate) {
  const ret = wasm.get_fft_frequencies(n, sample_rate);
  var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
  wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
  return v1;
}
function get_version() {
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
function init() {
  wasm.init();
}
function theta_power(data, sample_rate) {
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
      const ret = getStringFromWasm0(arg0, arg1);
      return ret;
    },
    __wbindgen_init_externref_table: function() {
      const table = wasm.__wbindgen_externrefs;
      const offset = table.grow(4);
      table.set(0, void 0);
      table.set(offset + 0, void 0);
      table.set(offset + 1, null);
      table.set(offset + 2, true);
      table.set(offset + 3, false);
    }
  };
  return {
    __proto__: null,
    "./eeg_wasm_bg.js": import0
  };
}
var AthenaWasmDecoderFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_athenawasmdecoder_free(ptr >>> 0, 1));
var AthenaWasmOutputFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_athenawasmoutput_free(ptr >>> 0, 1));
var EegBandsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_eegbands_free(ptr >>> 0, 1));
var WasmAlphaBumpDetectorFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_wasmalphabumpdetector_free(ptr >>> 0, 1));
var WasmAlphaBumpResultFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_wasmalphabumpresult_free(ptr >>> 0, 1));
var WasmAlphaPeakModelFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_wasmalphapeakmodel_free(ptr >>> 0, 1));
var WasmAlphaPeakResultFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_wasmalphapeakresult_free(ptr >>> 0, 1));
var WasmBandPowersFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_wasmbandpowers_free(ptr >>> 0, 1));
var WasmCalmnessModelFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_wasmcalmnessmodel_free(ptr >>> 0, 1));
var WasmCalmnessResultFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_wasmcalmnessresult_free(ptr >>> 0, 1));
var WasmEegPreprocessorFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_wasmeegpreprocessor_free(ptr >>> 0, 1));
function getArrayF32FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}
function getArrayF64FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}
var cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
  if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
    cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
  }
  return cachedFloat32ArrayMemory0;
}
var cachedFloat64ArrayMemory0 = null;
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
var cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}
function isLikeNone(x) {
  return x === void 0 || x === null;
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
  if (realloc === void 0) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8ArrayMemory0();
  let offset = 0;
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127) break;
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
var cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
var MAX_SAFARI_DECODE_BYTES = 2146435072;
var numBytesDecoded = 0;
function decodeText(ptr, len) {
  numBytesDecoded += len;
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    numBytesDecoded = len;
  }
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
var cachedTextEncoder = new TextEncoder();
if (!("encodeInto" in cachedTextEncoder)) {
  cachedTextEncoder.encodeInto = function(arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
      read: arg.length,
      written: buf.length
    };
  };
}
var WASM_VECTOR_LEN = 0;
var wasmModule;
var wasm;
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
  if (typeof Response === "function" && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        const validResponse = module.ok && expectedResponseType(module.type);
        if (validResponse && module.headers.get("Content-Type") !== "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
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
      case "basic":
      case "cors":
      case "default":
        return true;
    }
    return false;
  }
}
function initSync(module) {
  if (wasm !== void 0) return wasm;
  if (module !== void 0) {
    if (Object.getPrototypeOf(module) === Object.prototype) {
      ({ module } = module);
    } else {
      console.warn("using deprecated parameters for `initSync()`; pass a single object instead");
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
  if (wasm !== void 0) return wasm;
  if (module_or_path !== void 0) {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path } = module_or_path);
    } else {
      console.warn("using deprecated parameters for the initialization function; pass a single object instead");
    }
  }
  if (module_or_path === void 0) {
    module_or_path = new URL("eeg_wasm_bg.wasm", import.meta.url);
  }
  const imports = __wbg_get_imports();
  if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
    module_or_path = fetch(module_or_path);
  }
  const { instance, module } = await __wbg_load(await module_or_path, imports);
  return __wbg_finalize_init(instance, module);
}

// ../eeg-web/src/runtime.ts
var initPromise = null;
function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}
function normalizeInitEegWasmInput(moduleOrPath) {
  if (moduleOrPath === void 0) return void 0;
  if (isPlainObject(moduleOrPath) && "module_or_path" in moduleOrPath) {
    return moduleOrPath;
  }
  return { module_or_path: moduleOrPath };
}
async function initEegWasm(moduleOrPath) {
  if (!initPromise) {
    initPromise = __wbg_init(normalizeInitEegWasmInput(moduleOrPath));
  }
  return initPromise;
}

// ../eeg-web/src/eegProcessing.ts
function normalizeReference(reference, channelNames) {
  const referenceOptions = typeof reference === "string" ? { mode: reference } : reference ?? {};
  const mode = referenceOptions.mode ?? "common-average";
  const channels = (referenceOptions.channels ?? []).map(
    (channel) => typeof channel === "number" ? channel : channelNames.findIndex((channelName) => channelName === channel)
  ).filter((channel) => Number.isInteger(channel) && channel >= 0);
  return { mode, channels };
}
function normalizeDetrend(detrend) {
  const detrendOptions = typeof detrend === "string" ? { mode: detrend } : detrend ?? {};
  return {
    mode: detrendOptions.mode ?? "highpass",
    cutoff_hz: detrendOptions.cutoffHz ?? 0.5,
    q: detrendOptions.qualityFactor ?? 0.707
  };
}
function normalizeNotch(notch) {
  if (notch === false) {
    return { mains_hz: null, harmonics: [], q: 20 };
  }
  return {
    mains_hz: notch?.mainsHz ?? 60,
    harmonics: notch?.harmonics ?? [1, 2],
    q: notch?.qualityFactor ?? 20
  };
}
function toInterleaved(block) {
  const out = new Float32Array(block.samples.length * block.channelCount);
  for (let sampleIdx = 0; sampleIdx < block.samples.length; sampleIdx++) {
    const row = block.samples[sampleIdx] ?? [];
    for (let channelIdx = 0; channelIdx < block.channelCount; channelIdx++) {
      out[sampleIdx * block.channelCount + channelIdx] = row[channelIdx] ?? 0;
    }
  }
  return out;
}
function fromInterleaved(data, channelCount) {
  const sampleCount = Math.floor(data.length / channelCount);
  const rows = [];
  for (let sampleIdx = 0; sampleIdx < sampleCount; sampleIdx++) {
    const row = new Array(channelCount);
    const base = sampleIdx * channelCount;
    for (let channelIdx = 0; channelIdx < channelCount; channelIdx++) {
      row[channelIdx] = Number(data[base + channelIdx] ?? 0);
    }
    rows.push(row);
  }
  return rows;
}
function cloneSignalBlock(block) {
  return {
    ...block,
    channelNames: block.channelNames.slice(),
    samples: block.samples.map((row) => row.slice()),
    timestampsMs: block.timestampsMs?.slice()
  };
}
function normalizeWasmMode(value, fallback) {
  if (value === "commonaverage") return "common-average";
  if (value === "customaverage") return "custom-average";
  return value || fallback;
}
var EegPreprocessor = class {
  constructor(options = {}) {
    this.options = options;
    this.inner = null;
    this.layoutKey = "";
    this.readyPromise = null;
  }
  async ready() {
    if (this.options.enabled === false) return;
    if (!this.readyPromise) {
      this.readyPromise = initEegWasm().then(() => void 0);
    }
    await this.readyPromise;
  }
  reset() {
    this.inner?.reset();
  }
  dispose() {
    this.inner?.free();
    this.inner = null;
    this.layoutKey = "";
  }
  processSignalBlock(block) {
    const rawBlock = cloneSignalBlock(block);
    if (this.options.enabled === false) {
      return {
        eeg: rawBlock,
        eegProcessing: {
          applied: false,
          signalKind: "raw",
          rawAvailable: false,
          referenceMode: "none",
          detrendMode: "off",
          notchFrequenciesHz: [],
          stageOrder: []
        }
      };
    }
    const inner = this.ensureInner(block);
    const processed = inner.process(toInterleaved(rawBlock));
    const processedBlock = {
      ...rawBlock,
      samples: fromInterleaved(processed, rawBlock.channelCount)
    };
    const stageOrder = [
      ...Array.from(inner.notch_frequencies_hz()).length > 0 ? ["notch"] : [],
      ...normalizeWasmMode(inner.detrend_mode(), "off") !== "off" ? ["detrend"] : [],
      ...normalizeWasmMode(inner.reference_mode(), "none") !== "none" ? ["rereference"] : []
    ];
    return {
      eeg: processedBlock,
      eegRaw: inner.preserve_raw ? rawBlock : void 0,
      eegProcessing: {
        applied: true,
        signalKind: "processed",
        rawAvailable: inner.preserve_raw,
        referenceMode: normalizeWasmMode(
          inner.reference_mode(),
          "common-average"
        ),
        detrendMode: normalizeWasmMode(
          inner.detrend_mode(),
          "highpass"
        ),
        notchFrequenciesHz: Array.from(inner.notch_frequencies_hz()).map(Number),
        stageOrder
      }
    };
  }
  processFrame(frame) {
    const { eeg, eegRaw, eegProcessing } = this.processSignalBlock(frame.eegRaw ?? frame.eeg);
    return {
      ...frame,
      eeg,
      eegRaw,
      eegProcessing
    };
  }
  ensureInner(block) {
    const layoutKey = `${block.sampleRateHz}:${block.channelCount}:${block.channelNames.join(",")}:${JSON.stringify(
      this.options
    )}`;
    const Constructor = eeg_wasm_exports.WasmEegPreprocessor;
    if (typeof Constructor !== "function") {
      throw new Error(
        "EEG preprocessing is unavailable because the WASM preprocessor export is missing."
      );
    }
    if (!this.inner || this.layoutKey !== layoutKey) {
      this.inner?.free();
      const config = {
        enabled: this.options.enabled ?? true,
        preserve_raw: this.options.preserveRaw ?? true,
        reference: normalizeReference(this.options.reference, block.channelNames),
        detrend: normalizeDetrend(this.options.detrend),
        notch: normalizeNotch(this.options.notch)
      };
      this.inner = new Constructor(
        block.sampleRateHz,
        block.channelCount,
        JSON.stringify(config)
      );
      this.layoutKey = layoutKey;
    } else {
      this.inner.update_layout(block.sampleRateHz, block.channelCount);
    }
    return this.inner;
  }
};
async function createEegPreprocessor(options = {}) {
  const processor = new EegPreprocessor(options);
  await processor.ready();
  return processor;
}

// ../eeg-web-ble/src/devices/muse/museDevice.ts
var EEG_NAMES_ATHENA = [
  "TP9",
  "AF7",
  "AF8",
  "TP10",
  "AUX1",
  "AUX2",
  "AUX3",
  "AUX4"
];
var EEG_NAMES_CLASSIC = ["TP9", "AF7", "AF8", "TP10"];
function wasmGet(output, key) {
  if (!output || typeof output !== "object") return void 0;
  const map = output;
  const value = map[key];
  if (typeof value === "function") {
    return value.call(output);
  }
  return value;
}
function asNumberArray(value) {
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === "number");
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return Array.from(value).filter(
      (v) => typeof v === "number" && Number.isFinite(v)
    );
  }
  return [];
}
var MuseBleDevice = class {
  constructor(options = {}) {
    this.SERVICE_UUID = "0000fe8d-0000-1000-8000-00805f9b34fb";
    this.CHAR_UUIDS = {
      command: "273e0001-4c4d-454d-96be-f03bac821358",
      tp9: "273e0003-4c4d-454d-96be-f03bac821358",
      af7: "273e0004-4c4d-454d-96be-f03bac821358",
      af8: "273e0005-4c4d-454d-96be-f03bac821358",
      tp10: "273e0006-4c4d-454d-96be-f03bac821358",
      ppg1: "273e000f-4c4d-454d-96be-f03bac821358",
      ppg2: "273e0010-4c4d-454d-96be-f03bac821358",
      ppg3: "273e0011-4c4d-454d-96be-f03bac821358",
      athenaEeg: "273e0013-4c4d-454d-96be-f03bac821358",
      athenaOther: "273e0014-4c4d-454d-96be-f03bac821358"
    };
    this.samplingRate = 256;
    this.numEegChannels = 4;
    this.eegNames = EEG_NAMES_CLASSIC.slice();
    this.ppgNames = ["PPG1", "PPG2", "PPG3"];
    this.availablePpgNames = [];
    this.protocol = "classic";
    this.isAthena = false;
    this.opticsChannelCount = 0;
    this.availableCharacteristics = [];
    this.ppgMode = "none";
    this.athenaDecoder = null;
    this.device = null;
    this.server = null;
    this.service = null;
    this.commandChar = null;
    this.eegChars = {};
    this.ppgChars = {};
    this.athenaChars = {};
    this.eegBuffers = {};
    this.ppgBuffers = {
      PPG1: [],
      PPG2: [],
      PPG3: []
    };
    this.isStreaming = false;
    this.ppgSampleCount = 0;
    this.ppgFallbackTimer = null;
    this.onDataCallback = null;
    this.onPpgCallback = null;
    this.athenaDecoderFactory = options.athenaDecoderFactory;
    this.sleepMs = options.sleepMs || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.logger = options.logger;
    this.onDisconnected = options.onDisconnected;
  }
  getBoardInfo() {
    const deviceName = this.device?.name || "Unknown";
    const isSynthetic = deviceName.toLowerCase().includes("synthetic") || deviceName.toLowerCase().includes("muse-syn");
    const isAthena = this.protocol === "athena";
    return {
      device_name: this.device ? `${deviceName}` : "Muse / Synthetic Bridge",
      sample_rate_hz: this.samplingRate,
      channel_count: this.numEegChannels,
      eeg_channel_names: this.eegNames.slice(),
      board_id: isSynthetic ? -1 : isAthena ? -1 : 21,
      protocol: isAthena ? "athena" : "classic",
      optics_channel_count: isAthena ? this.opticsChannelCount : 0,
      description: isSynthetic ? "Synthetic EEG bridge emulating Muse protocol via BLE" : isAthena ? "Muse S Athena (protocol v2) via Web Bluetooth" : "Muse S / Muse 2 EEG headband via Web Bluetooth"
    };
  }
  getCharacteristicInfo() {
    return {
      service_uuid: this.SERVICE_UUID,
      characteristics: this.availableCharacteristics.slice(),
      protocol: this.protocol
    };
  }
  decodeEegPacket(view) {
    const samples = [];
    for (let i = 2; i + 2 < view.length; i += 3) {
      let v1 = view[i] << 4 | view[i + 1] >> 4;
      let v2 = (view[i + 1] & 15) << 8 | view[i + 2];
      v1 = (v1 - 2048) * 125 / 256;
      v2 = (v2 - 2048) * 125 / 256;
      samples.push(v1, v2);
    }
    return samples;
  }
  decodePpgPacket(view) {
    if (view.length < 20) {
      return { sequence: 0, samples: [] };
    }
    const sequence = view[0] << 8 | view[1];
    const data = view.slice(2, 20);
    const samples = [];
    for (let i = 0; i + 2 < data.length; i += 3) {
      samples.push(data[i] << 16 | data[i + 1] << 8 | data[i + 2]);
    }
    return { sequence, samples };
  }
  splitPpgSamples(samples) {
    const ir = [];
    const nearIr = [];
    const red = [];
    for (let i = 0; i < samples.length; i += 3) {
      if (samples[i] !== void 0) ir.push(samples[i]);
      if (samples[i + 1] !== void 0) nearIr.push(samples[i + 1]);
      if (samples[i + 2] !== void 0) red.push(samples[i + 2]);
    }
    return { ir, nearIr, red };
  }
  async prepareSession() {
    if (!navigator.bluetooth) {
      throw new ElataError(
        "BLE_UNAVAILABLE",
        "Web Bluetooth not available in this browser",
        {
          recoverable: false,
          details: { platform: typeof navigator !== "undefined" ? navigator.userAgent : "unknown" }
        }
      );
    }
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [this.SERVICE_UUID] }],
      optionalServices: [this.SERVICE_UUID]
    });
    this.device.addEventListener("gattserverdisconnected", () => {
      this.isStreaming = false;
      this.commandChar = null;
      if (this.logger) this.logger("gatt disconnected");
      if (this.onDisconnected) this.onDisconnected();
    });
    this.server = await this.device.gatt?.connect() ?? null;
    if (!this.server) {
      throw new ElataError("BLE_GATT_CONNECT_FAILED", "Failed to connect to GATT server", {
        recoverable: true
      });
    }
    this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
    const characteristics = await this.service.getCharacteristics();
    this.availableCharacteristics = characteristics.map(
      (char) => char.uuid.toLowerCase()
    );
    const hasAthena = this.availableCharacteristics.includes(this.CHAR_UUIDS.athenaEeg) && this.availableCharacteristics.includes(this.CHAR_UUIDS.athenaOther);
    this.protocol = hasAthena ? "athena" : "classic";
    this.isAthena = hasAthena;
    this.commandChar = await this.service.getCharacteristic(
      this.CHAR_UUIDS.command
    );
    try {
      await this.commandChar.startNotifications();
      this.commandChar.addEventListener("characteristicvaluechanged", () => {
      });
    } catch (_) {
    }
    if (this.isAthena) {
      this.samplingRate = 256;
      this.numEegChannels = 8;
      this.eegNames = EEG_NAMES_ATHENA.slice();
      this.opticsChannelCount = 8;
      this.ppgMode = "athena";
      this.athenaChars.EEG = await this.service.getCharacteristic(
        this.CHAR_UUIDS.athenaEeg
      );
      this.athenaChars.OTHER = await this.service.getCharacteristic(
        this.CHAR_UUIDS.athenaOther
      );
      this.eegChars = {};
      this.ppgChars = {};
    } else {
      this.opticsChannelCount = 0;
      this.eegNames = EEG_NAMES_CLASSIC.slice();
      this.numEegChannels = 4;
      this.availablePpgNames = [];
      this.eegChars.TP9 = await this.service.getCharacteristic(
        this.CHAR_UUIDS.tp9
      );
      this.eegChars.AF7 = await this.service.getCharacteristic(
        this.CHAR_UUIDS.af7
      );
      this.eegChars.AF8 = await this.service.getCharacteristic(
        this.CHAR_UUIDS.af8
      );
      this.eegChars.TP10 = await this.service.getCharacteristic(
        this.CHAR_UUIDS.tp10
      );
      this.ppgChars = {};
      try {
        this.ppgChars.PPG1 = await this.service.getCharacteristic(
          this.CHAR_UUIDS.ppg1
        );
        this.availablePpgNames.push("PPG1");
      } catch (_) {
      }
      try {
        this.ppgChars.PPG2 = await this.service.getCharacteristic(
          this.CHAR_UUIDS.ppg2
        );
        this.availablePpgNames.push("PPG2");
      } catch (_) {
      }
      try {
        this.ppgChars.PPG3 = await this.service.getCharacteristic(
          this.CHAR_UUIDS.ppg3
        );
        this.availablePpgNames.push("PPG3");
      } catch (_) {
      }
      const ppgCount = Object.keys(this.ppgChars).length;
      if (ppgCount === 1) {
        this.ppgMode = "interleaved";
        this.availablePpgNames = this.ppgNames.slice();
      } else if (ppgCount >= 2) {
        this.ppgMode = "per-channel";
      } else {
        this.ppgMode = "none";
        this.availablePpgNames = [];
      }
    }
  }
  async sendCommand(cmd) {
    if (!this.commandChar) return;
    const bytes = new Uint8Array(cmd.length + 2);
    bytes[0] = cmd.length + 1;
    for (let i = 0; i < cmd.length; i++) bytes[i + 1] = cmd.charCodeAt(i);
    bytes[bytes.length - 1] = 10;
    const char = this.commandChar;
    if (typeof char.writeValueWithoutResponse === "function") {
      await char.writeValueWithoutResponse(bytes);
    } else {
      await this.commandChar.writeValue(bytes);
    }
  }
  processClassicEegBuffers() {
    const minSamples = Math.min(
      this.eegBuffers.TP9.length,
      this.eegBuffers.AF7.length,
      this.eegBuffers.AF8.length,
      this.eegBuffers.TP10.length
    );
    if (minSamples < 12) return;
    const samples = [];
    const samplesToProcess = Math.min(minSamples, 24);
    for (let i = 0; i < samplesToProcess; i++) {
      samples.push([
        this.eegBuffers.TP9.shift(),
        this.eegBuffers.AF7.shift(),
        this.eegBuffers.AF8.shift(),
        this.eegBuffers.TP10.shift()
      ]);
    }
    if (this.onDataCallback && samples.length > 0) {
      this.onDataCallback(samples);
    }
  }
  async startStream(callback, ppgCallback = null) {
    if (this.isStreaming) return;
    if (!this.commandChar) throw new Error("Muse not connected");
    this.onDataCallback = callback;
    this.onPpgCallback = ppgCallback;
    this.isStreaming = true;
    this.ppgSampleCount = 0;
    if (this.ppgFallbackTimer !== null) {
      clearTimeout(this.ppgFallbackTimer);
      this.ppgFallbackTimer = null;
    }
    this.eegBuffers = {};
    for (const ch of this.eegNames) this.eegBuffers[ch] = [];
    for (const ch of this.ppgNames) this.ppgBuffers[ch] = [];
    if (this.isAthena) {
      if (!this.athenaDecoderFactory) {
        throw new Error("Athena support requires an Athena decoder factory");
      }
      if (!this.athenaDecoder) this.athenaDecoder = this.athenaDecoderFactory();
      else this.athenaDecoder.reset();
      this.athenaDecoder.set_use_device_timestamps(true);
      this.athenaDecoder.set_clock_kind("windowed");
      this.athenaDecoder.set_reorder_window_ms(0);
      const handleAthenaNotification = (event) => {
        const target = event.target;
        const value = target.value;
        if (!value) return;
        const view = new Uint8Array(
          value.buffer,
          value.byteOffset,
          value.byteLength
        );
        let output;
        try {
          output = this.athenaDecoder?.decode(view);
        } catch (err) {
          if (this.logger) this.logger(`athena decode error: ${String(err)}`);
          return;
        }
        const eegSamples = asNumberArray(wasmGet(output, "eeg_samples"));
        const eegChannels = Number(wasmGet(output, "eeg_channel_count") || 0);
        if (eegSamples.length > 0 && eegChannels > 0 && this.onDataCallback) {
          if (this.numEegChannels !== eegChannels) {
            this.numEegChannels = eegChannels;
            this.eegNames = EEG_NAMES_ATHENA.slice(0, eegChannels);
          }
          const rows = [];
          const sampleCount = Math.floor(eegSamples.length / eegChannels);
          for (let i = 0; i < sampleCount; i++) {
            const row = new Array(eegChannels);
            const base = i * eegChannels;
            for (let ch = 0; ch < eegChannels; ch++)
              row[ch] = eegSamples[base + ch];
            rows.push(row);
          }
          if (rows.length > 0) this.onDataCallback(rows);
        }
        if (this.onPpgCallback) {
          const opticsSamples = asNumberArray(
            wasmGet(output, "optics_samples")
          );
          const opticsChannelCount = Number(
            wasmGet(output, "optics_channel_count") || 0
          );
          if (opticsChannelCount > 0)
            this.opticsChannelCount = opticsChannelCount;
          const accgyroSamples = asNumberArray(
            wasmGet(output, "accgyro_samples")
          );
          const batterySamples = asNumberArray(
            wasmGet(output, "battery_samples")
          );
          const hasAux = opticsSamples.length > 0 || accgyroSamples.length > 0 || batterySamples.length > 0;
          if (hasAux) {
            this.onPpgCallback("athena", {
              optics: {
                samples: opticsSamples,
                channel_count: opticsChannelCount,
                timestamps_ms: asNumberArray(
                  wasmGet(output, "optics_timestamps_ms")
                )
              },
              accgyro: {
                samples: accgyroSamples,
                timestamps_ms: asNumberArray(
                  wasmGet(output, "accgyro_timestamps_ms")
                )
              },
              battery: {
                samples: batterySamples,
                timestamps_ms: asNumberArray(
                  wasmGet(output, "battery_timestamps_ms")
                )
              }
            });
          }
        }
      };
      for (const char of Object.values(this.athenaChars)) {
        await char.startNotifications();
        char.addEventListener(
          "characteristicvaluechanged",
          handleAthenaNotification
        );
      }
      await this.sendCommand("v6");
      await this.sleepMs(200);
      await this.sendCommand("s");
      await this.sleepMs(200);
      await this.sendCommand("h");
      await this.sleepMs(200);
      await this.sendCommand("p1041");
      await this.sleepMs(200);
      await this.sendCommand("s");
      await this.sleepMs(200);
      await this.sendCommand("dc001");
      await this.sleepMs(50);
      await this.sendCommand("dc001");
      await this.sleepMs(100);
      await this.sendCommand("s");
      return;
    }
    const handleNotification = (channelName) => (event) => {
      const target = event.target;
      const value = target.value;
      if (!value) return;
      const view = new Uint8Array(
        value.buffer,
        value.byteOffset,
        value.byteLength
      );
      const samples = this.decodeEegPacket(view);
      this.eegBuffers[channelName].push(...samples);
      this.processClassicEegBuffers();
    };
    for (const [name, char] of Object.entries(this.eegChars)) {
      await char.startNotifications();
      char.addEventListener(
        "characteristicvaluechanged",
        handleNotification(name)
      );
    }
    const handlePpgNotification = (channelName) => (event) => {
      const target = event.target;
      const value = target.value;
      if (!value) return;
      const view = new Uint8Array(
        value.buffer,
        value.byteOffset,
        value.byteLength
      );
      const packet = this.decodePpgPacket(view);
      if (packet.samples.length === 0) return;
      this.ppgSampleCount += packet.samples.length;
      if (this.ppgMode === "interleaved") {
        const split = this.splitPpgSamples(packet.samples);
        this.ppgBuffers.PPG1.push(...split.ir);
        this.ppgBuffers.PPG2.push(...split.nearIr);
        this.ppgBuffers.PPG3.push(...split.red);
        if (this.onPpgCallback) {
          this.onPpgCallback("interleaved", {
            sequence: packet.sequence,
            ...split
          });
        }
      } else {
        this.ppgBuffers[channelName].push(...packet.samples);
        if (this.onPpgCallback) this.onPpgCallback(channelName, packet);
      }
    };
    for (const [name, char] of Object.entries(this.ppgChars)) {
      await char.startNotifications();
      char.addEventListener(
        "characteristicvaluechanged",
        handlePpgNotification(name)
      );
    }
    await this.sendCommand("v1");
    await this.sendCommand("p21");
    await this.sendCommand("d");
    this.ppgFallbackTimer = window.setTimeout(async () => {
      if (this.ppgSampleCount > 0) return;
      await this.sendCommand("h");
      await this.sendCommand("p50");
      await this.sendCommand("d");
    }, 3e3);
  }
  async stopStream() {
    if (!this.isStreaming) return;
    if (this.commandChar) await this.sendCommand("h");
    const dataChars = this.isAthena ? Object.values(this.athenaChars) : Object.values(this.eegChars);
    for (const char of dataChars) {
      try {
        await char.stopNotifications();
      } catch (_) {
      }
    }
    for (const char of Object.values(this.ppgChars)) {
      try {
        await char.stopNotifications();
      } catch (_) {
      }
    }
    if (this.ppgFallbackTimer !== null) {
      clearTimeout(this.ppgFallbackTimer);
      this.ppgFallbackTimer = null;
    }
    this.isStreaming = false;
  }
  async releaseSession() {
    await this.stopStream();
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.device = null;
    this.server = null;
    this.service = null;
    this.commandChar = null;
    this.eegChars = {};
    this.ppgChars = {};
    this.athenaChars = {};
    this.athenaDecoder = null;
    this.isAthena = false;
    this.protocol = "classic";
    this.opticsChannelCount = 0;
    this.availablePpgNames = [];
    if (this.ppgFallbackTimer !== null) {
      clearTimeout(this.ppgFallbackTimer);
      this.ppgFallbackTimer = null;
    }
  }
};

// ../eeg-web-ble/src/transport/bleTransport.ts
var BleTransport = class {
  constructor(options = {}) {
    this.sequenceId = 0;
    this._connected = false;
    this.eegProcessor = null;
    this.pendingPpgRows = [];
    this.pendingPpgChannelNames = ["PPG1", "PPG2", "PPG3"];
    this.pendingOptics = null;
    this.pendingAccgyro = null;
    this.pendingBattery = null;
    this.ppgPerChannel = {
      PPG1: [],
      PPG2: [],
      PPG3: []
    };
    this.sourceName = options.sourceName || "muse-ble";
    this.eegProcessingOptions = options.eegProcessing === false ? { enabled: false } : options.eegProcessing === true || options.eegProcessing == null ? {} : options.eegProcessing;
    if (!options.device && !options.deviceOptions?.athenaDecoderFactory) {
      console.warn(
        "[BleTransport] No athenaDecoderFactory provided. Muse S Athena devices will fail to decode \u2014 pass athenaDecoderFactory: () => new AthenaWasmDecoder() in deviceOptions."
      );
    }
    this.device = options.device || new MuseBleDevice({
      ...options.deviceOptions || {},
      onDisconnected: () => {
        this._connected = false;
        this.emitStatus(
          "disconnected" /* Disconnected */,
          "gatt disconnected",
          "BLE_GATT_DISCONNECTED",
          true
        );
      }
    });
  }
  getBoardInfo() {
    return this.device.getBoardInfo();
  }
  getCharacteristicInfo() {
    return this.device.getCharacteristicInfo();
  }
  getIsAthena() {
    return this.device.isAthena;
  }
  getEegNames() {
    return this.device.eegNames.slice();
  }
  getOpticsChannelCount() {
    return this.device.opticsChannelCount;
  }
  emitStatus(state, reason, errorCode, recoverable) {
    if (!this.onStatus) return;
    this.onStatus({
      state,
      atMs: performance.now(),
      reason,
      errorCode,
      recoverable
    });
  }
  rowsFromFlat(samples, channelCount) {
    if (!samples || !channelCount || channelCount <= 0) return [];
    const out = [];
    const sampleCount = Math.floor(samples.length / channelCount);
    for (let i = 0; i < sampleCount; i++) {
      const row = new Array(channelCount);
      const base = i * channelCount;
      for (let ch = 0; ch < channelCount; ch++) row[ch] = samples[base + ch];
      out.push(row);
    }
    return out;
  }
  collectPerChannelPpg() {
    const channelNames = this.getClassicPpgChannelNames();
    if (!channelNames.length) return;
    const minLen = Math.min(
      ...channelNames.map((channelName) => this.ppgPerChannel[channelName].length)
    );
    if (minLen <= 0) return;
    this.pendingPpgChannelNames = channelNames;
    const rows = [];
    for (let i = 0; i < minLen; i++) {
      rows.push(
        channelNames.map(
          (channelName) => this.ppgPerChannel[channelName].shift()
        )
      );
    }
    this.pendingPpgRows.push(...rows);
  }
  getClassicPpgChannelNames() {
    const fromDevice = (this.device.availablePpgNames ?? []).filter(
      (channelName) => channelName === "PPG1" || channelName === "PPG2" || channelName === "PPG3"
    );
    return fromDevice.length > 0 ? fromDevice : ["PPG1", "PPG2", "PPG3"];
  }
  handlePpg(channelName, packet) {
    if (!packet) return;
    if (channelName === "athena") {
      const athena = packet;
      const optics = athena.optics;
      if (optics && optics.samples.length > 0) {
        const channelCount = optics.channel_count || this.device.opticsChannelCount || 0;
        const rows = this.rowsFromFlat(optics.samples, channelCount);
        if (rows.length > 0) {
          this.pendingOptics = {
            sampleRateHz: 64,
            channelNames: Array.from(
              { length: channelCount },
              (_, i) => `OPTICS${i + 1}`
            ),
            channelCount,
            samples: rows,
            timestampsMs: optics.timestamps_ms || [],
            clockSource: "device"
          };
        }
      }
      const accgyro = athena.accgyro;
      if (accgyro && accgyro.samples.length > 0) {
        const rows = this.rowsFromFlat(accgyro.samples, 6);
        if (rows.length > 0) {
          this.pendingAccgyro = {
            sampleRateHz: 52,
            channelNames: [
              "ACC_X",
              "ACC_Y",
              "ACC_Z",
              "GYRO_X",
              "GYRO_Y",
              "GYRO_Z"
            ],
            channelCount: 6,
            samples: rows,
            timestampsMs: accgyro.timestamps_ms || [],
            clockSource: "device"
          };
        }
      }
      const battery = athena.battery;
      if (battery && battery.samples.length > 0) {
        this.pendingBattery = {
          samples: battery.samples.slice(),
          timestampsMs: battery.timestamps_ms || [],
          clockSource: "device"
        };
      }
      return;
    }
    if (channelName === "interleaved") {
      const interleaved = packet;
      const count = Math.min(
        interleaved.ir.length,
        interleaved.nearIr.length,
        interleaved.red.length
      );
      for (let i = 0; i < count; i++) {
        this.pendingPpgRows.push([
          interleaved.ir[i],
          interleaved.nearIr[i],
          interleaved.red[i]
        ]);
      }
      this.pendingPpgChannelNames = ["PPG1", "PPG2", "PPG3"];
      return;
    }
    if (channelName !== "PPG1" && channelName !== "PPG2" && channelName !== "PPG3")
      return;
    const ppg = packet;
    if (!ppg.samples || ppg.samples.length === 0) return;
    this.ppgPerChannel[channelName].push(...ppg.samples);
    this.collectPerChannelPpg();
  }
  async connect() {
    this.emitStatus("connecting" /* Connecting */);
    try {
      await this.device.prepareSession();
      this._connected = true;
      this.emitStatus("connected" /* Connected */);
    } catch (e) {
      const err = asElataError(e, {
        code: "BLE_CONNECT_FAILED",
        message: "Failed to connect to BLE device"
      });
      this.emitStatus(
        "error" /* Error */,
        err.message,
        err.code,
        err.recoverable
      );
      throw err;
    }
  }
  /** Connect and begin streaming in one call. Safe to call after stop() — skips
   *  re-pairing if the BLE connection is already active. */
  async startStreaming() {
    if (!this._connected) {
      await this.connect();
    }
    await this.start();
  }
  async disconnect() {
    try {
      await this.device.releaseSession();
      this._connected = false;
      this.emitStatus("disconnected" /* Disconnected */);
    } catch (e) {
      const err = asElataError(e, {
        code: "BLE_DISCONNECT_FAILED",
        message: "Failed to disconnect BLE device"
      });
      this.emitStatus(
        "error" /* Error */,
        err.message,
        err.code,
        err.recoverable
      );
      throw err;
    }
  }
  async start() {
    this.emitStatus("streaming" /* Streaming */);
    try {
      if (!this.eegProcessor) {
        this.eegProcessor = await createEegPreprocessor(this.eegProcessingOptions);
      }
      this.eegProcessor.reset();
      await this.device.startStream(
        (samples) => {
          this.sequenceId += 1;
          let frame = {
            schemaVersion: HEADBAND_FRAME_SCHEMA_VERSION,
            source: this.sourceName,
            sequenceId: this.sequenceId,
            emittedAtMs: performance.now(),
            eeg: {
              sampleRateHz: this.device.samplingRate,
              channelNames: this.device.eegNames.slice(),
              channelCount: this.device.numEegChannels,
              samples: samples.map((row) => row.slice()),
              clockSource: this.device.isAthena ? "device" : "local"
            }
          };
          frame = this.eegProcessor?.processFrame(frame) ?? frame;
          if (this.pendingPpgRows.length > 0) {
            frame.ppgRaw = {
              sampleRateHz: 64,
              channelNames: this.pendingPpgChannelNames.slice(),
              channelCount: this.pendingPpgChannelNames.length,
              samples: this.pendingPpgRows.splice(0, this.pendingPpgRows.length),
              clockSource: "local"
            };
          }
          if (this.pendingOptics) {
            frame.optics = this.pendingOptics;
            this.pendingOptics = null;
          }
          if (this.pendingAccgyro) {
            frame.accgyro = this.pendingAccgyro;
            this.pendingAccgyro = null;
          }
          if (this.pendingBattery) {
            frame.battery = this.pendingBattery;
            this.pendingBattery = null;
          }
          if (this.onFrame && frame.eeg.samples.length > 0) this.onFrame(frame);
        },
        (channelName, packet) => {
          this.handlePpg(channelName, packet);
        }
      );
    } catch (e) {
      const err = asElataError(e, {
        code: "BLE_START_FAILED",
        message: "Failed to start BLE streaming"
      });
      this.emitStatus(
        "error" /* Error */,
        err.message,
        err.code,
        err.recoverable
      );
      throw err;
    }
  }
  async stop() {
    try {
      await this.device.stopStream();
      this.eegProcessor?.dispose();
      this.eegProcessor = null;
      this.emitStatus("connected" /* Connected */);
    } catch (e) {
      const err = asElataError(e, {
        code: "BLE_STOP_FAILED",
        message: "Failed to stop BLE streaming"
      });
      this.emitStatus(
        "error" /* Error */,
        err.message,
        err.code,
        err.recoverable
      );
      throw err;
    }
  }
};

// ../rppg-web/src/rppgDiagnostics.ts
var BPM_MIN = 40;
var BPM_MAX = 180;
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function computeWaveformPeriodicityProfile(data, sampleRate, minBpm = BPM_MIN, maxBpm = BPM_MAX, stepBpm = 1) {
  const n = data.length;
  if (n < 60 || sampleRate <= 0 || minBpm >= maxBpm || stepBpm <= 0) {
    return null;
  }
  const mean2 = data.reduce((sum, value) => sum + value, 0) / n;
  const centered = data.map((value) => value - mean2);
  let energy = 0;
  for (let i = 0; i < centered.length; i++) {
    energy += centered[i] * centered[i];
  }
  if (!Number.isFinite(energy) || energy <= 1e-9) return null;
  const lagCache = /* @__PURE__ */ new Map();
  const scoreForLag = (lag) => {
    const cached = lagCache.get(lag);
    if (cached != null) return cached;
    const overlap = n - lag;
    if (lag <= 0 || overlap < 12) {
      lagCache.set(lag, -1);
      return -1;
    }
    let dot = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let i = 0; i < overlap; i++) {
      const left = centered[i];
      const right = centered[i + lag];
      dot += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const denom = Math.sqrt(Math.max(leftEnergy * rightEnergy, 1e-9));
    const overlapWeight = Math.sqrt(overlap / n);
    const corr = denom > 0 ? dot / denom * overlapWeight : -1;
    lagCache.set(lag, corr);
    return corr;
  };
  const bpmGrid = [];
  const rawScores = [];
  const lags = [];
  for (let bpm = minBpm; bpm <= maxBpm + 1e-9; bpm += stepBpm) {
    bpmGrid.push(bpm);
    const lag = Math.round(60 * sampleRate / bpm);
    lags.push(lag);
    rawScores.push(scoreForLag(lag));
  }
  if (!rawScores.length) return null;
  const sorted = rawScores.slice().sort((a, b) => b - a);
  const bestRaw = sorted[0] ?? -1;
  const medianRaw = sorted[Math.floor(sorted.length / 2)] ?? bestRaw;
  const groupedByLag = /* @__PURE__ */ new Map();
  const logits = rawScores.map((score) => clamp((score - medianRaw) / 0.06, -10, 10));
  for (let i = 0; i < bpmGrid.length; i++) {
    const lag = lags[i];
    const bpm = bpmGrid[i];
    const rawScore = rawScores[i];
    const rawWeight = Math.exp(logits[i]);
    const existing = groupedByLag.get(lag);
    if (existing) {
      existing.bpms.push(bpm);
      existing.rawScore = Math.max(existing.rawScore, rawScore);
      existing.rawWeight += rawWeight;
    } else {
      groupedByLag.set(lag, {
        lag,
        bpms: [bpm],
        rawScore,
        rawWeight
      });
    }
  }
  const candidates = Array.from(groupedByLag.values()).map((group) => ({
    lag: group.lag,
    bpm: group.bpms.reduce((sum, value) => sum + value, 0) / group.bpms.length,
    rawScore: group.rawScore,
    rawWeight: group.rawWeight
  })).sort((a, b) => b.rawWeight - a.rawWeight);
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.rawWeight, 0) || 1;
  const candidatesWithPosterior = candidates.map((candidate) => ({
    ...candidate,
    posterior: candidate.rawWeight / totalWeight
  }));
  const dominant = candidatesWithPosterior[0] ?? null;
  const secondary = candidatesWithPosterior[1] ?? null;
  const secondRaw = secondary?.rawScore ?? dominant?.rawScore ?? bestRaw;
  let entropy = 0;
  for (const candidate of candidatesWithPosterior) {
    if (candidate.posterior > 1e-12) {
      entropy -= candidate.posterior * Math.log(candidate.posterior);
    }
  }
  const maxEntropy = Math.log(Math.max(candidatesWithPosterior.length, 1));
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
  const contrast = clamp((dominant?.rawScore ?? bestRaw) - secondRaw, 0, 1);
  const topMass = dominant?.posterior ?? 0;
  const confidence = clamp(
    topMass * 1.6 * (1 - normalizedEntropy * 0.75) * clamp(contrast / 0.1, 0.05, 1),
    0,
    1
  );
  const scoreByLag = /* @__PURE__ */ new Map();
  for (const candidate of candidatesWithPosterior) {
    scoreByLag.set(candidate.lag, clamp(candidate.posterior, 0.01, 1));
  }
  const scores = lags.map(
    (lag) => Number((scoreByLag.get(lag) ?? 0.01).toFixed(6))
  );
  return {
    minBpm,
    maxBpm,
    stepBpm,
    scores,
    confidence: Number(confidence.toFixed(4)),
    dominantBpm: dominant ? Number(dominant.bpm.toFixed(3)) : null,
    dominantScore: Number((dominant?.rawScore ?? 0).toFixed(6)),
    secondaryBpm: secondary ? Number(secondary.bpm.toFixed(3)) : null,
    secondaryScore: Number((secondary?.rawScore ?? 0).toFixed(6)),
    contrast: Number(contrast.toFixed(6)),
    entropy: Number(normalizedEntropy.toFixed(6)),
    topCandidates: candidatesWithPosterior.slice(0, 5).map((candidate) => ({
      bpm: Number(candidate.bpm.toFixed(3)),
      rawScore: Number(candidate.rawScore.toFixed(6)),
      posterior: Number(candidate.posterior.toFixed(6)),
      lag: candidate.lag
    }))
  };
}

// ../rppg-web/src/rppgSignalModel.ts
function computeSignalSnrDb(values) {
  if (values.length < 8) return -100;
  const meanValue = mean(values);
  let signalVar = 0;
  for (let i = 0; i < values.length; i++) {
    const delta = values[i] - meanValue;
    signalVar += delta * delta;
  }
  signalVar /= values.length;
  let noiseVar = 0;
  for (let i = 0; i < values.length - 1; i++) {
    const delta = values[i + 1] - values[i];
    noiseVar += delta * delta;
  }
  noiseVar /= Math.max(1, values.length - 1);
  if (!Number.isFinite(signalVar) || !Number.isFinite(noiseVar) || noiseVar <= 1e-9) {
    return -100;
  }
  const snr = signalVar / noiseVar;
  if (snr <= 0) return -100;
  return 10 * Math.log10(snr);
}
function mean(values) {
  if (!values.length) return 0;
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    total += values[i];
  }
  return total / values.length;
}

// ../rppg-web/src/pulseAnalysis.ts
var BPM_MIN2 = 40;
var BPM_MAX2 = 180;
function analyzePulseWindow(samples) {
  const n = samples.length;
  if (n < 24) return null;
  const nowMs = samples[n - 1].timestampMs;
  const startMs = samples[0].timestampMs;
  const durationSec = Math.max(1e-3, (nowMs - startMs) / 1e3);
  const fs = (n - 1) / durationSec;
  if (!Number.isFinite(fs) || fs < 5) return null;
  const values = samples.map((s) => s.intensity);
  const norm = temporalNormalize(values);
  const snrDb = computeSignalSnrDb(norm);
  const spectral = estimateDominantBpm(norm, fs, 0.7, 3.3);
  const acf = calculateBpmViaAutocorrelation(norm, fs, spectral?.bpm ?? null);
  const waveformProfile = computeWaveformPeriodicityProfile(norm, fs);
  const peaksDetected = detectPeaks(
    samples.map((sample, idx) => ({ value: norm[idx], time: sample.timestampMs })),
    spectral?.bpm ?? acf?.bpm ?? null
  );
  const peakBpm = peaksDetected.length >= 2 ? bpmFromPeaks(peaksDetected) : null;
  const hrvRmssd = rmssdFromPeaks(peaksDetected);
  const respirationEstimate = estimateDominantBpm(norm, fs, 0.08, 0.5);
  const respiration = respirationEstimate && respirationEstimate.bpm >= 4 && respirationEstimate.bpm <= 24 ? respirationEstimate.bpm : null;
  const skinMean = samples.reduce((acc, sample) => acc + clamp2(sample.skinRatio, 0, 1), 0) / n;
  const motionMean = samples.reduce((acc, sample) => acc + clamp2(sample.motion, 0, 1), 0) / n;
  const clipMean = samples.reduce((acc, sample) => acc + clamp2(sample.clipRatio, 0, 1), 0) / n;
  const quality = clamp2(
    skinMean * (1 - motionMean * 0.6) * (1 - clipMean * 0.7),
    0,
    1
  );
  return {
    spectral,
    acf,
    peaks: peakBpm,
    waveformProfile,
    respiration,
    hrvRmssd,
    quality,
    snrDb,
    nowMs,
    motionMean
  };
}
function estimateDominantBpm(data, sampleRate, minHz, maxHz) {
  const n = data.length;
  if (n < 60 || sampleRate <= 0) return null;
  const mean2 = data.reduce((a, b) => a + b, 0) / n;
  const centered = data.map((v) => v - mean2);
  const stepHz = 0.05;
  let bestBpm = 0;
  let bestMag = 0;
  const getMagnitude = (hz) => {
    const omega = 2 * Math.PI * hz / sampleRate;
    let sinAcc = 0;
    let cosAcc = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1));
      const val = centered[i] * w;
      const phase = omega * i;
      sinAcc += val * Math.sin(phase);
      cosAcc += val * Math.cos(phase);
    }
    return Math.sqrt(sinAcc * sinAcc + cosAcc * cosAcc) / n;
  };
  for (let hz = minHz; hz <= maxHz; hz += stepHz) {
    const mag = getMagnitude(hz);
    if (mag > bestMag) {
      bestMag = mag;
      bestBpm = hz * 60;
    }
  }
  if (!(bestMag > 0) || !Number.isFinite(bestBpm)) return null;
  if (minHz >= 0.6 && maxHz <= 4.5) {
    const baseHz = bestBpm / 60;
    const doubleHz = baseHz * 2;
    if (doubleHz <= maxHz + 1e-6) {
      const doubleMag = getMagnitude(doubleHz);
      const ratio = doubleMag / (bestMag + 1e-9);
      const doubleBpm = doubleHz * 60;
      if (ratio > 0.35 && bestBpm < 85 && doubleBpm >= 60 && doubleBpm <= 190) {
        bestBpm = doubleBpm;
        bestMag = doubleMag;
      }
    }
  }
  const energy = centered.reduce((acc, value) => acc + value * value, 0) / n;
  const confidence = energy > 1e-9 ? clamp2(bestMag / (Math.sqrt(energy) + 1e-9), 0, 1) : 0;
  return { bpm: bestBpm, confidence };
}
function calculateBpmViaAutocorrelation(data, fps, bpmHint) {
  const n = data.length;
  if (n < 60 || fps <= 0) return null;
  const mean2 = data.reduce((a, b) => a + b, 0) / n;
  const centered = data.map((x) => x - mean2);
  const energy = centered.reduce((a, b) => a + b * b, 0);
  if (energy <= 0) return null;
  const minLag = Math.max(1, Math.floor(fps * 60 / BPM_MAX2));
  const maxLag = Math.max(minLag + 1, Math.ceil(fps * 60 / BPM_MIN2));
  const lagScores = /* @__PURE__ */ new Map();
  const lagScorer = (lag) => {
    const existing = lagScores.get(lag);
    if (existing != null) return existing;
    if (lag <= 0 || lag >= n) return 0;
    let sum = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += centered[i] * centered[i + lag];
    }
    let weight = 1;
    if (bpmHint) {
      const lagBpm = 60 * fps / lag;
      if (Math.abs(lagBpm - bpmHint) < 15) weight = 1.3;
    }
    const weighted = sum * weight;
    lagScores.set(lag, weighted);
    return weighted;
  };
  let bestLag = -1;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
    const score = lagScorer(lag);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag <= 0) return null;
  const build = (lag) => {
    if (lag < minLag || lag > maxLag || lag >= n) return null;
    const score = lagScorer(lag);
    const bpm = 60 * fps / lag;
    if (!Number.isFinite(bpm)) return null;
    const confidence = clamp2(Math.max(0, score) * 2 / energy, 0, 1);
    return { lag, bpm, confidence };
  };
  let winning = build(bestLag);
  let relation = "fundamental";
  const half = build(Math.floor(bestLag / 2));
  const dbl = build(Math.floor(bestLag * 2));
  if (winning && half && winning.bpm < 70 && half.bpm <= BPM_MAX2) {
    const ratio = winning.confidence > 0 ? half.confidence / winning.confidence : 0;
    if (ratio >= 0.75 || bpmHint != null && Math.abs(half.bpm - bpmHint) < 12 && ratio >= 0.4) {
      winning = half;
      relation = "double";
    }
  }
  if (winning && dbl && winning.bpm > 110 && dbl.bpm >= BPM_MIN2 && dbl.confidence >= winning.confidence * 0.95) {
    winning = dbl;
    relation = "half";
  }
  if (!winning) return null;
  return {
    bpm: winning.bpm,
    confidence: clamp2(winning.confidence, 0, 1),
    harmonicRelation: relation
  };
}
function detectPeaks(data, bpmHint) {
  if (data.length < 5) return [];
  const values = data.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range < 1e-4) return [];
  const threshold = min + range * 0.35;
  let minPeakDistance = 270;
  if (bpmHint) {
    minPeakDistance = Math.min(400, Math.max(200, 6e4 / bpmHint * 0.6));
  }
  const peaks = [];
  for (let i = 1; i < data.length - 1; i++) {
    const prev = data[i - 1].value;
    const curr = data[i].value;
    const next = data[i + 1].value;
    if (curr > threshold && curr > prev && curr > next) {
      const last = peaks[peaks.length - 1];
      if (!last || data[i].time - last.time > minPeakDistance) {
        peaks.push(data[i]);
      }
    }
  }
  return peaks;
}
function bpmFromPeaks(peaks) {
  if (peaks.length < 2) return null;
  const ibis = [];
  for (let i = 0; i < peaks.length - 1; i++) {
    const dt = (peaks[i + 1].time - peaks[i].time) / 1e3;
    if (dt > 0) ibis.push(dt);
  }
  if (!ibis.length) return null;
  const meanIbi = ibis.reduce((a, b) => a + b, 0) / ibis.length;
  if (meanIbi <= 0) return null;
  const bpm = 60 / meanIbi;
  if (bpm < BPM_MIN2 || bpm > BPM_MAX2) return null;
  const sd = std(ibis);
  const cov = meanIbi > 0 ? sd / meanIbi : 1;
  const confidence = clamp2(1 - cov * 1.5, 0, 1);
  return { bpm, confidence };
}
function rmssdFromPeaks(peaks) {
  if (peaks.length < 4) return null;
  const ibisMs = [];
  for (let i = 0; i < peaks.length - 1; i++) {
    const dt = peaks[i + 1].time - peaks[i].time;
    if (dt > 0) ibisMs.push(dt);
  }
  if (ibisMs.length < 3) return null;
  const diffs = [];
  for (let i = 0; i < ibisMs.length - 1; i++) {
    diffs.push(ibisMs[i + 1] - ibisMs[i]);
  }
  if (!diffs.length) return null;
  const meanSq = diffs.reduce((a, b) => a + b * b, 0) / diffs.length;
  return Math.sqrt(meanSq);
}
function temporalNormalize(data) {
  if (!data.length) return [];
  const mean2 = data.reduce((a, b) => a + b, 0) / data.length;
  let variance = 0;
  for (let i = 0; i < data.length; i++) {
    const delta = data[i] - mean2;
    variance += delta * delta;
  }
  variance /= data.length;
  const std2 = Math.sqrt(variance);
  if (!Number.isFinite(std2) || std2 < 1e-8) {
    return new Array(data.length).fill(0);
  }
  return data.map((value) => (value - mean2) / std2);
}
function clamp2(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function std(values) {
  if (values.length < 2) return 0;
  const mean2 = values.reduce((a, b) => a + b, 0) / values.length;
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    const delta = values[i] - mean2;
    acc += delta * delta;
  }
  return Math.sqrt(acc / values.length);
}

// src/ppgProcessor.ts
var DEFAULT_WINDOW_SEC = 16;
var PpgProcessor = class {
  constructor(options = {}) {
    this.streams = /* @__PURE__ */ new Map();
    this.metrics = emptyMetrics();
    this.selectedTrace = {
      source: null,
      channel: null,
      points: [],
      peaks: [],
      sampleRateHz: null
    };
    this.lastCandidates = [];
    this.framesSeen = 0;
    this.lastFrameAtMs = null;
    this.options = {
      windowSec: options.windowSec ?? DEFAULT_WINDOW_SEC,
      source: options.source ?? "auto",
      channel: options.channel ?? "auto"
    };
  }
  pushFrame(frame) {
    this.framesSeen += 1;
    this.lastFrameAtMs = frame.emittedAtMs;
    this.ingestBlock(frame, "ppgRaw");
    this.ingestBlock(frame, "optics");
    this.recomputeMetrics(frame.emittedAtMs);
  }
  reset() {
    this.streams.clear();
    this.metrics = emptyMetrics();
    this.selectedTrace = {
      source: null,
      channel: null,
      points: [],
      peaks: [],
      sampleRateHz: null
    };
    this.lastCandidates = [];
    this.framesSeen = 0;
    this.lastFrameAtMs = null;
  }
  getMetrics() {
    return { ...this.metrics, reasonCodes: this.metrics.reasonCodes.slice() };
  }
  getDebugSnapshot() {
    return {
      framesSeen: this.framesSeen,
      sourcesSeen: uniqueSorted(Array.from(this.streams.values()).map((stream) => stream.source)),
      channelsSeen: uniqueSorted(Array.from(this.streams.values()).map((stream) => stream.channel)),
      selectedSource: this.metrics.source,
      selectedChannel: this.metrics.channel,
      lastFrameAtMs: this.lastFrameAtMs,
      lastSampleTimestampMs: this.metrics.lastSampleTimestampMs,
      issues: this.metrics.reasonCodes.slice(),
      candidates: this.lastCandidates.map((candidate) => ({
        ...candidate,
        reasonCodes: candidate.reasonCodes.slice()
      }))
    };
  }
  getTraceSnapshot(maxPoints = 300) {
    return {
      source: this.selectedTrace.source,
      channel: this.selectedTrace.channel,
      sampleRateHz: this.selectedTrace.sampleRateHz,
      points: downsample(this.selectedTrace.points, maxPoints),
      peaks: downsample(this.selectedTrace.peaks, Math.min(64, maxPoints))
    };
  }
  ingestBlock(frame, source) {
    const block = frame[source];
    if (!block || !this.sourceMatches(source)) return;
    if (!Array.isArray(block.samples) || block.samples.length === 0) return;
    if (!Number.isFinite(block.sampleRateHz) || block.sampleRateHz <= 0) return;
    const rowCount = block.samples.length;
    const timestamps = this.resolveTimestamps(
      source,
      block.channelNames,
      block.sampleRateHz,
      block.timestampsMs,
      rowCount,
      frame.emittedAtMs
    );
    for (let channelIndex = 0; channelIndex < block.channelCount; channelIndex++) {
      const channelName = block.channelNames[channelIndex] ?? `${source.toUpperCase()}${channelIndex + 1}`;
      if (!this.channelMatches(channelName, channelIndex)) continue;
      const stream = this.getOrCreateStream(
        source,
        channelName,
        block.sampleRateHz,
        block.clockSource ?? null
      );
      stream.sampleRateHz = block.sampleRateHz;
      stream.clockSource = block.clockSource ?? stream.clockSource;
      stream.lastFrameAtMs = frame.emittedAtMs;
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const row = block.samples[rowIndex];
        const intensity = Number(row?.[channelIndex]);
        const timestampMs = timestamps[rowIndex];
        if (!Number.isFinite(intensity) || !Number.isFinite(timestampMs)) continue;
        const prev = stream.samples[stream.samples.length - 1];
        const delta = prev ? Math.abs(intensity - prev.intensity) : 0;
        stream.motionScale = stream.motionScale <= 0 ? delta || 1 : stream.motionScale * 0.94 + delta * 0.06;
        stream.samples.push({
          timestampMs,
          intensity,
          skinRatio: 1,
          motion: prev && stream.motionScale > 0 ? clamp3(delta / (stream.motionScale * 4), 0, 1) : 0,
          clipRatio: 0
        });
        stream.lastTimestampMs = timestampMs;
      }
      const cutoff = (stream.lastTimestampMs ?? frame.emittedAtMs) - this.options.windowSec * 1e3;
      while (stream.samples.length > 1 && stream.samples[0].timestampMs < cutoff) {
        stream.samples.shift();
      }
    }
  }
  recomputeMetrics(nowMs) {
    const candidates = [];
    for (const stream of this.streams.values()) {
      const candidate = buildCandidate(stream);
      if (candidate) candidates.push(candidate);
    }
    this.lastCandidates = candidates.map(stripCandidateTrace);
    if (!candidates.length) {
      this.metrics = {
        ...emptyMetrics(),
        emittedAtMs: nowMs,
        reasonCodes: ["no_signal"]
      };
      this.selectedTrace = {
        source: null,
        channel: null,
        points: [],
        peaks: [],
        sampleRateHz: null
      };
      return;
    }
    candidates.sort((left, right) => right.score - left.score);
    const winner = candidates[0];
    this.metrics = {
      bpm: winner.bpm,
      rmssdMs: winner.rmssdMs,
      sdnnMs: winner.sdnnMs,
      meanNnMs: winner.meanNnMs,
      confidence: round(winner.confidence),
      signalQuality: round(winner.signalQuality),
      source: winner.source,
      channel: winner.channel,
      sampleRateHz: winner.sampleRateHz,
      windowSampleCount: winner.windowSampleCount,
      windowDurationMs: winner.windowDurationMs,
      lastSampleTimestampMs: winner.lastSampleTimestampMs,
      emittedAtMs: nowMs,
      spectralBpm: winner.spectralBpm,
      acfBpm: winner.acfBpm,
      peaksBpm: winner.peaksBpm,
      respirationBpm: winner.respirationBpm,
      snrDb: winner.snrDb,
      waveformConfidence: winner.waveformConfidence,
      ibiCount: winner.ibiCount,
      reasonCodes: winner.reasonCodes.slice()
    };
    this.selectedTrace = {
      source: winner.source,
      channel: winner.channel,
      points: winner.points,
      peaks: winner.peaks.map((peak) => ({
        timestampMs: peak.time,
        value: peak.value
      })),
      sampleRateHz: winner.sampleRateHz
    };
  }
  resolveTimestamps(source, channelNames, sampleRateHz, timestampsMs, rowCount, fallbackEndMs) {
    if (timestampsMs && timestampsMs.length === rowCount) {
      return timestampsMs.slice();
    }
    const dt = 1e3 / sampleRateHz;
    const anchorStream = channelNames[0] ? this.streams.get(makeStreamKey(source, channelNames[0])) : null;
    let startMs = fallbackEndMs - (rowCount - 1) * dt;
    if (anchorStream?.lastTimestampMs != null) {
      const continued = anchorStream.lastTimestampMs + dt;
      if (continued > startMs - dt * 4 && continued < fallbackEndMs + dt * 4) {
        startMs = continued;
      }
    }
    return Array.from({ length: rowCount }, (_, index) => startMs + index * dt);
  }
  getOrCreateStream(source, channel, sampleRateHz, clockSource) {
    const key = makeStreamKey(source, channel);
    const existing = this.streams.get(key);
    if (existing) return existing;
    const created = {
      source,
      channel,
      sampleRateHz,
      clockSource,
      lastFrameAtMs: null,
      lastTimestampMs: null,
      motionScale: 1,
      samples: []
    };
    this.streams.set(key, created);
    return created;
  }
  sourceMatches(source) {
    return this.options.source === "auto" || this.options.source === source;
  }
  channelMatches(channelName, channelIndex) {
    if (this.options.channel === "auto") return true;
    if (typeof this.options.channel === "number") return this.options.channel === channelIndex;
    return this.options.channel === channelName;
  }
};
function buildCandidate(stream) {
  const analysis = analyzePulseWindow(stream.samples);
  if (!analysis) {
    const sampleCount = stream.samples.length;
    const lastSample = stream.samples[sampleCount - 1];
    return {
      source: stream.source,
      channel: stream.channel,
      score: 0,
      confidence: 0,
      signalQuality: 0,
      bpm: null,
      rmssdMs: null,
      sdnnMs: null,
      meanNnMs: null,
      windowSampleCount: sampleCount,
      windowDurationMs: sampleCount > 1 ? Math.round(lastSample.timestampMs - stream.samples[0].timestampMs) : 0,
      sampleRateHz: stream.sampleRateHz,
      lastSampleTimestampMs: lastSample?.timestampMs ?? null,
      reasonCodes: ["insufficient_window"],
      spectralBpm: null,
      acfBpm: null,
      peaksBpm: null,
      respirationBpm: null,
      snrDb: null,
      waveformConfidence: null,
      ibiCount: 0,
      points: stream.samples.map((sample) => ({
        timestampMs: sample.timestampMs,
        value: sample.intensity
      })),
      peaks: []
    };
  }
  const normalized = temporalNormalize(stream.samples.map((sample) => sample.intensity));
  const points = stream.samples.map((sample, index) => ({
    timestampMs: sample.timestampMs,
    value: sample.intensity,
    normalized: normalized[index] ?? 0
  }));
  const peaks = detectPeaks(
    points.map((point) => ({ time: point.timestampMs, value: point.normalized })),
    analysis.peaks?.bpm ?? analysis.spectral?.bpm ?? analysis.acf?.bpm ?? null
  );
  const ibisMs = computeIbisMs(peaks);
  const meanNnMs = ibisMs.length ? average(ibisMs) : null;
  const sdnnMs = ibisMs.length >= 2 ? stddev(ibisMs) : null;
  const agreement = computeAgreement([
    analysis.spectral?.bpm ?? null,
    analysis.acf?.bpm ?? null,
    analysis.peaks?.bpm ?? null
  ]);
  const estimatorConfidence = average(
    [
      analysis.spectral?.confidence ?? null,
      analysis.acf?.confidence ?? null,
      analysis.peaks?.confidence ?? null
    ].filter((value) => value != null)
  );
  const waveformConfidence = analysis.waveformProfile?.confidence ?? 0;
  const snrScore = clamp3(((analysis.snrDb ?? -12) + 12) / 24, 0, 1);
  const signalQuality = clamp3(
    estimatorConfidence * 0.35 + waveformConfidence * 0.25 + agreement * 0.25 + snrScore * 0.15,
    0,
    1
  );
  const confidence = clamp3(
    estimatorConfidence * 0.45 + agreement * 0.35 + waveformConfidence * 0.2,
    0,
    1
  );
  const bpm = resolveBpm(analysis);
  const score = signalQuality * 0.65 + confidence * 0.25 + (bpm != null ? 0.1 : 0) + (analysis.hrvRmssd != null ? 0.05 : 0);
  const reasons = [];
  if (signalQuality < 0.35) reasons.push("low_signal_quality");
  if (agreement < 0.45) reasons.push("estimators_disagree");
  if (ibisMs.length < 3) reasons.push("insufficient_ibi");
  return {
    source: stream.source,
    channel: stream.channel,
    score: round(score),
    confidence: round(confidence),
    signalQuality: round(signalQuality),
    bpm: bpm != null ? round(bpm) : null,
    rmssdMs: analysis.hrvRmssd != null ? Math.round(analysis.hrvRmssd) : null,
    sdnnMs: sdnnMs != null ? Math.round(sdnnMs) : null,
    meanNnMs: meanNnMs != null ? Math.round(meanNnMs) : null,
    windowSampleCount: stream.samples.length,
    windowDurationMs: Math.round(
      stream.samples[stream.samples.length - 1].timestampMs - stream.samples[0].timestampMs
    ),
    sampleRateHz: stream.sampleRateHz,
    lastSampleTimestampMs: stream.samples[stream.samples.length - 1]?.timestampMs ?? null,
    reasonCodes: reasons,
    spectralBpm: analysis.spectral?.bpm != null ? round(analysis.spectral.bpm) : null,
    acfBpm: analysis.acf?.bpm != null ? round(analysis.acf.bpm) : null,
    peaksBpm: analysis.peaks?.bpm != null ? round(analysis.peaks.bpm) : null,
    respirationBpm: analysis.respiration != null ? round(analysis.respiration) : null,
    snrDb: Number.isFinite(analysis.snrDb) ? round(analysis.snrDb) : null,
    waveformConfidence: round(waveformConfidence),
    ibiCount: ibisMs.length,
    points: points.map((point) => ({
      timestampMs: point.timestampMs,
      value: point.value
    })),
    peaks
  };
}
function resolveBpm(analysis) {
  if (!analysis) return null;
  const candidates = [
    analysis.peaks ? { bpm: analysis.peaks.bpm, confidence: analysis.peaks.confidence } : null,
    analysis.spectral ? { bpm: analysis.spectral.bpm, confidence: analysis.spectral.confidence } : null,
    analysis.acf ? { bpm: analysis.acf.bpm, confidence: analysis.acf.confidence } : null
  ].filter(
    (candidate) => candidate != null
  );
  if (!candidates.length) return null;
  candidates.sort((left, right) => right.confidence - left.confidence);
  const anchor = candidates[0];
  const support = candidates.filter(
    (candidate) => Math.abs(candidate.bpm - anchor.bpm) <= 10
  );
  const totalWeight = support.reduce((acc, candidate) => acc + candidate.confidence, 0);
  if (totalWeight <= 0) return anchor.bpm;
  return support.reduce(
    (acc, candidate) => acc + candidate.bpm * candidate.confidence,
    0
  ) / totalWeight;
}
function computeAgreement(values) {
  const valid = values.filter((value) => value != null);
  if (valid.length <= 1) return valid.length === 1 ? 0.5 : 0;
  const mean2 = average(valid);
  const spread = average(valid.map((value) => Math.abs(value - mean2)));
  return clamp3(1 - spread / 18, 0, 1);
}
function computeIbisMs(peaks) {
  const ibis = [];
  for (let index = 0; index < peaks.length - 1; index++) {
    const delta = peaks[index + 1].time - peaks[index].time;
    if (delta > 0) ibis.push(delta);
  }
  return ibis;
}
function stripCandidateTrace(candidate) {
  return {
    source: candidate.source,
    channel: candidate.channel,
    score: candidate.score,
    confidence: candidate.confidence,
    signalQuality: candidate.signalQuality,
    bpm: candidate.bpm,
    rmssdMs: candidate.rmssdMs,
    sdnnMs: candidate.sdnnMs,
    meanNnMs: candidate.meanNnMs,
    windowSampleCount: candidate.windowSampleCount,
    windowDurationMs: candidate.windowDurationMs,
    sampleRateHz: candidate.sampleRateHz,
    lastSampleTimestampMs: candidate.lastSampleTimestampMs,
    reasonCodes: candidate.reasonCodes.slice()
  };
}
function emptyMetrics() {
  return {
    bpm: null,
    rmssdMs: null,
    sdnnMs: null,
    meanNnMs: null,
    confidence: 0,
    signalQuality: 0,
    source: null,
    channel: null,
    sampleRateHz: null,
    windowSampleCount: 0,
    windowDurationMs: 0,
    lastSampleTimestampMs: null,
    emittedAtMs: null,
    spectralBpm: null,
    acfBpm: null,
    peaksBpm: null,
    respirationBpm: null,
    snrDb: null,
    waveformConfidence: null,
    ibiCount: 0,
    reasonCodes: ["no_signal"]
  };
}
function makeStreamKey(source, channel) {
  return `${source}:${channel}`;
}
function downsample(items, maxCount) {
  if (items.length <= maxCount) return items.slice();
  const step = items.length / maxCount;
  const result = [];
  for (let index = 0; index < maxCount; index++) {
    result.push(items[Math.floor(index * step)]);
  }
  return result;
}
function average(values) {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}
function stddev(values) {
  if (values.length < 2) return 0;
  const mean2 = average(values);
  const variance = values.reduce((acc, value) => acc + (value - mean2) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
function uniqueSorted(values) {
  return Array.from(new Set(values)).sort();
}
function clamp3(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function round(value) {
  return Number(value.toFixed(3));
}

// src/ppgSession.ts
var PpgSession = class {
  constructor(transport, processor, internals) {
    this.transport = transport;
    this.processor = processor;
    this.internals = internals;
    this.lastStatus = null;
  }
  getMetrics() {
    return this.processor.getMetrics();
  }
  getDebugSnapshot() {
    return this.processor.getDebugSnapshot();
  }
  getTraceSnapshot(maxPoints = 300) {
    return this.processor.getTraceSnapshot(maxPoints);
  }
  getDiagnostics(nowMs = Date.now()) {
    const debug = this.processor.getDebugSnapshot();
    const metrics = this.processor.getMetrics();
    return {
      transportStatus: this.lastStatus,
      lastFrameAtMs: debug.lastFrameAtMs,
      lastFrameAgeMs: debug.lastFrameAtMs != null ? Math.max(0, nowMs - debug.lastFrameAtMs) : null,
      lastSampleTimestampMs: metrics.lastSampleTimestampMs,
      lastSampleAgeMs: metrics.lastSampleTimestampMs != null ? Math.max(0, nowMs - metrics.lastSampleTimestampMs) : null,
      issues: debug.issues,
      metrics,
      debug
    };
  }
  async start() {
    await this.transport.connect();
    await this.transport.start();
    this.emitDiagnostics();
  }
  async stop() {
    await this.transport.stop();
    this.emitDiagnostics();
  }
  async disconnect() {
    await this.transport.disconnect();
    this.emitDiagnostics();
  }
  async dispose() {
    try {
      await this.stop();
    } catch {
    }
    try {
      await this.disconnect();
    } catch {
    }
    this.internals.restoreHandlers();
  }
  recordStatus(status) {
    this.lastStatus = status;
    this.internals.onStatus?.(status);
    this.emitDiagnostics();
  }
  emitDiagnostics() {
    const metrics = this.processor.getMetrics();
    this.internals.onMetrics?.(metrics);
    this.internals.onDiagnostics?.(this.getDiagnostics());
  }
};
async function createPpgSession(options) {
  const processor = new PpgProcessor({
    windowSec: options.windowSec,
    source: options.source,
    channel: options.channel
  });
  const previousOnFrame = options.transport.onFrame;
  const previousOnStatus = options.transport.onStatus;
  let session = null;
  options.transport.onFrame = (frame) => {
    previousOnFrame?.(frame);
    processor.pushFrame(frame);
    session?.emitDiagnostics();
  };
  options.transport.onStatus = (status) => {
    previousOnStatus?.(status);
    session?.recordStatus(status);
  };
  session = new PpgSession(options.transport, processor, {
    onMetrics: options.onMetrics,
    onDiagnostics: options.onDiagnostics,
    onStatus: options.onStatus,
    restoreHandlers: () => {
      options.transport.onFrame = previousOnFrame;
      options.transport.onStatus = previousOnStatus;
    }
  });
  if (options.autoStart !== false) {
    await session.start();
  }
  return session;
}
async function createMusePpgSession(options = {}) {
  const transport = new BleTransport({
    deviceOptions: options.deviceOptions,
    sourceName: options.sourceName ?? "muse-ppg"
  });
  return createPpgSession({
    transport,
    autoStart: options.autoStart,
    windowSec: options.windowSec,
    source: options.source,
    channel: options.channel,
    onMetrics: options.onMetrics,
    onDiagnostics: options.onDiagnostics,
    onStatus: options.onStatus
  });
}

// src/demoApp.ts
async function initPpgDemo(options = {}) {
  const demoWindow = window;
  const athenaDecoderFactory = options.deviceOptions?.athenaDecoderFactory ?? demoWindow.__ppgAthenaDecoderFactory;
  const sessionOptions = {
    ...options,
    deviceOptions: {
      ...options.deviceOptions ?? {},
      ...athenaDecoderFactory ? { athenaDecoderFactory } : {}
    }
  };
  const session = await createMusePpgSession({
    autoStart: true,
    windowSec: 16,
    source: "auto",
    channel: "auto",
    ...sessionOptions
  });
  window.__ppg_demo = {
    session,
    transport: session.transport,
    processor: session.processor,
    athenaInitError: demoWindow.__ppgAthenaInitError
  };
  return { session, transport: session.transport, processor: session.processor };
}

// demo/main.ts
function getEl(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}
var connectBtn = getEl("connect-btn");
var statusEl = getEl("status");
var bpmEl = getEl("bpm");
var confidenceEl = getEl("confidence");
var rmssdEl = getEl("rmssd");
var sdnnEl = getEl("sdnn");
var qualityEl = getEl("quality");
var channelEl = getEl("channel");
var sourceEl = getEl("source");
var sampleRateEl = getEl("sample-rate");
var reasonsEl = getEl("reasons");
var transportEl = getEl("transport");
var windowEl = getEl("window");
var framesEl = getEl("frames");
var waveform = getEl("waveform");
var activeSession = null;
function fmt(value, digits = 0, suffix = "") {
  return value == null || !Number.isFinite(value) ? "--" : `${value.toFixed(digits)}${suffix}`;
}
function clamp4(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function smoothDisplayValues(values, windowSize) {
  if (values.length <= 2) return values.slice();
  const normalizedWindowSize = windowSize % 2 === 0 ? windowSize + 1 : windowSize;
  const radius = Math.floor(normalizedWindowSize / 2);
  const smoothed = [];
  for (let index = 0; index < values.length; index++) {
    let sum = 0;
    let count = 0;
    for (let neighborIndex = Math.max(0, index - radius); neighborIndex <= Math.min(values.length - 1, index + radius); neighborIndex++) {
      sum += values[neighborIndex];
      count += 1;
    }
    smoothed.push(count > 0 ? sum / count : values[index]);
  }
  return smoothed;
}
function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const clamped = clamp4(p, 0, 1);
  const idx = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.round((sortedValues.length - 1) * clamped))
  );
  return sortedValues[idx];
}
function prepareDisplayValues(rawValues, sampleRateHz) {
  if (rawValues.length <= 2) return rawValues.map(() => 0);
  const sampleRate = sampleRateHz && sampleRateHz > 0 ? sampleRateHz : 64;
  const visibleSmoothingWindow = Math.max(
    3,
    Math.round(sampleRate * 120 / 1e3)
  );
  const baselineWindow = Math.max(
    visibleSmoothingWindow + 4,
    Math.round(sampleRate * 900 / 1e3)
  );
  const baseline = smoothDisplayValues(rawValues, baselineWindow);
  const detrended = rawValues.map((value, index) => value - (baseline[index] ?? 0));
  const smoothed = smoothDisplayValues(detrended, visibleSmoothingWindow);
  const magnitudes = smoothed.map((value) => Math.abs(value)).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const scale = Math.max(percentile(magnitudes, 0.9), 1e-3);
  return smoothed.map((value) => clamp4(value / scale, -2.2, 2.2));
}
function drawWaveform() {
  const session = activeSession;
  const ctx = waveform.getContext("2d");
  if (!session || !ctx) {
    requestAnimationFrame(drawWaveform);
    return;
  }
  const trace = session.getTraceSnapshot(320);
  const sampleRate = trace.sampleRateHz && trace.sampleRateHz > 0 ? trace.sampleRateHz : 64;
  const visiblePointCount = Math.max(
    48,
    Math.min(trace.points.length, Math.round(sampleRate * 6))
  );
  const visiblePoints = trace.points.slice(-visiblePointCount);
  ctx.clearRect(0, 0, waveform.width, waveform.height);
  ctx.strokeStyle = "rgba(138, 177, 191, 0.3)";
  ctx.beginPath();
  ctx.moveTo(0, waveform.height / 2);
  ctx.lineTo(waveform.width, waveform.height / 2);
  ctx.stroke();
  if (visiblePoints.length > 1) {
    const visualMin = -2.2;
    const visualMax = 2.2;
    const visualRange = visualMax - visualMin;
    const displayValues = prepareDisplayValues(
      visiblePoints.map((point) => point.value),
      trace.sampleRateHz
    );
    ctx.strokeStyle = "#5eead4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    visiblePoints.forEach((point, index) => {
      const x = index / (visiblePoints.length - 1) * waveform.width;
      const normalizedValue = clamp4(displayValues[index] ?? 0, visualMin, visualMax);
      const y = waveform.height * 0.1 + (visualMax - normalizedValue) / visualRange * waveform.height * 0.8;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  requestAnimationFrame(drawWaveform);
}
function startPolling() {
  setInterval(() => {
    if (!activeSession) return;
    const diagnostics = activeSession.getDiagnostics();
    const metrics = diagnostics.metrics;
    const debug = activeSession.getDebugSnapshot();
    bpmEl.textContent = fmt(metrics.bpm, 0);
    confidenceEl.textContent = `Confidence ${fmt(metrics.confidence * 100, 0, "%")}`;
    rmssdEl.textContent = fmt(metrics.rmssdMs, 0, " ms");
    sdnnEl.textContent = `SDNN ${fmt(metrics.sdnnMs, 0, " ms")}`;
    qualityEl.textContent = fmt(metrics.signalQuality * 100, 0, "%");
    channelEl.textContent = `Channel ${metrics.channel ?? "--"}`;
    sourceEl.textContent = metrics.source ?? "--";
    sampleRateEl.textContent = fmt(metrics.sampleRateHz, 0, " Hz");
    reasonsEl.textContent = metrics.reasonCodes.length > 0 ? metrics.reasonCodes.join(", ") : "--";
    transportEl.textContent = diagnostics.transportStatus?.state ?? "--";
    windowEl.textContent = `${metrics.windowSampleCount} samples / ${fmt(
      metrics.windowDurationMs,
      0,
      " ms"
    )}`;
    framesEl.textContent = String(debug.framesSeen);
  }, 400);
}
connectBtn.addEventListener("click", async () => {
  if (activeSession) {
    window.location.reload();
    return;
  }
  statusEl.textContent = "Connecting...";
  connectBtn.disabled = true;
  try {
    const { session } = await initPpgDemo({
      onStatus: (status) => {
        statusEl.textContent = `${status.state}${status.reason ? `: ${status.reason}` : ""}`;
      }
    });
    activeSession = session;
    connectBtn.textContent = "Reload Demo";
    statusEl.textContent = "Streaming";
    connectBtn.disabled = false;
  } catch (error) {
    const athenaInitError = window.__ppgAthenaInitError;
    statusEl.textContent = athenaInitError && error instanceof Error ? `${error.message} (Athena decoder unavailable: ${athenaInitError})` : error instanceof Error ? error.message : "Failed to start PPG demo";
    connectBtn.disabled = false;
  }
});
startPolling();
drawWaveform();
