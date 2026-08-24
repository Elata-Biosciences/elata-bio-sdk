// Jest mock for the wasm-bindgen web-target glue (mirrors eeg-web's
// src/__mocks__/eeg_wasm.cjs approach). Produces deterministic fake feature
// JSON so unit tests of the TS wrapper/marshalling never need a wasm build;
// real-WASM parity runs against wasm/node in eegWindowFeatures.parity.test.ts.

let initCalls = 0;

function init(moduleOrPath) {
	initCalls += 1;
	return Promise.resolve({ __mock: true, input: moduleOrPath });
}

function initSync(module) {
	initCalls += 1;
	return { __mock: true, input: module };
}

function bandValues(value) {
	return {
		delta: value,
		theta: value,
		alpha: value,
		beta: value,
		gamma: value,
	};
}

class WasmEegWindowAnalyzer {
	constructor(sampleRateHz, channelCount, configJson) {
		if (!(sampleRateHz > 0))
			throw new Error("invalid EegWindowConfig: sampleRateHz must be > 0");
		if (!(channelCount >= 1))
			throw new Error("invalid EegWindowConfig: channelCount must be >= 1");
		if (configJson) {
			try {
				JSON.parse(configJson);
			} catch {
				throw new Error("invalid EegWindowConfig: bad JSON");
			}
		}
		this.sampleRateHz = sampleRateHz;
		this.channelCount = channelCount;
		this.configJson = configJson ?? null;
		this.freed = false;
	}

	analyze_window(interleaved) {
		if (this.freed) throw new Error("use after free");
		const channels = this.channelCount;
		const frames = Math.floor(interleaved.length / channels);
		const perChannel = (make) =>
			Array.from({ length: channels }, (_, i) => make(i));
		return JSON.stringify({
			schema: "elata.eeg-window-features/v1",
			sampleRateHz: this.sampleRateHz,
			channelCount: channels,
			sampleCount: frames,
			stats: perChannel(() => ({
				mean: 0,
				rms: 1,
				variance: 1,
				std: 1,
				ptp: 2,
			})),
			bandPowersAbs: perChannel(() => bandValues(10)),
			bandPowersRel: perChannel(() => bandValues(0.2)),
			bandPowersLog: perChannel(() => bandValues(1)),
			spectralEntropy: perChannel(() => 0.5),
			dominantFrequencyHz: perChannel(() => 10),
			alphaPeakHz: perChannel((i) => (i === 0 ? 10.25 : null)),
			hjorth: perChannel(() => ({
				activity: 1,
				mobility: 0.2,
				complexity: 1.1,
			})),
			quality: perChannel(() => ({
				flatlineFraction: 0,
				clippedFraction: 0,
				extremeAmplitudeFraction: 0,
				lineNoiseRatio: 0,
				usable: true,
			})),
			algorithmVersions: { welch_psd: "welch_psd@1" },
			configId: "mock-config-id",
		});
	}

	update_layout(sampleRateHz, channelCount) {
		if (sampleRateHz > 0) this.sampleRateHz = sampleRateHz;
		if (channelCount > 0) this.channelCount = channelCount;
	}

	config_id() {
		return "mock-config-id";
	}

	free() {
		this.freed = true;
	}
}

module.exports = init;
module.exports.default = init;
module.exports.initSync = initSync;
module.exports.WasmEegWindowAnalyzer = WasmEegWindowAnalyzer;
module.exports.__getInitCalls = () => initCalls;
module.exports.__resetInitCalls = () => {
	initCalls = 0;
};
