import type { HeadbandClockSource, HeadbandFrameV1 } from "@elata-biosciences/eeg-web";
import {
	analyzePulseWindow,
	detectPeaks,
	temporalNormalize,
	type PulsePeak,
} from "@elata-biosciences/rppg-web";

export type PpgSource = "ppgRaw" | "optics";
export type PpgSourcePreference = PpgSource | "auto";
export type PpgChannelPreference = string | number | "auto";

export type PpgReasonCode =
	| "no_signal"
	| "insufficient_window"
	| "low_signal_quality"
	| "estimators_disagree"
	| "insufficient_ibi";

export interface PpgProcessorOptions {
	windowSec?: number;
	source?: PpgSourcePreference;
	channel?: PpgChannelPreference;
}

export interface PpgMetrics {
	bpm: number | null;
	rmssdMs: number | null;
	sdnnMs: number | null;
	meanNnMs: number | null;
	confidence: number;
	signalQuality: number;
	source: PpgSource | null;
	channel: string | null;
	sampleRateHz: number | null;
	windowSampleCount: number;
	windowDurationMs: number;
	lastSampleTimestampMs: number | null;
	emittedAtMs: number | null;
	spectralBpm: number | null;
	acfBpm: number | null;
	peaksBpm: number | null;
	respirationBpm: number | null;
	snrDb: number | null;
	waveformConfidence: number | null;
	ibiCount: number;
	reasonCodes: PpgReasonCode[];
}

export interface PpgChannelCandidate {
	source: PpgSource;
	channel: string;
	score: number;
	confidence: number;
	signalQuality: number;
	bpm: number | null;
	rmssdMs: number | null;
	sdnnMs: number | null;
	meanNnMs: number | null;
	windowSampleCount: number;
	windowDurationMs: number;
	sampleRateHz: number;
	lastSampleTimestampMs: number | null;
	reasonCodes: PpgReasonCode[];
}

export interface PpgDebugSnapshot {
	framesSeen: number;
	sourcesSeen: PpgSource[];
	channelsSeen: string[];
	selectedSource: PpgSource | null;
	selectedChannel: string | null;
	lastFrameAtMs: number | null;
	lastSampleTimestampMs: number | null;
	issues: PpgReasonCode[];
	candidates: PpgChannelCandidate[];
}

export interface PpgTraceSnapshot {
	source: PpgSource | null;
	channel: string | null;
	points: Array<{ timestampMs: number; value: number }>;
	peaks: Array<{ timestampMs: number; value: number }>;
	sampleRateHz: number | null;
}

type StreamKey = `${PpgSource}:${string}`;

type InternalSample = {
	timestampMs: number;
	intensity: number;
	skinRatio: number;
	motion: number;
	clipRatio: number;
};

type InternalStream = {
	source: PpgSource;
	channel: string;
	sampleRateHz: number;
	clockSource: HeadbandClockSource | null;
	lastFrameAtMs: number | null;
	lastTimestampMs: number | null;
	motionScale: number;
	samples: InternalSample[];
};

type CandidateComputation = PpgChannelCandidate & {
	spectralBpm: number | null;
	acfBpm: number | null;
	peaksBpm: number | null;
	respirationBpm: number | null;
	snrDb: number | null;
	waveformConfidence: number | null;
	ibiCount: number;
	points: Array<{ timestampMs: number; value: number }>;
	peaks: PulsePeak[];
};

const DEFAULT_WINDOW_SEC = 16;

export class PpgProcessor {
	private readonly options: Required<PpgProcessorOptions>;
	private readonly streams = new Map<StreamKey, InternalStream>();
	private metrics: PpgMetrics = emptyMetrics();
	private selectedTrace: PpgTraceSnapshot = {
		source: null,
		channel: null,
		points: [],
		peaks: [],
		sampleRateHz: null,
	};
	private lastCandidates: PpgChannelCandidate[] = [];
	private framesSeen = 0;
	private lastFrameAtMs: number | null = null;

	constructor(options: PpgProcessorOptions = {}) {
		this.options = {
			windowSec: options.windowSec ?? DEFAULT_WINDOW_SEC,
			source: options.source ?? "auto",
			channel: options.channel ?? "auto",
		};
	}

	pushFrame(frame: HeadbandFrameV1): void {
		this.framesSeen += 1;
		this.lastFrameAtMs = frame.emittedAtMs;
		this.ingestBlock(frame, "ppgRaw");
		this.ingestBlock(frame, "optics");
		this.recomputeMetrics(frame.emittedAtMs);
	}

	reset(): void {
		this.streams.clear();
		this.metrics = emptyMetrics();
		this.selectedTrace = {
			source: null,
			channel: null,
			points: [],
			peaks: [],
			sampleRateHz: null,
		};
		this.lastCandidates = [];
		this.framesSeen = 0;
		this.lastFrameAtMs = null;
	}

	getMetrics(): PpgMetrics {
		return { ...this.metrics, reasonCodes: this.metrics.reasonCodes.slice() };
	}

	getDebugSnapshot(): PpgDebugSnapshot {
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
				reasonCodes: candidate.reasonCodes.slice(),
			})),
		};
	}

	getTraceSnapshot(maxPoints = 300): PpgTraceSnapshot {
		return {
			source: this.selectedTrace.source,
			channel: this.selectedTrace.channel,
			sampleRateHz: this.selectedTrace.sampleRateHz,
			points: downsample(this.selectedTrace.points, maxPoints),
			peaks: downsample(this.selectedTrace.peaks, Math.min(64, maxPoints)),
		};
	}

	private ingestBlock(frame: HeadbandFrameV1, source: PpgSource): void {
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
			frame.emittedAtMs,
		);

		for (let channelIndex = 0; channelIndex < block.channelCount; channelIndex++) {
			const channelName =
				block.channelNames[channelIndex] ?? `${source.toUpperCase()}${channelIndex + 1}`;
			if (!this.channelMatches(channelName, channelIndex)) continue;
			const stream = this.getOrCreateStream(
				source,
				channelName,
				block.sampleRateHz,
				block.clockSource ?? null,
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
				stream.motionScale =
					stream.motionScale <= 0
						? delta || 1
						: stream.motionScale * 0.94 + delta * 0.06;

				stream.samples.push({
					timestampMs,
					intensity,
					skinRatio: 1,
					motion:
						prev && stream.motionScale > 0
							? clamp(delta / (stream.motionScale * 4), 0, 1)
							: 0,
					clipRatio: 0,
				});
				stream.lastTimestampMs = timestampMs;
			}

			const cutoff =
				(stream.lastTimestampMs ?? frame.emittedAtMs) - this.options.windowSec * 1000;
			while (stream.samples.length > 1 && stream.samples[0].timestampMs < cutoff) {
				stream.samples.shift();
			}
		}
	}

	private recomputeMetrics(nowMs: number): void {
		const candidates: CandidateComputation[] = [];

		for (const stream of this.streams.values()) {
			const candidate = buildCandidate(stream);
			if (candidate) candidates.push(candidate);
		}

		this.lastCandidates = candidates.map(stripCandidateTrace);

		if (!candidates.length) {
			this.metrics = {
				...emptyMetrics(),
				emittedAtMs: nowMs,
				reasonCodes: ["no_signal"],
			};
			this.selectedTrace = {
				source: null,
				channel: null,
				points: [],
				peaks: [],
				sampleRateHz: null,
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
			reasonCodes: winner.reasonCodes.slice(),
		};
		this.selectedTrace = {
			source: winner.source,
			channel: winner.channel,
			points: winner.points,
			peaks: winner.peaks.map((peak) => ({
				timestampMs: peak.time,
				value: peak.value,
			})),
			sampleRateHz: winner.sampleRateHz,
		};
	}

	private resolveTimestamps(
		source: PpgSource,
		channelNames: string[],
		sampleRateHz: number,
		timestampsMs: number[] | undefined,
		rowCount: number,
		fallbackEndMs: number,
	): number[] {
		if (timestampsMs && timestampsMs.length === rowCount) {
			return timestampsMs.slice();
		}

		const dt = 1000 / sampleRateHz;
		const anchorStream = channelNames[0]
			? this.streams.get(makeStreamKey(source, channelNames[0]))
			: null;
		let startMs = fallbackEndMs - (rowCount - 1) * dt;
		if (anchorStream?.lastTimestampMs != null) {
			const continued = anchorStream.lastTimestampMs + dt;
			if (continued > startMs - dt * 4 && continued < fallbackEndMs + dt * 4) {
				startMs = continued;
			}
		}

		return Array.from({ length: rowCount }, (_, index) => startMs + index * dt);
	}

	private getOrCreateStream(
		source: PpgSource,
		channel: string,
		sampleRateHz: number,
		clockSource: HeadbandClockSource | null,
	): InternalStream {
		const key = makeStreamKey(source, channel);
		const existing = this.streams.get(key);
		if (existing) return existing;
		const created: InternalStream = {
			source,
			channel,
			sampleRateHz,
			clockSource,
			lastFrameAtMs: null,
			lastTimestampMs: null,
			motionScale: 1,
			samples: [],
		};
		this.streams.set(key, created);
		return created;
	}

	private sourceMatches(source: PpgSource): boolean {
		return this.options.source === "auto" || this.options.source === source;
	}

	private channelMatches(channelName: string, channelIndex: number): boolean {
		if (this.options.channel === "auto") return true;
		if (typeof this.options.channel === "number") return this.options.channel === channelIndex;
		return this.options.channel === channelName;
	}
}

function buildCandidate(stream: InternalStream): CandidateComputation | null {
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
			windowDurationMs:
				sampleCount > 1
					? Math.round(lastSample.timestampMs - stream.samples[0].timestampMs)
					: 0,
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
				value: sample.intensity,
			})),
			peaks: [],
		};
	}

	const normalized = temporalNormalize(stream.samples.map((sample) => sample.intensity));
	const points = stream.samples.map((sample, index) => ({
		timestampMs: sample.timestampMs,
		value: sample.intensity,
		normalized: normalized[index] ?? 0,
	}));
	const peaks = detectPeaks(
		points.map((point) => ({ time: point.timestampMs, value: point.normalized })),
		analysis.peaks?.bpm ?? analysis.spectral?.bpm ?? analysis.acf?.bpm ?? null,
	);
	const ibisMs = computeIbisMs(peaks);
	const meanNnMs = ibisMs.length ? average(ibisMs) : null;
	const sdnnMs = ibisMs.length >= 2 ? stddev(ibisMs) : null;
	const agreement = computeAgreement([
		analysis.spectral?.bpm ?? null,
		analysis.acf?.bpm ?? null,
		analysis.peaks?.bpm ?? null,
	]);
	const estimatorConfidence = average(
		[
			analysis.spectral?.confidence ?? null,
			analysis.acf?.confidence ?? null,
			analysis.peaks?.confidence ?? null,
		].filter((value): value is number => value != null),
	);
	const waveformConfidence = analysis.waveformProfile?.confidence ?? 0;
	const snrScore = clamp(((analysis.snrDb ?? -12) + 12) / 24, 0, 1);
	const signalQuality = clamp(
		estimatorConfidence * 0.35 +
			waveformConfidence * 0.25 +
			agreement * 0.25 +
			snrScore * 0.15,
		0,
		1,
	);
	const confidence = clamp(
		estimatorConfidence * 0.45 + agreement * 0.35 + waveformConfidence * 0.2,
		0,
		1,
	);
	const bpm = resolveBpm(analysis);
	const score =
		signalQuality * 0.65 +
		confidence * 0.25 +
		(bpm != null ? 0.1 : 0) +
		(analysis.hrvRmssd != null ? 0.05 : 0);

	const reasons: PpgReasonCode[] = [];
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
			stream.samples[stream.samples.length - 1].timestampMs -
				stream.samples[0].timestampMs,
		),
		sampleRateHz: stream.sampleRateHz,
		lastSampleTimestampMs:
			stream.samples[stream.samples.length - 1]?.timestampMs ?? null,
		reasonCodes: reasons,
		spectralBpm: analysis.spectral?.bpm != null ? round(analysis.spectral.bpm) : null,
		acfBpm: analysis.acf?.bpm != null ? round(analysis.acf.bpm) : null,
		peaksBpm: analysis.peaks?.bpm != null ? round(analysis.peaks.bpm) : null,
		respirationBpm:
			analysis.respiration != null ? round(analysis.respiration) : null,
		snrDb: Number.isFinite(analysis.snrDb) ? round(analysis.snrDb) : null,
		waveformConfidence: round(waveformConfidence),
		ibiCount: ibisMs.length,
		points: points.map((point) => ({
			timestampMs: point.timestampMs,
			value: point.value,
		})),
		peaks,
	};
}

function resolveBpm(
	analysis: ReturnType<typeof analyzePulseWindow>,
): number | null {
	if (!analysis) return null;
	const candidates = [
		analysis.peaks ? { bpm: analysis.peaks.bpm, confidence: analysis.peaks.confidence } : null,
		analysis.spectral
			? { bpm: analysis.spectral.bpm, confidence: analysis.spectral.confidence }
			: null,
		analysis.acf ? { bpm: analysis.acf.bpm, confidence: analysis.acf.confidence } : null,
	].filter(
		(candidate): candidate is { bpm: number; confidence: number } => candidate != null,
	);
	if (!candidates.length) return null;

	candidates.sort((left, right) => right.confidence - left.confidence);
	const anchor = candidates[0];
	const support = candidates.filter(
		(candidate) => Math.abs(candidate.bpm - anchor.bpm) <= 10,
	);
	const totalWeight = support.reduce((acc, candidate) => acc + candidate.confidence, 0);
	if (totalWeight <= 0) return anchor.bpm;
	return (
		support.reduce(
			(acc, candidate) => acc + candidate.bpm * candidate.confidence,
			0,
		) / totalWeight
	);
}

function computeAgreement(values: Array<number | null>): number {
	const valid = values.filter((value): value is number => value != null);
	if (valid.length <= 1) return valid.length === 1 ? 0.5 : 0;
	const mean = average(valid);
	const spread = average(valid.map((value) => Math.abs(value - mean)));
	return clamp(1 - spread / 18, 0, 1);
}

function computeIbisMs(peaks: PulsePeak[]): number[] {
	const ibis: number[] = [];
	for (let index = 0; index < peaks.length - 1; index++) {
		const delta = peaks[index + 1].time - peaks[index].time;
		if (delta > 0) ibis.push(delta);
	}
	return ibis;
}

function stripCandidateTrace(candidate: CandidateComputation): PpgChannelCandidate {
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
		reasonCodes: candidate.reasonCodes.slice(),
	};
}

function emptyMetrics(): PpgMetrics {
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
		reasonCodes: ["no_signal"],
	};
}

function makeStreamKey(source: PpgSource, channel: string): StreamKey {
	return `${source}:${channel}`;
}

function downsample<T>(items: T[], maxCount: number): T[] {
	if (items.length <= maxCount) return items.slice();
	const step = items.length / maxCount;
	const result: T[] = [];
	for (let index = 0; index < maxCount; index++) {
		result.push(items[Math.floor(index * step)]);
	}
	return result;
}

function average(values: number[]): number {
	if (!values.length) return 0;
	return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function stddev(values: number[]): number {
	if (values.length < 2) return 0;
	const mean = average(values);
	const variance =
		values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
	return Math.sqrt(variance);
}

function uniqueSorted<T extends string>(values: T[]): T[] {
	return Array.from(new Set(values)).sort();
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
	return Number(value.toFixed(3));
}
