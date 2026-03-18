import type { RppgTraceSnapshot } from "./rppgProcessor";

export interface WaveformPeriodicityProfile {
	minBpm: number;
	maxBpm: number;
	stepBpm: number;
	scores: number[];
	confidence: number;
	dominantBpm: number | null;
	dominantScore: number;
	secondaryBpm: number | null;
	secondaryScore: number;
	contrast: number;
	entropy: number;
	topCandidates: Array<{
		bpm: number;
		rawScore: number;
		posterior: number;
		lag: number;
	}>;
}

export interface RppgTraceWaveformDebug {
	points: Array<{
		time: number;
		value: number;
	}>;
	peaks: Array<{
		time: number;
		value: number;
	}>;
	sampleCount: number;
	durationSec: number;
	threshold: number | null;
	min: number | null;
	max: number | null;
	minPeakDistanceSamples: number;
}

export interface ComputeTraceWaveformDebugOptions {
	peakThresholdFactor?: number;
	minPeakDistanceSec?: number;
}

const BPM_MIN = 40;
const BPM_MAX = 180;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function computeTraceWaveformDebug(
	trace: RppgTraceSnapshot,
	options: ComputeTraceWaveformDebugOptions = {},
): RppgTraceWaveformDebug {
	const points = trace.points.map((point) => ({
		time: point.timestampMs,
		value: Number(point.intensity) || 0,
	}));
	if (points.length < 2) {
		return {
			points,
			peaks: [],
			sampleCount: points.length,
			durationSec: trace.durationSec ?? 0,
			threshold: null,
			min: points.length ? Math.min(...points.map((point) => point.value)) : null,
			max: points.length ? Math.max(...points.map((point) => point.value)) : null,
			minPeakDistanceSamples: Math.max(
				2,
				Math.round((trace.sampleRate || 1) * (options.minPeakDistanceSec ?? 0.35)),
			),
		};
	}

	const values = points.map((point) => point.value);
	const max = Math.max(...values);
	const min = Math.min(...values);
	const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
	const threshold = mean + (max - mean) * (options.peakThresholdFactor ?? 0.35);
	const minPeakDistanceSamples = Math.max(
		2,
		Math.round((trace.sampleRate || 1) * (options.minPeakDistanceSec ?? 0.35)),
	);
	const peaks: RppgTraceWaveformDebug["peaks"] = [];

	let lastPeakIndex = -minPeakDistanceSamples;
	for (let index = 1; index < points.length - 1; index += 1) {
		const current = points[index].value;
		if (
			current > threshold &&
			current >= points[index - 1].value &&
			current >= points[index + 1].value &&
			index - lastPeakIndex >= minPeakDistanceSamples
		) {
			peaks.push(points[index]);
			lastPeakIndex = index;
		}
	}

	const durationSec =
		trace.durationSec ??
		Math.max(0, (points[points.length - 1].time - points[0].time) / 1000);

	return {
		points,
		peaks,
		sampleCount: points.length,
		durationSec,
		threshold: Number.isFinite(threshold) ? threshold : null,
		min,
		max,
		minPeakDistanceSamples,
	};
}

export function computeWaveformPeriodicityProfile(
	data: number[],
	sampleRate: number,
	minBpm = BPM_MIN,
	maxBpm = BPM_MAX,
	stepBpm = 1,
): WaveformPeriodicityProfile | null {
	const n = data.length;
	if (n < 60 || sampleRate <= 0 || minBpm >= maxBpm || stepBpm <= 0) {
		return null;
	}

	const mean = data.reduce((sum, value) => sum + value, 0) / n;
	const centered = data.map((value) => value - mean);
	let energy = 0;
	for (let i = 0; i < centered.length; i++) {
		energy += centered[i] * centered[i];
	}
	if (!Number.isFinite(energy) || energy <= 1e-9) return null;

	const lagCache = new Map<number, number>();
	const scoreForLag = (lag: number) => {
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
		const corr = denom > 0 ? (dot / denom) * overlapWeight : -1;
		lagCache.set(lag, corr);
		return corr;
	};

	const bpmGrid: number[] = [];
	const rawScores: number[] = [];
	const lags: number[] = [];
	for (let bpm = minBpm; bpm <= maxBpm + 1e-9; bpm += stepBpm) {
		bpmGrid.push(bpm);
		const lag = Math.round((60 * sampleRate) / bpm);
		lags.push(lag);
		rawScores.push(scoreForLag(lag));
	}
	if (!rawScores.length) return null;

	const sorted = rawScores.slice().sort((a, b) => b - a);
	const bestRaw = sorted[0] ?? -1;
	const medianRaw = sorted[Math.floor(sorted.length / 2)] ?? bestRaw;

	const groupedByLag = new Map<
		number,
		{ lag: number; bpms: number[]; rawScore: number; rawWeight: number }
	>();
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
				rawWeight,
			});
		}
	}

	const candidates = Array.from(groupedByLag.values())
		.map((group) => ({
			lag: group.lag,
			bpm: group.bpms.reduce((sum, value) => sum + value, 0) / group.bpms.length,
			rawScore: group.rawScore,
			rawWeight: group.rawWeight,
		}))
		.sort((a, b) => b.rawWeight - a.rawWeight);

	const totalWeight =
		candidates.reduce((sum, candidate) => sum + candidate.rawWeight, 0) || 1;
	const candidatesWithPosterior = candidates.map((candidate) => ({
		...candidate,
		posterior: candidate.rawWeight / totalWeight,
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
		topMass *
			1.6 *
			(1 - normalizedEntropy * 0.75) *
			clamp(contrast / 0.1, 0.05, 1),
		0,
		1,
	);

	const scoreByLag = new Map<number, number>();
	for (const candidate of candidatesWithPosterior) {
		scoreByLag.set(candidate.lag, clamp(candidate.posterior, 0.01, 1));
	}
	const scores = lags.map((lag) =>
		Number((scoreByLag.get(lag) ?? 0.01).toFixed(6)),
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
			lag: candidate.lag,
		})),
	};
}
