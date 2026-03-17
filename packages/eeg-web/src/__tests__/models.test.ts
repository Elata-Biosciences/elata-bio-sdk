import {
	AlphaBumpDetector,
	AlphaPeakModel,
	CalmnessModel,
	band_powers_relative,
} from '../models';

const SAMPLE_RATE = 256;
const CHANNEL_COUNT = 4;
const chunk = new Float32Array(CHANNEL_COUNT * 10); // 10 samples, 4 channels

// ---------------------------------------------------------------------------
// band_powers_relative
// ---------------------------------------------------------------------------

describe('band_powers_relative', () => {
	it('returns a plain object with relative band powers', () => {
		const result = band_powers_relative(new Float32Array(256), SAMPLE_RATE);
		expect(result).toHaveProperty('delta');
		expect(result).toHaveProperty('theta');
		expect(result).toHaveProperty('alpha');
		expect(result).toHaveProperty('beta');
		expect(result).toHaveProperty('gamma');
		expect(result).toHaveProperty('total');
	});

	it('sums band powers close to total', () => {
		const result = band_powers_relative(new Float32Array(256), SAMPLE_RATE);
		const sum = result.delta + result.theta + result.alpha + result.beta + result.gamma;
		expect(sum).toBeCloseTo(result.total, 5);
	});
});

// ---------------------------------------------------------------------------
// AlphaBumpDetector
// ---------------------------------------------------------------------------

describe('AlphaBumpDetector', () => {
	it('returns NotReady on first process call', () => {
		const det = new AlphaBumpDetector(SAMPLE_RATE, CHANNEL_COUNT);
		const result = det.process(chunk);
		expect(result.ready).toBe(false);
		det.free();
	});

	it('NotReady result includes samplesNeeded', () => {
		const det = new AlphaBumpDetector(SAMPLE_RATE, CHANNEL_COUNT);
		const result = det.process(chunk);
		expect(result.ready).toBe(false);
		if (!result.ready) {
			expect(typeof result.samplesNeeded).toBe('number');
			expect(result.samplesNeeded).toBeGreaterThanOrEqual(0);
		}
		det.free();
	});

	it('returns a reading once warm', () => {
		const det = new AlphaBumpDetector(SAMPLE_RATE, CHANNEL_COUNT);
		det.process(chunk); // first call → undefined from mock
		const result = det.process(chunk); // second call → result from mock
		expect(result.ready).toBe(true);
		if (result.ready) {
			expect(typeof result.alpha_power).toBe('number');
			expect(typeof result.baseline).toBe('number');
			expect(typeof result.state).toBe('string');
			expect(typeof result.state_changed).toBe('boolean');
			expect(typeof result.is_high).toBe('boolean');
			expect(typeof result.is_low).toBe('boolean');
		}
		det.free();
	});

	it('tracks samplesBuffered across calls', () => {
		const det = new AlphaBumpDetector(SAMPLE_RATE, CHANNEL_COUNT);
		expect(det.samplesBuffered).toBe(0);
		det.process(chunk); // 10 samples/channel * 4 channels / 4 = 10
		expect(det.samplesBuffered).toBe(10);
		det.process(chunk);
		expect(det.samplesBuffered).toBe(20);
		det.free();
	});

	it('samplesNeeded decreases as samples arrive', () => {
		const det = new AlphaBumpDetector(SAMPLE_RATE, CHANNEL_COUNT);
		const before = det.samplesNeeded;
		det.process(chunk);
		expect(det.samplesNeeded).toBeLessThan(before);
		det.free();
	});

	it('reset clears samplesBuffered', () => {
		const det = new AlphaBumpDetector(SAMPLE_RATE, CHANNEL_COUNT);
		det.process(chunk);
		det.reset();
		expect(det.samplesBuffered).toBe(0);
		det.free();
	});

	it('exposes minSamples and name', () => {
		const det = new AlphaBumpDetector(SAMPLE_RATE, CHANNEL_COUNT);
		expect(det.minSamples).toBe(256);
		expect(det.name).toBe('AlphaBumpDetector');
		det.free();
	});

	it('supports Symbol.dispose', () => {
		const det = new AlphaBumpDetector(SAMPLE_RATE, CHANNEL_COUNT);
		expect(() => det[Symbol.dispose]()).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// AlphaPeakModel
// ---------------------------------------------------------------------------

describe('AlphaPeakModel', () => {
	it('returns NotReady on first process call', () => {
		const model = new AlphaPeakModel(SAMPLE_RATE, CHANNEL_COUNT);
		const result = model.process(chunk);
		expect(result.ready).toBe(false);
		model.free();
	});

	it('returns a reading once warm', () => {
		const model = new AlphaPeakModel(SAMPLE_RATE, CHANNEL_COUNT);
		model.process(chunk);
		const result = model.process(chunk);
		expect(result.ready).toBe(true);
		if (result.ready) {
			expect(typeof result.peak_frequency).toBe('number');
			expect(typeof result.alpha_power).toBe('number');
			expect(typeof result.snr).toBe('number');
		}
		model.free();
	});

	it('reset clears samplesBuffered', () => {
		const model = new AlphaPeakModel(SAMPLE_RATE, CHANNEL_COUNT);
		model.process(chunk);
		model.reset();
		expect(model.samplesBuffered).toBe(0);
		model.free();
	});

	it('supports Symbol.dispose', () => {
		const model = new AlphaPeakModel(SAMPLE_RATE, CHANNEL_COUNT);
		expect(() => model[Symbol.dispose]()).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// CalmnessModel
// ---------------------------------------------------------------------------

describe('CalmnessModel', () => {
	it('returns NotReady on first process call', () => {
		const model = new CalmnessModel(SAMPLE_RATE, CHANNEL_COUNT);
		const result = model.process(chunk);
		expect(result.ready).toBe(false);
		model.free();
	});

	it('returns a reading once warm', () => {
		const model = new CalmnessModel(SAMPLE_RATE, CHANNEL_COUNT);
		model.process(chunk);
		const result = model.process(chunk);
		expect(result.ready).toBe(true);
		if (result.ready) {
			expect(typeof result.score).toBe('number');
			expect(typeof result.smoothed_score).toBe('number');
			expect(typeof result.alpha_beta_ratio).toBe('number');
			expect(typeof result.percentage).toBe('number');
			expect(typeof result.state_description).toBe('string');
		}
		model.free();
	});

	it('reset clears samplesBuffered', () => {
		const model = new CalmnessModel(SAMPLE_RATE, CHANNEL_COUNT);
		model.process(chunk);
		model.reset();
		expect(model.samplesBuffered).toBe(0);
		model.free();
	});

	it('supports Symbol.dispose', () => {
		const model = new CalmnessModel(SAMPLE_RATE, CHANNEL_COUNT);
		expect(() => model[Symbol.dispose]()).not.toThrow();
	});
});
