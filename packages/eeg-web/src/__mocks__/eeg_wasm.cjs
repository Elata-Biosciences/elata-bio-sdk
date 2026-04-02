module.exports = {
	default: function initWasm(moduleOrPath) {
		return Promise.resolve({ initializedWith: moduleOrPath });
	},
	initSync: function initSync(module) {
		return { syncInit: true, module };
	},
	RppgPipeline: class RppgPipeline {
		free() {}
	},
	WasmRppgPipeline: class WasmRppgPipeline {
		constructor(sampleRate, windowSec) {
			const instance = Object.create(module.exports.RppgPipeline.prototype);
			instance.__wbg_ptr = 1;
			instance.sampleRate = sampleRate;
			instance.windowSec = windowSec;
			return instance;
		}
		push_sample(timestampMs, intensity) {
			this.lastSample = { timestampMs, intensity };
		}
		get_metrics() {
			return JSON.stringify({ bpm: null, confidence: 0, signal_quality: 0 });
		}
		free() {}
	},
	WasmEegPreprocessor: class WasmEegPreprocessor {
		constructor(sampleRateHz, channelCount, configJson) {
			this.sampleRateHz = sampleRateHz;
			this.channelCount = channelCount;
			this.config = configJson ? JSON.parse(configJson) : {};
			this.enabled = this.config.enabled !== false;
			this.preserve_raw = this.config.preserve_raw !== false;
		}
		process(data) {
			return new Float32Array(data);
		}
		update_layout(sampleRateHz, channelCount) {
			this.sampleRateHz = sampleRateHz;
			this.channelCount = channelCount;
		}
		reset() {}
		reference_mode() {
			return this.config.reference?.mode || "common-average";
		}
		detrend_mode() {
			return this.config.detrend?.mode || "highpass";
		}
		notch_frequencies_hz() {
			const mainsHz = this.config.notch?.mains_hz;
			if (!mainsHz) return [];
			return (this.config.notch?.harmonics || [1, 2]).map((harmonic) => harmonic * mainsHz);
		}
		free() {}
	},
	exportedValue: 123,
	doSomething: function doSomething() {
		return "ok";
	},
};
