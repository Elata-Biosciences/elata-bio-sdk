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
	exportedValue: 123,
	doSomething: function doSomething() {
		return "ok";
	},
};
