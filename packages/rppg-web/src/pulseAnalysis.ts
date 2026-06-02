import {
	computeWaveformPeriodicityProfile,
	type WaveformPeriodicityProfile,
} from "./rppgDiagnostics";
import { computeSignalSnrDb, zeroPhaseBandpass } from "./rppgSignalModel";

export type HarmonicRelation = "fundamental" | "half" | "double";

export type PulseWindowSample = {
	timestampMs: number;
	intensity: number;
	skinRatio: number;
	motion: number;
	clipRatio: number;
};

export type PulseEstimatorResult = {
	bpm: number;
	confidence: number;
};

export type PulseAcfResult = PulseEstimatorResult & {
	harmonicRelation?: HarmonicRelation;
};

export type PulsePeak = {
	value: number;
	time: number;
};

export type PulseWindowAnalysis = {
	spectral: PulseEstimatorResult | null;
	acf: PulseAcfResult | null;
	peaks: PulseEstimatorResult | null;
	waveformProfile: WaveformPeriodicityProfile | null;
	respiration: number | null;
	hrvRmssd: number | null;
	quality: number;
	snrDb: number;
	nowMs: number;
	motionMean: number;
};

const BPM_MIN = 40;
const BPM_MAX = 180;

export function analyzePulseWindow(
	samples: PulseWindowSample[],
): PulseWindowAnalysis | null {
	const n = samples.length;
	if (n < 24) return null;

	const nowMs = samples[n - 1].timestampMs;
	const startMs = samples[0].timestampMs;
	const durationSec = Math.max(1e-3, (nowMs - startMs) / 1000);
	const fs = (n - 1) / durationSec;
	if (!Number.isFinite(fs) || fs < 5) return null;

	const values = samples.map((s) => s.intensity);
	const norm = temporalNormalize(values);
	const snrDb = computeSignalSnrDb(norm);

	const spectral = estimateDominantBpm(norm, fs, 0.7, 3.3);
	const acf = calculateBpmViaAutocorrelation(norm, fs, spectral?.bpm ?? null);
	const waveformProfile = computeWaveformPeriodicityProfile(norm, fs);

	const signalPoints = samples.map((sample, idx) => ({
		value: norm[idx],
		time: sample.timestampMs,
	}));
	const peaksDetected = detectPeaks(signalPoints, spectral?.bpm ?? acf?.bpm ?? null);
	const peakBpm =
		peaksDetected.length >= 2 ? bpmFromPeaks(peaksDetected) : null;

	// HRV: prefer continuous-time Hilbert-phase beat timing. Its 2*pi phase
	// crossings are sub-frame accurate (informed by the whole window), giving a
	// steadier beat-to-beat RMSSD than the frame-grid peak picker; centering the
	// band on the detected rate rejects the half-rate sub-harmonic. Fall back to
	// the peak-based RMSSD when the analytic phase can't resolve enough beats
	// (short or non-periodic windows). Both paths reuse rmssdFromPeaks' ectopic-
	// interval rejection so only the beat-timing source differs.
	const hilbertBeats = detectBeatsViaHilbertPhase(signalPoints, {
		sampleRate: fs,
		centerBpm: spectral?.bpm ?? acf?.bpm ?? null,
	});
	const hrvRmssd =
		rmssdFromPeaks(hilbertBeats.beatTimesMs.map((time) => ({ value: 1, time }))) ??
		rmssdFromPeaks(peaksDetected);

	const respirationEstimate = estimateDominantBpm(norm, fs, 0.08, 0.5);
	const respiration =
		respirationEstimate &&
		respirationEstimate.bpm >= 4 &&
		respirationEstimate.bpm <= 24
			? respirationEstimate.bpm
			: null;

	const skinMean =
		samples.reduce((acc, sample) => acc + clamp(sample.skinRatio, 0, 1), 0) / n;
	const motionMean =
		samples.reduce((acc, sample) => acc + clamp(sample.motion, 0, 1), 0) / n;
	const clipMean =
		samples.reduce((acc, sample) => acc + clamp(sample.clipRatio, 0, 1), 0) / n;
	const quality = clamp(
		skinMean * (1 - motionMean * 0.6) * (1 - clipMean * 0.7),
		0,
		1,
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
		motionMean,
	};
}

export function estimateDominantBpm(
	data: number[],
	sampleRate: number,
	minHz: number,
	maxHz: number,
): PulseEstimatorResult | null {
	const n = data.length;
	if (n < 60 || sampleRate <= 0) return null;
	const mean = data.reduce((a, b) => a + b, 0) / n;
	const centered = data.map((v) => v - mean);
	const stepHz = 0.05;
	let bestBpm = 0;
	let bestMag = 0;

	const getMagnitude = (hz: number): number => {
		const omega = (2 * Math.PI * hz) / sampleRate;
		let sinAcc = 0;
		let cosAcc = 0;
		for (let i = 0; i < n; i++) {
			const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
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
	const confidence =
		energy > 1e-9 ? clamp(bestMag / (Math.sqrt(energy) + 1e-9), 0, 1) : 0;
	return { bpm: bestBpm, confidence };
}

export function calculateBpmViaAutocorrelation(
	data: number[],
	fps: number,
	bpmHint: number | null,
): PulseAcfResult | null {
	const n = data.length;
	if (n < 60 || fps <= 0) return null;

	const mean = data.reduce((a, b) => a + b, 0) / n;
	const centered = data.map((x) => x - mean);
	const energy = centered.reduce((a, b) => a + b * b, 0);
	if (energy <= 0) return null;

	const minLag = Math.max(1, Math.floor((fps * 60) / BPM_MAX));
	const maxLag = Math.max(minLag + 1, Math.ceil((fps * 60) / BPM_MIN));

	const lagScores = new Map<number, number>();
	const lagScorer = (lag: number): number => {
		const existing = lagScores.get(lag);
		if (existing != null) return existing;
		if (lag <= 0 || lag >= n) return 0;
		let sum = 0;
		for (let i = 0; i < n - lag; i++) {
			sum += centered[i] * centered[i + lag];
		}
		let weight = 1;
		if (bpmHint) {
			const lagBpm = (60 * fps) / lag;
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

	const build = (lag: number): PulseEstimatorResult & { lag: number } | null => {
		if (lag < minLag || lag > maxLag || lag >= n) return null;
		const score = lagScorer(lag);
		const bpm = (60 * fps) / lag;
		if (!Number.isFinite(bpm)) return null;
		const confidence = clamp((Math.max(0, score) * 2) / energy, 0, 1);
		return { lag, bpm, confidence };
	};

	let winning = build(bestLag);
	let relation: HarmonicRelation = "fundamental";
	const half = build(Math.floor(bestLag / 2));
	const dbl = build(Math.floor(bestLag * 2));

	if (winning && half && winning.bpm < 70 && half.bpm <= BPM_MAX) {
		const ratio =
			winning.confidence > 0 ? half.confidence / winning.confidence : 0;
		if (
			ratio >= 0.75 ||
			(bpmHint != null && Math.abs(half.bpm - bpmHint) < 12 && ratio >= 0.4)
		) {
			winning = half;
			relation = "double";
		}
	}

	if (
		winning &&
		dbl &&
		winning.bpm > 110 &&
		dbl.bpm >= BPM_MIN &&
		dbl.confidence >= winning.confidence * 0.95
	) {
		winning = dbl;
		relation = "half";
	}

	if (!winning) return null;
	return {
		bpm: winning.bpm,
		confidence: clamp(winning.confidence, 0, 1),
		harmonicRelation: relation,
	};
}

export function detectPeaks(
	data: PulsePeak[],
	bpmHint: number | null,
): PulsePeak[] {
	if (data.length < 5) return [];
	const values = data.map((point) => point.value);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min;
	if (range < 1e-4) return [];

	const threshold = min + range * 0.35;
	let minPeakDistance = 270;
	if (bpmHint) {
		minPeakDistance = Math.min(400, Math.max(200, (60000 / bpmHint) * 0.6));
	}

	const peaks: PulsePeak[] = [];
	for (let i = 1; i < data.length - 1; i++) {
		const prev = data[i - 1].value;
		const curr = data[i].value;
		const next = data[i + 1].value;
		if (curr > threshold && curr > prev && curr > next) {
			// Refine the peak location to sub-sample precision via parabolic
			// interpolation. Without this, every peak time is quantized to the
			// sample grid (10-33 ms at typical PPG/camera rates), which swamps
			// the beat-to-beat differences HRV is built from.
			const refined = refinePeakByInterpolation(data[i - 1], data[i], data[i + 1]);
			const last = peaks[peaks.length - 1];
			if (!last || refined.time - last.time > minPeakDistance) {
				peaks.push(refined);
			}
		}
	}
	return peaks;
}

/**
 * Estimate the true vertex of a peak by fitting a parabola through the peak
 * sample and its two neighbours. Returns the interpolated time (and value at
 * that time). Falls back to the centre sample when the three points are
 * collinear or the vertex would land outside the neighbour interval, which can
 * happen on noisy or clipped signals.
 */
export function refinePeakByInterpolation(
	prev: PulsePeak,
	curr: PulsePeak,
	next: PulsePeak,
): PulsePeak {
	const x0 = prev.time;
	const x1 = curr.time;
	const x2 = next.time;
	const y0 = prev.value;
	const y1 = curr.value;
	const y2 = next.value;

	// Vertex of the parabola y = a*x^2 + b*x + c through three arbitrary points,
	// i.e. -b / (2a) expressed without forming the ill-conditioned coefficients.
	const denom = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
	if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) {
		return curr;
	}
	const numer = x0 * x0 * (y1 - y2) + x1 * x1 * (y2 - y0) + x2 * x2 * (y0 - y1);
	const vertexTime = numer / (2 * denom);

	if (!Number.isFinite(vertexTime) || vertexTime <= x0 || vertexTime >= x2) {
		return curr;
	}

	// Evaluate the fitted parabola at the vertex so the reported value matches
	// the refined time rather than the raw sample amplitude.
	const a =
		(y0 * (x1 - x2) + y1 * (x2 - x0) + y2 * (x0 - x1)) /
		((x0 - x1) * (x0 - x2) * (x1 - x2));
	// y = a(x - h)^2 + k with vertex (h, k); k = y1 - a(x1 - h)^2.
	const vertexValue = y1 - a * (vertexTime - x1) * (vertexTime - x1);

	return {
		time: vertexTime,
		value: Number.isFinite(vertexValue) ? vertexValue : y1,
	};
}

export function bpmFromPeaks(
	peaks: PulsePeak[],
): PulseEstimatorResult | null {
	if (peaks.length < 2) return null;
	const ibis: number[] = [];
	for (let i = 0; i < peaks.length - 1; i++) {
		const dt = (peaks[i + 1].time - peaks[i].time) / 1000;
		if (dt > 0) ibis.push(dt);
	}
	if (!ibis.length) return null;
	const meanIbi = ibis.reduce((a, b) => a + b, 0) / ibis.length;
	if (meanIbi <= 0) return null;
	const bpm = 60 / meanIbi;
	if (bpm < BPM_MIN || bpm > BPM_MAX) return null;
	const sd = std(ibis);
	const cov = meanIbi > 0 ? sd / meanIbi : 1;
	const confidence = clamp(1 - cov * 1.5, 0, 1);
	return { bpm, confidence };
}

// Plausible inter-beat interval range: 300 ms (200 bpm) to 2000 ms (30 bpm).
const IBI_MIN_MS = 300;
const IBI_MAX_MS = 2000;
// Reject a beat whose interval deviates more than this fraction from the
// running median — a standard ectopic/missed-beat guard for RMSSD.
const IBI_OUTLIER_FRACTION = 0.3;

/**
 * Build the inter-beat-interval series from peaks, tagging each interval as a
 * valid NN interval or an artifact. Artifacts are intervals outside the
 * physiological range or deviating sharply from the running median (ectopic or
 * missed beats). Adjacency is preserved so RMSSD can be computed only across
 * consecutive normal beats.
 */
function buildTaggedIntervals(
	peaks: PulsePeak[],
): Array<{ ms: number; valid: boolean }> {
	const intervals: Array<{ ms: number; valid: boolean }> = [];
	for (let i = 0; i < peaks.length - 1; i++) {
		const dt = peaks[i + 1].time - peaks[i].time;
		intervals.push({ ms: dt, valid: dt >= IBI_MIN_MS && dt <= IBI_MAX_MS });
	}

	const median = medianOf(
		intervals.filter((iv) => iv.valid).map((iv) => iv.ms),
	);
	if (median != null) {
		for (const iv of intervals) {
			if (iv.valid && Math.abs(iv.ms - median) > median * IBI_OUTLIER_FRACTION) {
				iv.valid = false;
			}
		}
	}
	return intervals;
}

/**
 * Cleaned NN intervals (in ms) suitable for time-domain HRV metrics such as
 * SDNN and mean NN. Peak times are already sub-sample refined by
 * {@link detectPeaks}; this additionally drops artifact intervals.
 */
export function cleanNnIntervalsMs(peaks: PulsePeak[]): number[] {
	return buildTaggedIntervals(peaks)
		.filter((iv) => iv.valid)
		.map((iv) => iv.ms);
}

export function rmssdFromPeaks(peaks: PulsePeak[]): number | null {
	if (peaks.length < 4) return null;

	const intervals = buildTaggedIntervals(peaks);
	if (intervals.length < 3) return null;

	// Successive differences only between adjacent intervals that are both valid.
	const diffs: number[] = [];
	for (let i = 0; i < intervals.length - 1; i++) {
		if (intervals[i].valid && intervals[i + 1].valid) {
			diffs.push(intervals[i + 1].ms - intervals[i].ms);
		}
	}
	if (diffs.length < 2) return null;

	const meanSq = diffs.reduce((a, b) => a + b * b, 0) / diffs.length;
	return Math.sqrt(meanSq);
}

function medianOf(values: number[]): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
}

export function temporalNormalize(data: number[]): number[] {
	if (!data.length) return [];
	const mean = data.reduce((a, b) => a + b, 0) / data.length;
	let variance = 0;
	for (let i = 0; i < data.length; i++) {
		const delta = data[i] - mean;
		variance += delta * delta;
	}
	variance /= data.length;
	const std = Math.sqrt(variance);
	if (!Number.isFinite(std) || std < 1e-8) {
		return new Array(data.length).fill(0);
	}
	return data.map((value) => (value - mean) / std);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function std(values: number[]): number {
	if (values.length < 2) return 0;
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	let acc = 0;
	for (let i = 0; i < values.length; i++) {
		const delta = values[i] - mean;
		acc += delta * delta;
	}
	return Math.sqrt(acc / values.length);
}

/**
 * Standard time-domain RMSSD (ms) over an inter-beat-interval series (ms):
 * RMSSD = sqrt( mean of squared *successive* differences ). Returns null for
 * fewer than two intervals. This computes RMSSD directly from an interval
 * series; {@link rmssdFromPeaks} is the peak-based path with ectopic-beat
 * rejection — they share this same underlying formula.
 */
export function computeRmssdMs(ibisMs: number[]): number | null {
	if (ibisMs.length < 2) return null;
	let sumSq = 0;
	for (let i = 1; i < ibisMs.length; i++) {
		const d = ibisMs[i] - ibisMs[i - 1];
		sumSq += d * d;
	}
	return Math.sqrt(sumSq / (ibisMs.length - 1));
}

// ---------------------------------------------------------------------------
// Hilbert-phase beat timing
//
// Instead of locating each beat as the argmax of a noisy pulse top (quantized
// to the frame interval and informed by only ~3 samples), this estimates beat
// instants from the *phase* of the analytic signal: every beat advances the
// instantaneous phase by 2*pi, and the crossing of each 2*pi level is
// interpolated in continuous time from the surrounding samples. The phase at
// each sample is informed by the whole waveform, so timing is far less
// sensitive to frame quantization and per-peak noise — yielding a steadier
// beat-to-beat RMSSD than the peak picker on the same trace.
// ---------------------------------------------------------------------------

export interface HilbertBeatOptions {
	/** Sample rate (Hz); when given, a zero-phase bandpass narrowbands the cardiac fundamental. */
	sampleRate?: number;
	/** Bandpass edges in Hz (default 0.7-3.5, i.e. ~42-210 bpm). */
	lowHz?: number;
	highHz?: number;
	/**
	 * Locked/known heart rate (bpm). When given, the bandpass is centered on it
	 * (± bandMarginBpm) instead of the wide default, so the analytic phase
	 * advances at the true fundamental and rejects the every-other-beat
	 * sub-harmonic that otherwise corrupts beat-to-beat HRV. The margin stays
	 * wide enough (~±25 bpm) that genuine beat-to-beat variation still passes.
	 */
	centerBpm?: number | null;
	/** Half-width of the adaptive band around centerBpm, in bpm (default 25). */
	bandMarginBpm?: number;
	/** Drop the first/last beat to avoid DFT edge artifacts (default true). */
	trimEdges?: boolean;
}

export interface HilbertBeatResult {
	/** Continuous-time beat instants (same units as input `time`, i.e. ms). */
	beatTimesMs: number[];
	/** Successive inter-beat intervals (ms). */
	ibisMs: number[];
	/** Unwrapped instantaneous phase, for diagnostics/plots. */
	unwrappedPhase: number[];
}

/**
 * Analytic signal z = x + i*Hilbert(x) via a naive DFT/IDFT (O(N^2)). Fine for
 * the few-hundred-sample analysis windows used here. Returns the imaginary
 * part (the Hilbert transform of x); the real part reconstructs x.
 */
function hilbertImag(x: number[]): number[] {
	const N = x.length;
	const Xre = new Array<number>(N).fill(0);
	const Xim = new Array<number>(N).fill(0);
	for (let k = 0; k < N; k++) {
		let re = 0;
		let im = 0;
		for (let n = 0; n < N; n++) {
			const a = (-2 * Math.PI * k * n) / N;
			re += x[n] * Math.cos(a);
			im += x[n] * Math.sin(a);
		}
		Xre[k] = re;
		Xim[k] = im;
	}
	// Hilbert multiplier: keep DC (and Nyquist for even N) as-is, double the
	// positive frequencies, zero the negative frequencies.
	const h = new Array<number>(N).fill(0);
	h[0] = 1;
	if (N % 2 === 0) {
		h[N / 2] = 1;
		for (let k = 1; k < N / 2; k++) h[k] = 2;
	} else {
		for (let k = 1; k < (N + 1) / 2; k++) h[k] = 2;
	}
	for (let k = 0; k < N; k++) {
		Xre[k] *= h[k];
		Xim[k] *= h[k];
	}
	const zim = new Array<number>(N).fill(0);
	for (let n = 0; n < N; n++) {
		let im = 0;
		for (let k = 0; k < N; k++) {
			const a = (2 * Math.PI * k * n) / N;
			im += Xre[k] * Math.sin(a) + Xim[k] * Math.cos(a);
		}
		zim[n] = im / N;
	}
	return zim;
}

function unwrapPhase(phase: number[]): number[] {
	if (phase.length === 0) return [];
	const out = [phase[0]];
	for (let i = 1; i < phase.length; i++) {
		let d = phase[i] - phase[i - 1];
		while (d > Math.PI) d -= 2 * Math.PI;
		while (d < -Math.PI) d += 2 * Math.PI;
		out.push(out[i - 1] + d);
	}
	return out;
}

/**
 * Estimate beat instants from the analytic-signal phase of a pulse waveform.
 * `data` is the conditioned rPPG trace as {value, time(ms)} samples — the same
 * shape consumed by {@link detectPeaks}.
 */
export function detectBeatsViaHilbertPhase(
	data: PulsePeak[],
	options: HilbertBeatOptions = {},
): HilbertBeatResult {
	const {
		sampleRate,
		centerBpm,
		bandMarginBpm = 25,
		trimEdges = true,
	} = options;
	// Adaptive band around a locked rate (rejects the half-rate sub-harmonic);
	// falls back to the wide default when no rate is known.
	let { lowHz = 0.7, highHz = 3.5 } = options;
	if (centerBpm != null && Number.isFinite(centerBpm) && centerBpm > 0) {
		const lo = Math.max(30, centerBpm - bandMarginBpm);
		const hi = Math.min(220, centerBpm + bandMarginBpm);
		lowHz = lo / 60;
		highHz = hi / 60;
	}
	const N = data.length;
	if (N < 8) return { beatTimesMs: [], ibisMs: [], unwrappedPhase: [] };

	const times = data.map((d) => d.time);
	let values = data.map((d) => d.value);

	// Remove mean, then optionally narrowband so the phase advances ~monotonically.
	const avg = values.reduce((a, b) => a + b, 0) / N;
	values = values.map((v) => v - avg);
	if (sampleRate && sampleRate > 0) {
		values = zeroPhaseBandpass(values, sampleRate, lowHz, highHz);
	}

	const im = hilbertImag(values);
	const phase = values.map((re, i) => Math.atan2(im[i], re));
	const uw = unwrapPhase(phase);

	// Each 2*pi crossing of the unwrapped phase marks a beat; interpolate the
	// crossing time linearly between the bracketing samples for sub-frame timing.
	const crossings: number[] = [];
	let level = Math.ceil(uw[0] / (2 * Math.PI)) * (2 * Math.PI);
	for (let n = 1; n < N; n++) {
		while (uw[n] >= level && uw[n - 1] < level) {
			const denom = uw[n] - uw[n - 1];
			const frac = denom > 0 ? (level - uw[n - 1]) / denom : 0;
			crossings.push(times[n - 1] + frac * (times[n] - times[n - 1]));
			level += 2 * Math.PI;
		}
	}

	let beats = crossings;
	if (trimEdges && beats.length >= 3) {
		beats = beats.slice(1, beats.length - 1);
	}
	const ibisMs: number[] = [];
	for (let i = 1; i < beats.length; i++) {
		ibisMs.push(beats[i] - beats[i - 1]);
	}
	return { beatTimesMs: beats, ibisMs, unwrappedPhase: uw };
}
