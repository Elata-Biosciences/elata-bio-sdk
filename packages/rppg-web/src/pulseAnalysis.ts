import {
	computeWaveformPeriodicityProfile,
	type WaveformPeriodicityProfile,
} from "./rppgDiagnostics";
import { computeSignalSnrDb } from "./rppgSignalModel";

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

	const peaksDetected = detectPeaks(
		samples.map((sample, idx) => ({ value: norm[idx], time: sample.timestampMs })),
		spectral?.bpm ?? acf?.bpm ?? null,
	);
	const peakBpm =
		peaksDetected.length >= 2 ? bpmFromPeaks(peaksDetected) : null;
	const hrvRmssd = rmssdFromPeaks(peaksDetected);

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
			const last = peaks[peaks.length - 1];
			if (!last || data[i].time - last.time > minPeakDistance) {
				peaks.push(data[i]);
			}
		}
	}
	return peaks;
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

export function rmssdFromPeaks(peaks: PulsePeak[]): number | null {
	if (peaks.length < 4) return null;
	const ibisMs: number[] = [];
	for (let i = 0; i < peaks.length - 1; i++) {
		const dt = peaks[i + 1].time - peaks[i].time;
		if (dt > 0) ibisMs.push(dt);
	}
	if (ibisMs.length < 3) return null;
	const diffs: number[] = [];
	for (let i = 0; i < ibisMs.length - 1; i++) {
		diffs.push(ibisMs[i + 1] - ibisMs[i]);
	}
	if (!diffs.length) return null;
	const meanSq = diffs.reduce((a, b) => a + b * b, 0) / diffs.length;
	return Math.sqrt(meanSq);
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
