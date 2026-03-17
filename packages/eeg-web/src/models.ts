import {
	WasmAlphaBumpDetector,
	WasmAlphaPeakModel,
	WasmCalmnessModel,
	band_powers as wasmBandPowers,
} from "../wasm/eeg_wasm.js";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** Returned by process() when the model has not yet seen enough samples. */
export type NotReady = { ready: false; samplesNeeded: number };

// ---------------------------------------------------------------------------
// Band powers
// ---------------------------------------------------------------------------

export interface BandPowersReading {
	delta: number;
	theta: number;
	alpha: number;
	beta: number;
	gamma: number;
	total: number;
}

/**
 * Compute band powers and return relative values (each band as a fraction of
 * total) as a plain object. Frees both WASM heap objects automatically.
 */
export function band_powers_relative(
	data: Float32Array,
	sample_rate: number,
): BandPowersReading {
	const abs = wasmBandPowers(data, sample_rate);
	const rel = abs.relative();
	try {
		return {
			delta: rel.delta,
			theta: rel.theta,
			alpha: rel.alpha,
			beta: rel.beta,
			gamma: rel.gamma,
			total: rel.total,
		};
	} finally {
		rel.free();
		abs.free();
	}
}

// ---------------------------------------------------------------------------
// Alpha bump
// ---------------------------------------------------------------------------

export interface AlphaBumpReading {
	ready: true;
	alpha_power: number;
	baseline: number;
	state: string;
	state_changed: boolean;
	previous_state: string | undefined;
	is_high: boolean;
	is_low: boolean;
}

/**
 * Wrapper around WasmAlphaBumpDetector that:
 * - Returns a discriminated union from process() instead of bare undefined
 * - Tracks how many samples have been buffered
 * - Automatically frees WASM result objects
 */
export class AlphaBumpDetector {
	private inner: WasmAlphaBumpDetector;
	private readonly _channelCount: number;
	private _samplesBuffered = 0;

	constructor(sample_rate: number, channel_count: number) {
		this.inner = new WasmAlphaBumpDetector(sample_rate, channel_count);
		this._channelCount = channel_count;
	}

	get minSamples(): number {
		return this.inner.min_samples();
	}

	get samplesBuffered(): number {
		return this._samplesBuffered;
	}

	get samplesNeeded(): number {
		return Math.max(0, this.inner.min_samples() - this._samplesBuffered);
	}

	get name(): string {
		return this.inner.name();
	}

	process(data: Float32Array): NotReady | AlphaBumpReading {
		this._samplesBuffered += Math.floor(data.length / this._channelCount);
		const result = this.inner.process(data);
		if (result === undefined) {
			return { ready: false, samplesNeeded: this.samplesNeeded };
		}
		try {
			return {
				ready: true,
				alpha_power: result.alpha_power,
				baseline: result.baseline,
				state: result.state,
				state_changed: result.state_changed,
				previous_state: result.previous_state,
				is_high: result.is_high(),
				is_low: result.is_low(),
			};
		} finally {
			result.free();
		}
	}

	reset(): void {
		this._samplesBuffered = 0;
		this.inner.reset();
	}

	set_baseline_smoothing(alpha: number): void {
		this.inner.set_baseline_smoothing(alpha);
	}

	set_threshold(multiplier: number): void {
		this.inner.set_threshold(multiplier);
	}

	free(): void {
		this.inner.free();
	}

	[Symbol.dispose](): void {
		this.free();
	}
}

// ---------------------------------------------------------------------------
// Alpha peak
// ---------------------------------------------------------------------------

export interface AlphaPeakReading {
	ready: true;
	alpha_power: number;
	long_term_peak_frequency: number;
	peak_frequency: number;
	peak_power: number;
	smoothed_peak_frequency: number;
	snr: number;
}

/**
 * Wrapper around WasmAlphaPeakModel that:
 * - Returns a discriminated union from process() instead of bare undefined
 * - Tracks how many samples have been buffered
 * - Automatically frees WASM result objects
 */
export class AlphaPeakModel {
	private inner: WasmAlphaPeakModel;
	private readonly _channelCount: number;
	private _samplesBuffered = 0;

	constructor(sample_rate: number, channel_count: number) {
		this.inner = new WasmAlphaPeakModel(sample_rate, channel_count);
		this._channelCount = channel_count;
	}

	get minSamples(): number {
		return this.inner.min_samples();
	}

	get samplesBuffered(): number {
		return this._samplesBuffered;
	}

	get samplesNeeded(): number {
		return Math.max(0, this.inner.min_samples() - this._samplesBuffered);
	}

	get name(): string {
		return this.inner.name();
	}

	process(data: Float32Array): NotReady | AlphaPeakReading {
		this._samplesBuffered += Math.floor(data.length / this._channelCount);
		const result = this.inner.process(data);
		if (result === undefined) {
			return { ready: false, samplesNeeded: this.samplesNeeded };
		}
		try {
			return {
				ready: true,
				alpha_power: result.alpha_power,
				long_term_peak_frequency: result.long_term_peak_frequency,
				peak_frequency: result.peak_frequency,
				peak_power: result.peak_power,
				smoothed_peak_frequency: result.smoothed_peak_frequency,
				snr: result.snr,
			};
		} finally {
			result.free();
		}
	}

	reset(): void {
		this._samplesBuffered = 0;
		this.inner.reset();
	}

	set_smoothing(alpha: number): void {
		this.inner.set_smoothing(alpha);
	}

	free(): void {
		this.inner.free();
	}

	[Symbol.dispose](): void {
		this.free();
	}
}

// ---------------------------------------------------------------------------
// Calmness
// ---------------------------------------------------------------------------

export interface CalmnessReading {
	ready: true;
	alpha_beta_ratio: number;
	alpha_power: number;
	beta_power: number;
	score: number;
	smoothed_score: number;
	theta_level: number;
	theta_power: number;
	percentage: number;
	state_description: string;
}

/**
 * Wrapper around WasmCalmnessModel that:
 * - Returns a discriminated union from process() instead of bare undefined
 * - Tracks how many samples have been buffered
 * - Automatically frees WASM result objects
 */
export class CalmnessModel {
	private inner: WasmCalmnessModel;
	private readonly _channelCount: number;
	private _samplesBuffered = 0;

	constructor(sample_rate: number, channel_count: number) {
		this.inner = new WasmCalmnessModel(sample_rate, channel_count);
		this._channelCount = channel_count;
	}

	get minSamples(): number {
		return this.inner.min_samples();
	}

	get samplesBuffered(): number {
		return this._samplesBuffered;
	}

	get samplesNeeded(): number {
		return Math.max(0, this.inner.min_samples() - this._samplesBuffered);
	}

	get name(): string {
		return this.inner.name();
	}

	process(data: Float32Array): NotReady | CalmnessReading {
		this._samplesBuffered += Math.floor(data.length / this._channelCount);
		const result = this.inner.process(data);
		if (result === undefined) {
			return { ready: false, samplesNeeded: this.samplesNeeded };
		}
		try {
			return {
				ready: true,
				alpha_beta_ratio: result.alpha_beta_ratio,
				alpha_power: result.alpha_power,
				beta_power: result.beta_power,
				score: result.score,
				smoothed_score: result.smoothed_score,
				theta_level: result.theta_level,
				theta_power: result.theta_power,
				percentage: result.percentage(),
				state_description: result.state_description(),
			};
		} finally {
			result.free();
		}
	}

	reset(): void {
		this._samplesBuffered = 0;
		this.inner.reset();
	}

	set_smoothing(alpha: number): void {
		this.inner.set_smoothing(alpha);
	}

	free(): void {
		this.inner.free();
	}

	[Symbol.dispose](): void {
		this.free();
	}
}
