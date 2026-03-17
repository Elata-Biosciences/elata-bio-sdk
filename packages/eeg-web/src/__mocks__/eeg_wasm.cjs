// Mock WASM result objects

class MockAlphaBumpResult {
	get alpha_power() { return 0.8; }
	get baseline() { return 0.5; }
	get state() { return 'high'; }
	get state_changed() { return false; }
	get previous_state() { return undefined; }
	is_high() { return true; }
	is_low() { return false; }
	free() {}
}

class MockAlphaPeakResult {
	get alpha_power() { return 0.6; }
	get long_term_peak_frequency() { return 10.2; }
	get peak_frequency() { return 10.5; }
	get peak_power() { return 0.9; }
	get smoothed_peak_frequency() { return 10.3; }
	get snr() { return 3.1; }
	free() {}
}

class MockCalmnessResult {
	get alpha_beta_ratio() { return 1.4; }
	get alpha_power() { return 0.6; }
	get beta_power() { return 0.3; }
	get score() { return 0.7; }
	get smoothed_score() { return 0.65; }
	get theta_level() { return 0.2; }
	get theta_power() { return 0.15; }
	percentage() { return 70; }
	state_description() { return 'calm'; }
	free() {}
}

class MockWasmAlphaBumpDetector {
	constructor(_sampleRate, _channelCount) {
		this._callCount = 0;
	}
	min_samples() { return 256; }
	name() { return 'AlphaBumpDetector'; }
	process(_data) {
		this._callCount++;
		return this._callCount === 1 ? undefined : new MockAlphaBumpResult();
	}
	reset() { this._callCount = 0; }
	set_baseline_smoothing(_alpha) {}
	set_threshold(_multiplier) {}
	free() {}
}

class MockWasmAlphaPeakModel {
	constructor(_sampleRate, _channelCount) {
		this._callCount = 0;
	}
	min_samples() { return 256; }
	name() { return 'AlphaPeakModel'; }
	process(_data) {
		this._callCount++;
		return this._callCount === 1 ? undefined : new MockAlphaPeakResult();
	}
	reset() { this._callCount = 0; }
	set_smoothing(_alpha) {}
	free() {}
}

class MockWasmCalmnessModel {
	constructor(_sampleRate, _channelCount) {
		this._callCount = 0;
	}
	min_samples() { return 256; }
	name() { return 'CalmnessModel'; }
	process(_data) {
		this._callCount++;
		return this._callCount === 1 ? undefined : new MockCalmnessResult();
	}
	reset() { this._callCount = 0; }
	set_smoothing(_alpha) {}
	free() {}
}

class MockWasmBandPowers {
	constructor(opts = {}) {
		this._relative = opts.relative || false;
		this.delta = opts.delta || 0.1;
		this.theta = opts.theta || 0.15;
		this.alpha = opts.alpha || 0.4;
		this.beta = opts.beta || 0.25;
		this.gamma = opts.gamma || 0.1;
		this.total = opts.total || 1.0;
	}
	relative() {
		const t = this.delta + this.theta + this.alpha + this.beta + this.gamma;
		return new MockWasmBandPowers({
			relative: true,
			delta: this.delta / t,
			theta: this.theta / t,
			alpha: this.alpha / t,
			beta: this.beta / t,
			gamma: this.gamma / t,
			total: 1.0,
		});
	}
	free() {}
}

module.exports = {
	default: function initWasm(moduleOrPath) {
		return Promise.resolve({ initializedWith: moduleOrPath });
	},
	initSync: function initSync(module) {
		return { syncInit: true, module };
	},
	exportedValue: 123,
	doSomething: function doSomething() {
		return "ok";
	},
	WasmAlphaBumpDetector: MockWasmAlphaBumpDetector,
	WasmAlphaPeakModel: MockWasmAlphaPeakModel,
	WasmCalmnessModel: MockWasmCalmnessModel,
	band_powers: (_data, _sampleRate) => new MockWasmBandPowers(),
};
