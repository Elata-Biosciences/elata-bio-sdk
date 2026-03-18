import {
	BpmBayesTracker,
	type EstimatorMeasurement,
	type TrackerEstimate,
} from "./bpmBayesTracker";
import {
	computeWaveformPeriodicityProfile,
	type WaveformPeriodicityProfile,
} from "./rppgDiagnostics";
import {
	ChannelGainController,
	ChromPulseModel,
	computeSignalSnrDb,
} from "./rppgSignalModel";

export type Backend = {
	newPipeline: (sampleRate: number, windowSec: number) => any;
};

export type BpmEvidenceSource =
	| "backend"
	| "spectral"
	| "acf"
	| "peaks"
	| "calibrated";
export type HarmonicRelation = "fundamental" | "half" | "double";
export type FusionSource = "camera" | "muse" | "blend" | "none";
type BiquadType = "lowpass" | "highpass";

interface BiquadCoeffs {
	b0: number;
	b1: number;
	b2: number;
	a0: number;
	a1: number;
	a2: number;
}

export type BpmEvidence = {
	source: BpmEvidenceSource;
	bpm: number;
	confidence: number;
	harmonicRelation?: HarmonicRelation;
};

export type BpmResolutionDebugEntry = BpmEvidence & {
	score: number;
	sameSupport: number;
	aliasSupport: number;
	ratioToHistory: number | null;
};

export type BpmResolutionResult = {
	bpm: number | null;
	confidence: number;
	winningSources: BpmEvidenceSource[];
	aliasFlag: boolean;
	debug: {
		candidates: BpmResolutionDebugEntry[];
		historyMedian: number | null;
		winner: BpmResolutionDebugEntry | null;
	};
};

export type Metrics = {
	bpm?: number | null;
	confidence: number;
	signal_quality: number;
	agreement?: number;
	reason_codes?: string[];
	snr?: number;
	skin_ratio_mean?: number;
	motion_mean?: number;
	clip_mean?: number;
	spectral_bpm?: number | null;
	acf_bpm?: number | null;
	peaks_bpm?: number | null;
	resolved_bpm?: number | null;
	resolved_confidence?: number;
	winning_sources?: BpmEvidenceSource[];
	alias_flag?: boolean;
	bayes_bpm?: number | null;
	bayes_confidence?: number;
	calibrated_bpm?: number | null;
	fused_bpm?: number | null;
	fused_source?: FusionSource;
	calibration_trained?: boolean;
	baseline_bpm?: number | null;
	baseline_delta?: number | null;
	hrv_rmssd?: number | null;
	respiration_rate?: number | null;
};

export type RppgDebugIssueCode =
	| "no_samples_yet"
	| "insufficient_window"
	| "no_bpm_yet"
	| "low_signal_quality"
	| "low_confidence"
	| "low_skin_ratio"
	| "excessive_motion"
	| "high_clipping";

export type RppgDebugSnapshot = {
	totalSamplesReceived: number;
	windowSampleCount: number;
	windowDurationMs: number;
	lastSampleTimestampMs: number | null;
	lastSampleAgeMs: number | null;
	lastSample: {
		intensity: number;
		r: number;
		g: number;
		b: number;
		skinRatio: number;
		motion: number;
		clipRatio: number;
	} | null;
	backendMetrics: Metrics;
	issues: RppgDebugIssueCode[];
};

type Sample = {
	timestampMs: number;
	intensity: number;
	r: number;
	g: number;
	b: number;
	skinRatio: number;
	motion: number;
	clipRatio: number;
};

const BPM_MIN = 40;
const BPM_MAX = 180;
const BPM_TOLERANCE = 6;
const DEFAULT_Q = Math.SQRT1_2;

function designBiquad(
	type: BiquadType,
	sampleRate: number,
	cutoffHz: number,
	Q = DEFAULT_Q,
): BiquadCoeffs {
	const nyquistSafe = Math.max(
		0.0001,
		Math.min(cutoffHz, sampleRate / 2 - 0.0001),
	);
	const w0 = (2 * Math.PI * nyquistSafe) / sampleRate;
	const cosw0 = Math.cos(w0);
	const sinw0 = Math.sin(w0);
	const alpha = sinw0 / (2 * Q);

	if (type === "lowpass") {
		return {
			b0: (1 - cosw0) / 2,
			b1: 1 - cosw0,
			b2: (1 - cosw0) / 2,
			a0: 1 + alpha,
			a1: -2 * cosw0,
			a2: 1 - alpha,
		};
	}

	return {
		b0: (1 + cosw0) / 2,
		b1: -(1 + cosw0),
		b2: (1 + cosw0) / 2,
		a0: 1 + alpha,
		a1: -2 * cosw0,
		a2: 1 - alpha,
	};
}

function applyBiquad(samples: number[], coeffs: BiquadCoeffs): number[] {
	const out = new Array(samples.length).fill(0);
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	const { b0, b1, b2, a0, a1, a2 } = coeffs;
	const normB0 = b0 / a0;
	const normB1 = b1 / a0;
	const normB2 = b2 / a0;
	const normA1 = a1 / a0;
	const normA2 = a2 / a0;

	for (let i = 0; i < samples.length; i++) {
		const x0 = samples[i];
		const y0 =
			normB0 * x0 + normB1 * x1 + normB2 * x2 - normA1 * y1 - normA2 * y2;
		out[i] = y0;
		x2 = x1;
		x1 = x0;
		y2 = y1;
		y1 = y0;
	}

	return out;
}

function filtfilt(samples: number[], filters: BiquadCoeffs[]): number[] {
	if (!samples.length) return [];
	let forward = samples.slice();
	for (const coeffs of filters) {
		forward = applyBiquad(forward, coeffs);
	}
	let backward = forward.slice().reverse();
	for (const coeffs of filters) {
		backward = applyBiquad(backward, coeffs);
	}
	return backward.reverse();
}

export function museStyleFilter(
	samples: number[],
	sampleRate: number,
): number[] {
	if (!samples.length || sampleRate <= 0) return samples.slice();
	const hp = designBiquad("highpass", sampleRate, 0.5);
	const lp = designBiquad("lowpass", sampleRate, 4.0);
	return filtfilt(samples, [hp, lp]);
}

export class MuseCalibrationModel {
	private weights = { spectral: 0.5, acf: 0.5, bias: 0 };
	private learningRate = 0.01;
	private trained = false;

	isTrained(): boolean {
		return this.trained;
	}

	predict(spectralBpm: number, acfBpm: number): number {
		if (!this.trained) return (spectralBpm + acfBpm) / 2;
		return (
			spectralBpm * this.weights.spectral +
			acfBpm * this.weights.acf +
			this.weights.bias
		);
	}

	train(spectralBpm: number, acfBpm: number, trueBpm: number) {
		const prediction = this.predict(spectralBpm, acfBpm);
		const error = trueBpm - prediction;

		this.weights.spectral += this.learningRate * error * spectralBpm * 0.001;
		this.weights.acf += this.learningRate * error * acfBpm * 0.001;
		this.weights.bias += this.learningRate * error;

		this.weights.spectral = clamp(this.weights.spectral, 0, 2);
		this.weights.acf = clamp(this.weights.acf, 0, 2);
		this.weights.bias = clamp(this.weights.bias, -50, 50);
		this.trained = true;
	}

	reset() {
		this.weights = { spectral: 0.5, acf: 0.5, bias: 0 };
		this.trained = false;
	}

	getSnapshot() {
		return {
			weights: { ...this.weights },
			trained: this.trained,
			learningRate: this.learningRate,
		};
	}

	loadSnapshot(snapshot: unknown) {
		if (!snapshot || typeof snapshot !== "object") return;
		const raw = snapshot as {
			weights?: { spectral?: number; acf?: number; bias?: number };
			trained?: boolean;
			learningRate?: number;
		};
		const w = raw.weights;
		if (!w) return;
		const spectral = Number(w.spectral);
		const acf = Number(w.acf);
		const bias = Number(w.bias);
		if (
			!Number.isFinite(spectral) ||
			!Number.isFinite(acf) ||
			!Number.isFinite(bias)
		)
			return;
		this.weights = {
			spectral: clamp(spectral, 0, 2),
			acf: clamp(acf, 0, 2),
			bias: clamp(bias, -50, 50),
		};
		if (
			typeof raw.learningRate === "number" &&
			Number.isFinite(raw.learningRate)
		) {
			this.learningRate = clamp(raw.learningRate, 0.0001, 0.2);
		}
		this.trained = !!raw.trained;
	}
}

export class MuseFusionCalibrator {
	private bias = 0;
	private lastMuseBpm: number | null = null;
	private lastMuseQuality = 0;
	private lastMuseTs = 0;
	private updateCount = 0;

	updateMuse(
		bpm: number | null,
		quality: number | null = 0,
		timestampMs = Date.now(),
	) {
		if (bpm == null || !Number.isFinite(bpm)) return;
		this.lastMuseBpm = bpm;
		this.lastMuseQuality = clamp(quality ?? 0, 0, 100);
		this.lastMuseTs = timestampMs;
	}

	updateCamera(
		cameraBpm: number | null,
		cameraQuality: number | null = 0,
		timestampMs = Date.now(),
	) {
		if (cameraBpm == null || !Number.isFinite(cameraBpm)) return;
		if (!this.isMuseFresh(timestampMs)) return;
		const camQual = clamp(cameraQuality ?? 0, 0, 100);
		if (camQual < 40 || this.lastMuseQuality < 60 || this.lastMuseBpm == null)
			return;

		const delta = cameraBpm - this.lastMuseBpm;
		this.updateCount += 1;
		const alpha = Math.max(0.1, 1.0 / (1 + this.updateCount * 0.5));
		this.bias = this.bias * (1 - alpha) + delta * alpha;
	}

	fuse(
		cameraBpm: number | null,
		cameraQuality: number | null = 0,
		timestampMs = Date.now(),
	): { bpm: number | null; source: FusionSource; bias: number } {
		const camQual = clamp(cameraQuality ?? 0, 0, 100);
		const museFresh = this.isMuseFresh(timestampMs);

		if (
			museFresh &&
			this.lastMuseBpm != null &&
			this.lastMuseQuality - camQual > 40
		) {
			return { bpm: this.lastMuseBpm, source: "muse", bias: this.bias };
		}

		if (
			museFresh &&
			this.lastMuseBpm != null &&
			cameraBpm != null &&
			camQual >= 20
		) {
			const museWeight = (this.lastMuseQuality / 100) * 1.2;
			const camWeight = camQual / 100;
			const adjustedCamera = cameraBpm - this.bias;
			const fused =
				(museWeight * this.lastMuseBpm + camWeight * adjustedCamera) /
				(museWeight + camWeight);
			return { bpm: fused, source: "blend", bias: this.bias };
		}

		if (museFresh && this.lastMuseBpm != null) {
			return { bpm: this.lastMuseBpm, source: "muse", bias: this.bias };
		}

		if (cameraBpm != null && Number.isFinite(cameraBpm)) {
			return { bpm: cameraBpm - this.bias, source: "camera", bias: this.bias };
		}

		return { bpm: null, source: "none", bias: this.bias };
	}

	private isMuseFresh(nowMs = Date.now()): boolean {
		if (this.lastMuseBpm == null) return false;
		return nowMs - this.lastMuseTs < 2500 && this.lastMuseQuality >= 50;
	}

	getReference(
		nowMs = Date.now(),
	): { bpm: number; strength: number } | null {
		if (!this.isMuseFresh(nowMs) || this.lastMuseBpm == null) return null;
		return {
			bpm: this.lastMuseBpm,
			strength: clamp(this.lastMuseQuality / 100, 0.35, 1),
		};
	}

	getSnapshot() {
		return {
			bias: this.bias,
			updateCount: this.updateCount,
		};
	}

	loadSnapshot(snapshot: unknown) {
		if (!snapshot || typeof snapshot !== "object") return;
		const raw = snapshot as { bias?: number; updateCount?: number };
		if (typeof raw.bias === "number" && Number.isFinite(raw.bias)) {
			this.bias = clamp(raw.bias, -30, 30);
		}
		if (
			typeof raw.updateCount === "number" &&
			Number.isFinite(raw.updateCount)
		) {
			this.updateCount = Math.max(0, Math.round(raw.updateCount));
		}
	}
}

export class RppgProcessor {
	private pipeline: any;
	private readonly samples: Sample[] = [];
	private readonly bpmHistory: number[] = [];
	private readonly cameraCalibration = new MuseCalibrationModel();
	private readonly fusion = new MuseFusionCalibrator();
	private readonly bayesTracker = new BpmBayesTracker(BPM_MIN, BPM_MAX);
	private readonly channelGain = new ChannelGainController();
	private readonly chromPulse = new ChromPulseModel();
	private baselineBpm: number | null = null;
	private baselineDeviationStartMs: number | null = null;
	private lastBayesUpdateMs: number | null = null;
	private totalSamplesReceived = 0;

	constructor(
		private backend: Backend,
		sampleRate = 30,
		windowSec = 5,
	) {
		this.pipeline = this.backend.newPipeline(sampleRate, windowSec);
	}

	enableTracker(minBpm = 50, maxBpm = 160, numParticles = 150) {
		if (typeof this.pipeline.enable_tracker === "function") {
			this.pipeline.enable_tracker(minBpm, maxBpm, numParticles);
		} else if (typeof this.pipeline.enableTracker === "function") {
			this.pipeline.enableTracker(minBpm, maxBpm, numParticles);
		}
	}

	pushSample(timestampMs: number, intensity: number) {
		if (typeof this.pipeline.push_sample === "function") {
			const ts = coerceTimestamp(this.pipeline, timestampMs);
			this.pipeline.push_sample(ts as any, intensity);
		} else if (typeof this.pipeline.pushSample === "function") {
			this.pipeline.pushSample(timestampMs, intensity);
		} else {
			throw new Error("backend pipeline has no push_sample API");
		}
		this.pushLocalSample(
			timestampMs,
			intensity,
			intensity,
			intensity,
			intensity,
			1,
			0,
			0,
		);
	}

	pushSampleRgb(
		timestampMs: number,
		r: number,
		g: number,
		b: number,
		skinRatio = 1.0,
	) {
		if (typeof this.pipeline.push_sample_rgb === "function") {
			const ts = coerceTimestamp(this.pipeline, timestampMs);
			this.pipeline.push_sample_rgb(ts as any, r, g, b, skinRatio);
		} else if (typeof this.pipeline.pushSampleRgb === "function") {
			this.pipeline.pushSampleRgb(timestampMs, r, g, b, skinRatio);
		} else {
			this.pushSample(timestampMs, g);
			return;
		}
		this.pushLocalSample(
			timestampMs,
			this.computeLocalRgbIntensity(r, g, b),
			r,
			g,
			b,
			skinRatio,
			0,
			0,
		);
	}

	pushSampleRgbMeta(
		timestampMs: number,
		r: number,
		g: number,
		b: number,
		skinRatio = 1.0,
		motion = 0.0,
		clipRatio = 0.0,
	) {
		if (typeof this.pipeline.push_sample_rgb_meta === "function") {
			const ts = coerceTimestamp(this.pipeline, timestampMs);
			this.pipeline.push_sample_rgb_meta(
				ts as any,
				r,
				g,
				b,
				skinRatio,
				motion,
				clipRatio,
			);
		} else if (typeof this.pipeline.pushSampleRgbMeta === "function") {
			this.pipeline.pushSampleRgbMeta(
				timestampMs,
				r,
				g,
				b,
				skinRatio,
				motion,
				clipRatio,
			);
		} else {
			this.pushSampleRgb(timestampMs, r, g, b, skinRatio);
			return;
		}
		this.pushLocalSample(
			timestampMs,
			this.computeLocalRgbIntensity(r, g, b),
			r,
			g,
			b,
			skinRatio,
			motion,
			clipRatio,
		);
	}

	updateMuseMetrics(bpm: number | null, quality = 0, timestampMs = Date.now()) {
		this.fusion.updateMuse(bpm, quality, timestampMs);
	}

	resetCalibration() {
		this.cameraCalibration.reset();
		this.bayesTracker.reset();
		this.channelGain.reset();
		this.chromPulse.reset();
		this.baselineBpm = null;
		this.baselineDeviationStartMs = null;
		this.lastBayesUpdateMs = null;
	}

	getStateSnapshot() {
		return {
			baselineBpm: this.baselineBpm,
			baselineDeviationStartMs: this.baselineDeviationStartMs,
			bpmHistory: this.bpmHistory.slice(-60),
			cameraCalibration: this.cameraCalibration.getSnapshot(),
			bayesTracker: this.bayesTracker.getSnapshot(),
			fusion: this.fusion.getSnapshot(),
		};
	}

	loadStateSnapshot(snapshot: unknown) {
		if (!snapshot || typeof snapshot !== "object") return;
		const raw = snapshot as {
			baselineBpm?: number | null;
			baselineDeviationStartMs?: number | null;
			bpmHistory?: number[];
			cameraCalibration?: unknown;
			bayesTracker?: unknown;
			fusion?: unknown;
		};
		if (raw.baselineBpm == null) {
			this.baselineBpm = null;
		} else if (Number.isFinite(raw.baselineBpm)) {
			this.baselineBpm = clamp(raw.baselineBpm, BPM_MIN, 140);
		}
		if (raw.baselineDeviationStartMs == null) {
			this.baselineDeviationStartMs = null;
		} else if (Number.isFinite(raw.baselineDeviationStartMs)) {
			this.baselineDeviationStartMs = raw.baselineDeviationStartMs;
		}
		if (Array.isArray(raw.bpmHistory)) {
			const nextHistory = raw.bpmHistory
				.filter((v) => Number.isFinite(v))
				.slice(-60);
			this.bpmHistory.length = 0;
			this.bpmHistory.push(...nextHistory);
		}
		this.cameraCalibration.loadSnapshot(raw.cameraCalibration);
		this.bayesTracker.loadSnapshot(raw.bayesTracker);
		this.fusion.loadSnapshot(raw.fusion);
	}

	getMetrics(): Metrics {
		const backendMetrics = this.readBackendMetrics();
		const advanced = this.computeAdvancedMetrics(backendMetrics);
		return { ...backendMetrics, ...advanced };
	}

	getDebugSnapshot(nowMs = Date.now()): RppgDebugSnapshot {
		const backendMetrics = this.getMetrics();
		const lastSample =
			this.samples.length > 0 ? this.samples[this.samples.length - 1] : null;
		const firstSample = this.samples.length > 0 ? this.samples[0] : null;
		const windowDurationMs =
			firstSample && lastSample
				? Math.max(0, lastSample.timestampMs - firstSample.timestampMs)
				: 0;
		const issues = deriveDebugIssues(
			this.totalSamplesReceived,
			this.samples.length,
			windowDurationMs,
			lastSample,
			backendMetrics,
		);
		return {
			totalSamplesReceived: this.totalSamplesReceived,
			windowSampleCount: this.samples.length,
			windowDurationMs,
			lastSampleTimestampMs: lastSample?.timestampMs ?? null,
			lastSampleAgeMs:
				lastSample != null ? Math.max(0, nowMs - lastSample.timestampMs) : null,
			lastSample: lastSample
				? {
						intensity: lastSample.intensity,
						r: lastSample.r,
						g: lastSample.g,
						b: lastSample.b,
						skinRatio: lastSample.skinRatio,
						motion: lastSample.motion,
						clipRatio: lastSample.clipRatio,
					}
				: null,
			backendMetrics,
			issues,
		};
	}

	private readBackendMetrics(): Metrics {
		if (typeof this.pipeline.get_metrics === "function") {
			return normalizeMetrics(this.pipeline.get_metrics());
		}
		if (typeof this.pipeline.getMetrics === "function") {
			return normalizeMetrics(this.pipeline.getMetrics());
		}
		return { bpm: null, confidence: 0.0, signal_quality: 0.0 };
	}

	private pushLocalSample(
		timestampMs: number,
		intensity: number,
		r: number,
		g: number,
		b: number,
		skinRatio: number,
		motion: number,
		clipRatio: number,
	) {
		if (!Number.isFinite(timestampMs) || !Number.isFinite(intensity)) return;
		this.totalSamplesReceived += 1;
		this.samples.push({
			timestampMs,
			intensity,
			r: Number.isFinite(r) ? r : intensity,
			g: Number.isFinite(g) ? g : intensity,
			b: Number.isFinite(b) ? b : intensity,
			skinRatio: Number.isFinite(skinRatio) ? skinRatio : 1,
			motion: Number.isFinite(motion) ? motion : 0,
			clipRatio: Number.isFinite(clipRatio) ? clipRatio : 0,
		});
		const maxHistoryMs = 45000;
		while (
			this.samples.length > 2 &&
			this.samples[this.samples.length - 1].timestampMs -
				this.samples[0].timestampMs >
				maxHistoryMs
		) {
			this.samples.shift();
		}
	}

	private computeLocalRgbIntensity(r: number, g: number, b: number): number {
		if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
			return Number.isFinite(g) ? g : 0;
		}
		const balanced = this.channelGain.process(r, g, b);
		const chrom = this.chromPulse.process(balanced.r, balanced.g, balanced.b);
		if (!Number.isFinite(chrom) || Math.abs(chrom) < 1e-6) {
			return g;
		}
		return chrom;
	}

	private computeAdvancedMetrics(base: Metrics): Partial<Metrics> {
		if (this.samples.length < 24) {
			return {
				calibrated_bpm: base.bpm ?? null,
				fused_bpm: base.bpm ?? null,
				fused_source: base.bpm == null ? "none" : "camera",
				bayes_bpm: null,
				bayes_confidence: 0,
				calibration_trained: this.cameraCalibration.isTrained(),
				baseline_bpm: this.baselineBpm,
			};
		}

		const analysis = analyzeWindow(this.samples);
		if (!analysis) {
			return {
				calibrated_bpm: base.bpm ?? null,
				fused_bpm: base.bpm ?? null,
				fused_source: base.bpm == null ? "none" : "camera",
				bayes_bpm: null,
				bayes_confidence: 0,
				calibration_trained: this.cameraCalibration.isTrained(),
				baseline_bpm: this.baselineBpm,
			};
		}

		const spectral = analysis.spectral;
		const acf = analysis.acf;
		const peaks = analysis.peaks;

		const candidates: BpmEvidence[] = [];
		if (base.bpm != null && Number.isFinite(base.bpm) && base.confidence > 0) {
			candidates.push({
				source: "backend",
				bpm: base.bpm,
				confidence: clamp(base.confidence, 0, 1),
			});
		}
		if (spectral)
			candidates.push({
				source: "spectral",
				bpm: spectral.bpm,
				confidence: spectral.confidence,
			});
		if (acf) candidates.push(acf);
		if (peaks)
			candidates.push({
				source: "peaks",
				bpm: peaks.bpm,
				confidence: peaks.confidence,
			});

		let calibratedBpm: number | null = null;
		if (spectral && acf) {
			calibratedBpm = this.cameraCalibration.predict(spectral.bpm, acf.bpm);
			if (this.cameraCalibration.isTrained()) {
				candidates.push({
					source: "calibrated",
					bpm: calibratedBpm,
					confidence: clamp(
						(spectral.confidence + acf.confidence) * 0.45,
						0.2,
						0.95,
					),
				});
			}
		}

		const resolved = resolveBpmCandidates(
			candidates,
			this.bpmHistory.slice(-12),
		);
		const trackerMeasurements = buildTrackerMeasurements(spectral, acf, peaks);
		const trackerDtSec =
			this.lastBayesUpdateMs == null
				? 1 / 30
				: clamp((analysis.nowMs - this.lastBayesUpdateMs) / 1000, 1 / 30, 2);
		this.lastBayesUpdateMs = analysis.nowMs;
		const reference = this.fusion.getReference(analysis.nowMs);
		const bayes = this.bayesTracker.update(trackerMeasurements, trackerDtSec, {
			motion: base.motion_mean ?? analysis.motionMean,
			snrDb: base.snr ?? 0,
			quality: analysis.quality,
			referenceBpm: reference?.bpm,
			referenceStrength: reference?.strength,
			waveformProfile: analysis.waveformProfile,
		});
		if (reference && trackerMeasurements.length > 0) {
			this.bayesTracker.reinforceReference(
				reference.bpm,
				trackerMeasurements,
				reference.strength,
				analysis.nowMs,
				analysis.waveformProfile,
			);
		}
		const resolvedChoice = chooseResolvedBpm(resolved, bayes);
		const resolvedBpm = resolvedChoice.bpm;
		const resolvedConfidence = resolvedChoice.confidence;
		const winningSources =
			resolvedChoice.origin === "bayes"
				? (trackerMeasurements
						.filter(
							(measurement) =>
								measurement.bpm != null &&
								resolvedBpm != null &&
								Math.abs(measurement.bpm - resolvedBpm) <= BPM_TOLERANCE,
						)
						.map((measurement) => measurement.source) as BpmEvidenceSource[])
				: resolved.winningSources;

		if (spectral && acf && resolvedBpm != null && resolvedConfidence >= 0.55) {
			this.cameraCalibration.train(spectral.bpm, acf.bpm, resolvedBpm);
			calibratedBpm = this.cameraCalibration.predict(spectral.bpm, acf.bpm);
		}

		const estimatorSpread = computeEstimatorSpread(
			peaks?.bpm ?? null,
			acf?.bpm ?? null,
			spectral?.bpm ?? null,
		);
		const aliasFlag =
			resolved.aliasFlag ||
			(resolved.bpm != null &&
				bayes.bpm != null &&
				isAliasRelation(bayes.bpm, resolved.bpm) &&
				bayes.confidence > resolved.confidence);
		const agreement = computeAgreementScore({
			candidates,
			resolved,
			resolvedChoice,
			bayes,
			analysis,
			winningSources,
			estimatorSpread,
			aliasFlag,
		});
		const lowConfidenceGate =
			(resolvedConfidence < 0.32 && bayes.confidence < 0.45) ||
			analysis.snrDb < -4.5 ||
			analysis.motionMean > 0.22 ||
			(resolved.aliasFlag && estimatorSpread > 28);
		const cameraCandidate = lowConfidenceGate
			? null
			: calibratedBpm ?? resolvedBpm ?? base.bpm ?? null;
		const cameraQuality = clamp(
			((base.signal_quality || 0) + (analysis.quality || 0)) * 50,
			0,
			100,
		) * (lowConfidenceGate ? 0.45 : 1);
		this.fusion.updateCamera(cameraCandidate, cameraQuality, analysis.nowMs);
		const fused = this.fusion.fuse(
			cameraCandidate,
			cameraQuality,
			analysis.nowMs,
		);

		if (fused.bpm != null && Number.isFinite(fused.bpm)) {
			this.bpmHistory.push(fused.bpm);
			if (this.bpmHistory.length > 60) this.bpmHistory.shift();
		}

		this.updateBaseline(
			fused.bpm,
			resolvedConfidence,
			base.signal_quality,
			analysis.nowMs,
		);

		return {
			bpm: fused.bpm ?? cameraCandidate ?? base.bpm ?? null,
			confidence: lowConfidenceGate
				? Math.min(Math.max(base.confidence || 0, resolvedConfidence || 0), 0.3)
				: Math.max(base.confidence || 0, resolvedConfidence || 0),
			agreement,
			spectral_bpm: spectral?.bpm ?? null,
			acf_bpm: acf?.bpm ?? null,
			peaks_bpm: peaks?.bpm ?? null,
			resolved_bpm: resolvedBpm,
			resolved_confidence: resolvedConfidence,
			winning_sources: winningSources,
			alias_flag: aliasFlag,
			bayes_bpm: bayes.bpm,
			bayes_confidence: bayes.confidence,
			calibrated_bpm: calibratedBpm,
			fused_bpm: lowConfidenceGate ? null : fused.bpm,
			fused_source: lowConfidenceGate ? "none" : fused.source,
			calibration_trained: this.cameraCalibration.isTrained(),
			baseline_bpm: this.baselineBpm,
			baseline_delta:
				this.baselineBpm != null && fused.bpm != null
					? fused.bpm - this.baselineBpm
					: null,
			hrv_rmssd: analysis.hrvRmssd,
			respiration_rate: analysis.respiration,
		};
	}

	private updateBaseline(
		bpm: number | null,
		confidence: number,
		signalQuality: number,
		nowMs: number,
	) {
		if (bpm == null || !Number.isFinite(bpm)) return;
		const reliable = confidence >= 0.5 && signalQuality >= 0.35;
		if (!reliable) return;

		if (this.baselineBpm == null) {
			this.baselineBpm = bpm;
			this.baselineDeviationStartMs = null;
			return;
		}

		const delta = bpm - this.baselineBpm;
		const absDelta = Math.abs(delta);
		if (absDelta > 18) {
			if (this.baselineDeviationStartMs == null) {
				this.baselineDeviationStartMs = nowMs;
			}
			const sustained = nowMs - this.baselineDeviationStartMs > 15000;
			const alpha = sustained ? 0.12 : 0.02;
			this.baselineBpm = this.baselineBpm * (1 - alpha) + bpm * alpha;
			return;
		}

		this.baselineDeviationStartMs = null;
		this.baselineBpm = this.baselineBpm * 0.985 + bpm * 0.015;
	}
}

function deriveDebugIssues(
	totalSamplesReceived: number,
	windowSampleCount: number,
	windowDurationMs: number,
	lastSample: Sample | null,
	metrics: Metrics,
): RppgDebugIssueCode[] {
	const issues: RppgDebugIssueCode[] = [];
	if (totalSamplesReceived === 0) {
		issues.push("no_samples_yet");
		return issues;
	}
	if (windowSampleCount < 24 || windowDurationMs < 3000) {
		issues.push("insufficient_window");
	}
	if (metrics.bpm == null) {
		issues.push("no_bpm_yet");
	}
	if ((metrics.signal_quality ?? 0) < 0.35) {
		issues.push("low_signal_quality");
	}
	if ((metrics.confidence ?? 0) < 0.35) {
		issues.push("low_confidence");
	}
	if ((metrics.skin_ratio_mean ?? lastSample?.skinRatio ?? 1) < 0.25) {
		issues.push("low_skin_ratio");
	}
	if ((metrics.motion_mean ?? lastSample?.motion ?? 0) > 0.35) {
		issues.push("excessive_motion");
	}
	if ((metrics.clip_mean ?? lastSample?.clipRatio ?? 0) > 0.2) {
		issues.push("high_clipping");
	}
	return Array.from(new Set(issues));
}

function normalizeMetrics(raw: any): Metrics {
	if (!raw) return { bpm: null, confidence: 0.0, signal_quality: 0.0 };
	if (typeof raw === "string") {
		try {
			return normalizeMetrics(JSON.parse(raw));
		} catch {
			return { bpm: null, confidence: 0.0, signal_quality: 0.0 };
		}
	}
	const bpm = raw.bpm ?? raw.bpm_hz ?? raw.heart_bpm ?? null;
	const confidence = raw.confidence ?? raw.conf ?? 0.0;
	const signal_quality = raw.signal_quality ?? raw.signalQuality ?? 0.0;
	const agreement = raw.agreement ?? raw.agreementQuality ?? undefined;
	const reason_codes = raw.reason_codes ?? raw.reasonCodes ?? undefined;
	const snr = raw.snr ?? undefined;
	const skin_ratio_mean = raw.skin_ratio_mean ?? raw.skinRatioMean ?? undefined;
	const motion_mean = raw.motion_mean ?? raw.motionMean ?? undefined;
	const clip_mean = raw.clip_mean ?? raw.clipMean ?? undefined;
	return {
		bpm,
		confidence,
		signal_quality,
		agreement,
		reason_codes,
		snr,
		skin_ratio_mean,
		motion_mean,
		clip_mean,
	};
}

function coerceTimestamp(pipeline: any, timestampMs: number): number | bigint {
	if (
		typeof BigInt === "function" &&
		pipeline &&
		typeof pipeline.__wbg_ptr === "number"
	) {
		return BigInt(Math.round(timestampMs));
	}
	return timestampMs;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function isWithin(a: number, b: number, tolerance = BPM_TOLERANCE): boolean {
	return Math.abs(a - b) <= tolerance;
}

function isAliasRelation(candidate: number, reference: number): boolean {
	if (reference <= 0) return false;
	return (
		isWithin(candidate, reference * 0.5) || isWithin(candidate, reference * 2)
	);
}

function median(values: number[]): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

function resolveBpmCandidates(
	candidates: BpmEvidence[],
	history: number[] = [],
): BpmResolutionResult {
	const sanitized = candidates
		.filter((c) => Number.isFinite(c.bpm) && Number.isFinite(c.confidence))
		.filter((c) => c.bpm >= BPM_MIN && c.bpm <= BPM_MAX && c.confidence > 0)
		.map((c) => ({ ...c }));

	const historyValues = history.filter((v) => Number.isFinite(v));
	const historyMedian = median(historyValues);

	if (!sanitized.length) {
		return {
			bpm: null,
			confidence: 0,
			winningSources: [],
			aliasFlag: false,
			debug: { candidates: [], historyMedian, winner: null },
		};
	}

	const enriched: BpmResolutionDebugEntry[] = sanitized.map((candidate) => {
		let sameSupport = 0;
		let aliasSupport = 0;

		sanitized.forEach((other) => {
			if (other === candidate) return;
			if (isWithin(other.bpm, candidate.bpm)) {
				sameSupport += other.confidence;
			} else if (isAliasRelation(other.bpm, candidate.bpm)) {
				aliasSupport += other.confidence;
			}
		});

		let score = candidate.confidence + sameSupport + aliasSupport * 0.6;
		let ratioToHistory: number | null = null;

		if (historyMedian) {
			ratioToHistory = candidate.bpm / historyMedian;
			if (isWithin(candidate.bpm, historyMedian)) {
				score += 0.2;
			} else if (isAliasRelation(candidate.bpm, historyMedian)) {
				score -= 0.2;
			}
		}

		return {
			...candidate,
			score,
			sameSupport,
			aliasSupport,
			ratioToHistory,
		};
	});

	enriched.sort((a, b) => b.score - a.score);

	let winner = enriched[0] ?? null;
	let aliasFlag = false;

	if (historyMedian && winner && isAliasRelation(winner.bpm, historyMedian)) {
		const historyAligned = enriched.find((c) => isWithin(c.bpm, historyMedian));
		if (
			historyAligned &&
			historyAligned !== winner &&
			historyAligned.score >= winner.score * 0.75
		) {
			aliasFlag = true;
			winner = historyAligned;
		}
	}

	if (
		winner &&
		(winner.aliasSupport > winner.sameSupport ||
			(winner.harmonicRelation && winner.harmonicRelation !== "fundamental"))
	) {
		aliasFlag = true;
	}

	const winningSources = winner
		? sanitized.filter((c) => isWithin(c.bpm, winner.bpm)).map((c) => c.source)
		: [];
	const confidence = winner ? clamp(winner.score / 2.5, 0, 1) : 0;

	return {
		bpm: winner ? winner.bpm : null,
		confidence,
		winningSources,
		aliasFlag,
		debug: {
			candidates: enriched,
			historyMedian,
			winner,
		},
	};
}

function buildTrackerMeasurements(
	spectral: { bpm: number; confidence: number } | null,
	acf: BpmEvidence | null,
	peaks: { bpm: number; confidence: number } | null,
): EstimatorMeasurement[] {
	const measurements: EstimatorMeasurement[] = [];

	if (spectral) {
		measurements.push({
			source: "spectral",
			bpm: spectral.bpm,
			confidence: spectral.confidence,
		});
	}
	if (acf) {
		measurements.push({
			source: "acf",
			bpm: acf.bpm,
			confidence: acf.confidence,
		});
	}
	if (peaks) {
		measurements.push({
			source: "peaks",
			bpm: peaks.bpm,
			confidence: peaks.confidence,
		});
	}

	return measurements;
}

function chooseResolvedBpm(
	resolved: BpmResolutionResult,
	bayes: TrackerEstimate,
): { bpm: number | null; confidence: number; origin: "resolver" | "bayes" } {
	if (bayes.bpm == null) {
		return {
			bpm: resolved.bpm,
			confidence: resolved.confidence,
			origin: "resolver",
		};
	}

	if (resolved.bpm == null) {
		return {
			bpm: bayes.bpm,
			confidence: bayes.confidence,
			origin: "bayes",
		};
	}

	if (isWithin(bayes.bpm, resolved.bpm, 4)) {
		return {
			bpm: (bayes.bpm + resolved.bpm) / 2,
			confidence: Math.max(resolved.confidence, bayes.confidence),
			origin: bayes.confidence >= resolved.confidence ? "bayes" : "resolver",
		};
	}

	if (
		bayes.confidence >= 0.45 &&
		(bayes.confidence >= resolved.confidence + 0.05 ||
			(resolved.confidence < 0.45 && isAliasRelation(bayes.bpm, resolved.bpm)))
	) {
		return {
			bpm: bayes.bpm,
			confidence: bayes.confidence,
			origin: "bayes",
		};
	}

	return {
		bpm: resolved.bpm,
		confidence: resolved.confidence,
		origin: "resolver",
	};
}

function computeEstimatorSpread(
	peaksBpm: number | null,
	acfBpm: number | null,
	spectralBpm: number | null,
): number {
	const values = [peaksBpm, acfBpm, spectralBpm].filter(
		(value): value is number => value != null && Number.isFinite(value),
	);
	if (values.length < 2) return 0;
	return Math.max(...values) - Math.min(...values);
}

function computeAgreementScore(input: {
	candidates: BpmEvidence[];
	resolved: BpmResolutionResult;
	resolvedChoice: {
		bpm: number | null;
		confidence: number;
		origin: "resolver" | "bayes";
	};
	bayes: TrackerEstimate;
	analysis: {
		waveformProfile: WaveformPeriodicityProfile | null;
	};
	winningSources: BpmEvidenceSource[];
	estimatorSpread: number;
	aliasFlag: boolean;
}): number {
	const { candidates, resolved, resolvedChoice, bayes, analysis, winningSources, estimatorSpread, aliasFlag } =
		input;
	const targetBpm = resolvedChoice.bpm;

	if (targetBpm == null || !Number.isFinite(targetBpm)) return 0;

	const directCandidates = candidates.filter(
		(candidate) => candidate.source !== "calibrated" && candidate.source !== "backend",
	);
	const supportCandidates = directCandidates.length ? directCandidates : candidates;
	let weightedSupport = 0;
	let totalWeight = 0;
	for (const candidate of supportCandidates) {
		if (!Number.isFinite(candidate.bpm) || !Number.isFinite(candidate.confidence)) {
			continue;
		}
		const weight = clamp(candidate.confidence, 0, 1);
		weightedSupport += Math.exp(-Math.abs(candidate.bpm - targetBpm) / 10) * weight;
		totalWeight += weight;
	}
	const candidateAgreement =
		totalWeight > 0 ? clamp(weightedSupport / totalWeight, 0, 1) : 0;
	const sourceCoverage =
		supportCandidates.length > 0
			? clamp(winningSources.length / supportCandidates.length, 0, 1)
			: 0;
	const trackerAgreement =
		bayes.bpm != null && Number.isFinite(bayes.bpm)
			? clamp(Math.exp(-Math.abs(bayes.bpm - targetBpm) / 8), 0, 1) *
				clamp(0.4 + bayes.confidence * 0.6, 0.4, 1)
			: 0.35;
	const waveformAgreement = scoreWaveformAgreement(
		analysis.waveformProfile,
		targetBpm,
	);
	const spreadAgreement =
		supportCandidates.length >= 2
			? clamp(1 - estimatorSpread / 24, 0, 1)
			: 0.55;
	const aliasPenalty = aliasFlag ? 0.18 : 0;
	const disagreementPenalty =
		resolved.debug.winner &&
		resolved.debug.winner.aliasSupport > resolved.debug.winner.sameSupport
			? 0.1
			: 0;

	return clamp(
		candidateAgreement * 0.38 +
			sourceCoverage * 0.2 +
			trackerAgreement * 0.22 +
			waveformAgreement * 0.12 +
			spreadAgreement * 0.08 -
			aliasPenalty -
			disagreementPenalty,
		0,
		1,
	);
}

function scoreWaveformAgreement(
	waveformProfile: WaveformPeriodicityProfile | null,
	targetBpm: number,
): number {
	if (
		!waveformProfile ||
		!Array.isArray(waveformProfile.topCandidates) ||
		!waveformProfile.topCandidates.length
	) {
		return 0.35;
	}

	let bestSupport = 0;
	for (const candidate of waveformProfile.topCandidates.slice(0, 3)) {
		const direct = Math.exp(-Math.abs(candidate.bpm - targetBpm) / 10);
		const half = Math.exp(-Math.abs(candidate.bpm - targetBpm * 0.5) / 8) * 0.92;
		const double = Math.exp(-Math.abs(candidate.bpm - targetBpm * 2) / 12) * 0.75;
		bestSupport = Math.max(bestSupport, Math.max(direct, half, double));
	}

	return clamp(
		bestSupport * clamp(0.35 + waveformProfile.confidence * 0.65, 0.35, 1),
		0,
		1,
	);
}

function analyzeWindow(samples: Sample[]): {
	spectral: { bpm: number; confidence: number } | null;
	acf: BpmEvidence | null;
	peaks: { bpm: number; confidence: number } | null;
	waveformProfile: WaveformPeriodicityProfile | null;
	respiration: number | null;
	hrvRmssd: number | null;
	quality: number;
	snrDb: number;
	nowMs: number;
	motionMean: number;
} | null {
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
		samples.map((s, idx) => ({ value: norm[idx], time: s.timestampMs })),
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
		samples.reduce((acc, s) => acc + clamp(s.skinRatio, 0, 1), 0) / n;
	const motionMean =
		samples.reduce((acc, s) => acc + clamp(s.motion, 0, 1), 0) / n;
	const clipMean =
		samples.reduce((acc, s) => acc + clamp(s.clipRatio, 0, 1), 0) / n;
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

function temporalNormalize(data: number[]): number[] {
	if (!data.length) return [];
	const mean = data.reduce((a, b) => a + b, 0) / data.length;
	let variance = 0;
	for (let i = 0; i < data.length; i++) {
		const d = data[i] - mean;
		variance += d * d;
	}
	variance /= data.length;
	const std = Math.sqrt(variance);
	if (!Number.isFinite(std) || std < 1e-8)
		return new Array(data.length).fill(0);
	return data.map((v) => (v - mean) / std);
}

function estimateDominantBpm(
	data: number[],
	sampleRate: number,
	minHz: number,
	maxHz: number,
): { bpm: number; confidence: number } | null {
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

	const energy = centered.reduce((acc, v) => acc + v * v, 0) / n;
	const confidence =
		energy > 1e-9 ? clamp(bestMag / (Math.sqrt(energy) + 1e-9), 0, 1) : 0;
	return { bpm: bestBpm, confidence };
}

function calculateBpmViaAutocorrelation(
	data: number[],
	fps: number,
	bpmHint: number | null,
): BpmEvidence | null {
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

	const build = (
		lag: number,
	): { lag: number; bpm: number; confidence: number } | null => {
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
		source: "acf",
		bpm: winning.bpm,
		confidence: clamp(winning.confidence, 0, 1),
		harmonicRelation: relation,
	};
}

function detectPeaks(
	data: Array<{ value: number; time: number }>,
	bpmHint: number | null,
): Array<{ value: number; time: number }> {
	if (data.length < 5) return [];
	const values = data.map((d) => d.value);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min;
	if (range < 1e-4) return [];

	const threshold = min + range * 0.35;
	let minPeakDistance = 270;
	if (bpmHint) {
		minPeakDistance = Math.min(400, Math.max(200, (60000 / bpmHint) * 0.6));
	}

	const peaks: Array<{ value: number; time: number }> = [];
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

function bpmFromPeaks(
	peaks: Array<{ value: number; time: number }>,
): { bpm: number; confidence: number } | null {
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

function rmssdFromPeaks(
	peaks: Array<{ value: number; time: number }>,
): number | null {
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

function std(values: number[]): number {
	if (values.length < 2) return 0;
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	let acc = 0;
	for (let i = 0; i < values.length; i++) {
		const d = values[i] - mean;
		acc += d * d;
	}
	return Math.sqrt(acc / values.length);
}
