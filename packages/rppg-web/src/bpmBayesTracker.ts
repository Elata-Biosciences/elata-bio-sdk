import type { WaveformPeriodicityProfile } from "./rppgDiagnostics";

export type TrackerSource = "peaks" | "acf" | "spectral";
export type HarmonicMode = "half" | "fundamental" | "double";
export type TrackerReferenceOrigin = "none" | "session_pair" | "snapshot_restore";

export interface EstimatorMeasurement {
	source: TrackerSource;
	bpm: number | null;
	confidence: number;
}

export interface TrackerContext {
	motion: number;
	snrDb: number;
	quality: number;
	referenceBpm?: number;
	referenceStrength?: number;
	referenceAgeSec?: number;
	waveformProfile?: WaveformPeriodicityProfile | null;
}

export interface TrackerEstimate {
	bpm: number | null;
	confidence: number;
	modeProbabilities: Record<HarmonicMode, number>;
	entropy: number;
}

export interface BpmBayesSnapshot {
	minBpm: number;
	maxBpm: number;
	stepBpm: number;
	posterior: number[];
	sourceReliability: Record<TrackerSource, number>;
	sourceHarmonicConfusion: Record<TrackerSource, number>;
	referencePriorBpm?: number | null;
	referencePriorWeight?: number;
	harmonicPrior?: Record<HarmonicMode, number>;
	referencePriorOrigin?: TrackerReferenceOrigin;
	referencePriorLastUpdatedTs?: number | null;
	waveformReliability?: number;
}

export interface TrackerReferenceState {
	bpm: number | null;
	weight: number;
	harmonicPrior: Record<HarmonicMode, number>;
	origin: TrackerReferenceOrigin;
	lastUpdatedTs: number | null;
	waveformReliability: number;
}

const MODES: HarmonicMode[] = ["half", "fundamental", "double"];

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function modeFactor(mode: HarmonicMode): number {
	if (mode === "half") return 0.5;
	if (mode === "double") return 2;
	return 1;
}

function gaussian(x: number, mu: number, sigma: number): number {
	if (
		!Number.isFinite(x) ||
		!Number.isFinite(mu) ||
		!Number.isFinite(sigma) ||
		sigma <= 0
	) {
		return 1e-9;
	}
	const z = (x - mu) / sigma;
	return Math.exp(-0.5 * z * z) + 1e-9;
}

export class BpmBayesTracker {
	private readonly minBpm: number;
	private readonly maxBpm: number;
	private readonly stepBpm: number;
	private readonly bpmGrid: number[];
	private posterior: Float64Array;
	private sourceReliability: Record<TrackerSource, number> = {
		peaks: 0.75,
		acf: 0.85,
		spectral: 0.95,
	};
	private sourceHarmonicConfusion: Record<TrackerSource, number> = {
		peaks: 0.35,
		acf: 0.2,
		spectral: 0.25,
	};
	private referencePriorBpm: number | null = null;
	private referencePriorWeight = 0;
	private harmonicPrior: Record<HarmonicMode, number> = {
		half: 1,
		fundamental: 1,
		double: 1,
	};
	private referencePriorOrigin: TrackerReferenceOrigin = "none";
	private referencePriorLastUpdatedTs: number | null = null;
	private waveformReliability = 0.22;

	constructor(minBpm = 40, maxBpm = 180, stepBpm = 1) {
		this.minBpm = minBpm;
		this.maxBpm = maxBpm;
		this.stepBpm = stepBpm;
		this.bpmGrid = [];
		for (let bpm = minBpm; bpm <= maxBpm; bpm += stepBpm) {
			this.bpmGrid.push(bpm);
		}
		this.posterior = new Float64Array(this.bpmGrid.length * MODES.length);
		this.reset();
	}

	reset() {
		const uniform = 1 / this.posterior.length;
		for (let i = 0; i < this.posterior.length; i++) {
			this.posterior[i] = uniform;
		}
		this.referencePriorBpm = null;
		this.referencePriorWeight = 0;
		this.harmonicPrior = {
			half: 1,
			fundamental: 1,
			double: 1,
		};
		this.referencePriorOrigin = "none";
		this.referencePriorLastUpdatedTs = null;
		this.waveformReliability = 0.22;
	}

	update(
		measurements: EstimatorMeasurement[],
		dtSec: number,
		context: TrackerContext,
	): TrackerEstimate {
		this.applyTemporalPrior(dtSec, context);
		this.applyPersistentReferencePrior(dtSec);

		const motion = clamp(context.motion, 0, 1);
		const quality = clamp(context.quality, 0, 1);
		const snrPenalty = context.snrDb < 0 ? clamp(-context.snrDb / 10, 0, 2) : 0;

		for (const measurement of measurements) {
			if (
				measurement.bpm == null ||
				!Number.isFinite(measurement.bpm) ||
				measurement.confidence <= 0
			) {
				continue;
			}

			const confidence = clamp(measurement.confidence, 0, 1);
			const reliability = clamp(
				this.sourceReliability[measurement.source] *
					confidence *
					(0.5 + quality * 0.5),
				0.1,
				1.5,
			);
			const harmonicConfusion = clamp(
				this.sourceHarmonicConfusion[measurement.source] +
					motion * 0.15 +
					snrPenalty * 0.05,
				0.05,
				0.85,
			);
			const sigma = clamp(
				2.5 + (1 - confidence) * 11 + motion * 8 + snrPenalty * 2,
				2,
				24,
			);

			for (let bpmIndex = 0; bpmIndex < this.bpmGrid.length; bpmIndex++) {
				const fundamental = this.bpmGrid[bpmIndex];
				const stateFund = gaussian(measurement.bpm, fundamental, sigma);
				const stateHalf = gaussian(measurement.bpm, fundamental * 0.5, sigma);
				const stateDouble = gaussian(measurement.bpm, fundamental * 2, sigma);

				for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
					const obs = fundamental * modeFactor(MODES[modeIndex]);
					const modeObs = gaussian(measurement.bpm, obs, sigma);
					const blended =
						(1 - harmonicConfusion) * modeObs +
						harmonicConfusion *
							(0.6 * stateFund + 0.2 * stateHalf + 0.2 * stateDouble);
					const posteriorIndex = this.toIndex(bpmIndex, modeIndex);
					this.posterior[posteriorIndex] *= blended ** reliability;
				}
			}
		}

		this.applyWaveformEvidence(
			context.waveformProfile ?? null,
			motion,
			quality,
			snrPenalty,
			measurements,
			context.referenceBpm,
		);

		if (
			context.referenceBpm != null &&
			Number.isFinite(context.referenceBpm)
		) {
			this.observeReference(
				context.referenceBpm,
				context.referenceStrength ?? 1,
			);
		}

		this.normalize();
		return this.estimate();
	}

	observeReference(
		referenceBpm: number,
		strength = 1,
		_measurements: EstimatorMeasurement[] = [],
	) {
		if (!Number.isFinite(referenceBpm)) return;
		const s = clamp(strength, 0, 1);
		const sigma = clamp(1.5 + (1 - s) * 4, 1.5, 6);
		const gain = clamp(1.2 + s * 2.2, 1, 4);

		for (let bpmIndex = 0; bpmIndex < this.bpmGrid.length; bpmIndex++) {
			const referenceLikelihood = gaussian(
				referenceBpm,
				this.bpmGrid[bpmIndex],
				sigma,
			);
			for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
				const posteriorIndex = this.toIndex(bpmIndex, modeIndex);
				this.posterior[posteriorIndex] *= referenceLikelihood ** gain;
			}
		}
		this.normalize();
	}

	reinforceReference(
		referenceBpm: number,
		measurements: EstimatorMeasurement[],
		strength = 1,
		updatedAtTs = Date.now(),
		waveformProfile: WaveformPeriodicityProfile | null = null,
	) {
		if (!Number.isFinite(referenceBpm)) return;
		const s = clamp(strength, 0, 1);
		this.updateReliability(referenceBpm, measurements);

		const modeWeights = this.inferReferenceModeWeights(referenceBpm, measurements);
		for (const mode of MODES) {
			this.harmonicPrior[mode] = clamp(
				this.harmonicPrior[mode] * (1 - s * 0.45) +
					modeWeights[mode] * (s * 0.45),
				0.65,
				1.9,
			);
		}

		if (this.referencePriorBpm == null || !Number.isFinite(this.referencePriorBpm)) {
			this.referencePriorBpm = referenceBpm;
		} else {
			const blend = clamp(0.2 + s * 0.35, 0.2, 0.55);
			this.referencePriorBpm =
				this.referencePriorBpm * (1 - blend) + referenceBpm * blend;
		}
		this.referencePriorWeight = clamp(
			Math.max(this.referencePriorWeight * 0.9, 0.18) + s * 0.45,
			0,
			1,
		);
		this.referencePriorOrigin = "session_pair";
		this.referencePriorLastUpdatedTs = Number.isFinite(updatedAtTs)
			? updatedAtTs
			: Date.now();
		this.updateWaveformReliability(referenceBpm, waveformProfile);

		this.observeReference(
			referenceBpm,
			clamp(0.25 + s * 0.2, 0.25, 0.5),
			measurements,
		);
	}

	reinforceHarmonicReference(
		referenceBpm: number,
		measurements: EstimatorMeasurement[],
		strength = 1,
		updatedAtTs = Date.now(),
		waveformProfile: WaveformPeriodicityProfile | null = null,
	) {
		if (!Number.isFinite(referenceBpm)) return;
		const s = clamp(strength, 0, 1);
		this.updateReliability(referenceBpm, measurements);

		const modeWeights = this.inferReferenceModeWeights(referenceBpm, measurements);
		for (const mode of MODES) {
			this.harmonicPrior[mode] = clamp(
				this.harmonicPrior[mode] * (1 - s * 0.55) +
					modeWeights[mode] * (s * 0.55),
				0.65,
				1.9,
			);
		}

		this.referencePriorLastUpdatedTs = Number.isFinite(updatedAtTs)
			? updatedAtTs
			: Date.now();
		this.updateWaveformReliability(referenceBpm, waveformProfile);
	}

	updateReliability(
		referenceBpm: number,
		measurements: EstimatorMeasurement[],
	) {
		if (!Number.isFinite(referenceBpm)) return;
		const learningRate = 0.04;

		for (const measurement of measurements) {
			if (measurement.bpm == null || !Number.isFinite(measurement.bpm)) {
				continue;
			}
			const directErr = Math.abs(measurement.bpm - referenceBpm);
			const aliasErr = Math.min(
				Math.abs(measurement.bpm - referenceBpm * 0.5),
				Math.abs(measurement.bpm - referenceBpm * 2),
			);
			const reliabilityTarget = clamp(1 - directErr / 28, 0, 1);
			const confusionTarget = aliasErr + 2 < directErr ? 1 : 0;

			this.sourceReliability[measurement.source] = clamp(
				this.sourceReliability[measurement.source] * (1 - learningRate) +
					reliabilityTarget * learningRate,
				0.2,
				1.2,
			);
			this.sourceHarmonicConfusion[measurement.source] = clamp(
				this.sourceHarmonicConfusion[measurement.source] *
					(1 - learningRate) +
					confusionTarget * learningRate,
				0.05,
				0.9,
			);
		}
	}

	getSnapshot(): BpmBayesSnapshot {
		return {
			minBpm: this.minBpm,
			maxBpm: this.maxBpm,
			stepBpm: this.stepBpm,
			posterior: Array.from(this.posterior),
			sourceReliability: { ...this.sourceReliability },
			sourceHarmonicConfusion: { ...this.sourceHarmonicConfusion },
			referencePriorBpm: this.referencePriorBpm,
			referencePriorWeight: this.referencePriorWeight,
			harmonicPrior: { ...this.harmonicPrior },
			referencePriorOrigin: this.referencePriorOrigin,
			referencePriorLastUpdatedTs: this.referencePriorLastUpdatedTs,
			waveformReliability: this.waveformReliability,
		};
	}

	getReferenceState(): TrackerReferenceState {
		return {
			bpm: this.referencePriorBpm,
			weight: this.referencePriorWeight,
			harmonicPrior: { ...this.harmonicPrior },
			origin: this.referencePriorOrigin,
			lastUpdatedTs: this.referencePriorLastUpdatedTs,
			waveformReliability: this.waveformReliability,
		};
	}

	loadSnapshot(snapshot: unknown) {
		if (!snapshot || typeof snapshot !== "object") return;
		const raw = snapshot as Partial<BpmBayesSnapshot>;
		if (
			raw.minBpm !== this.minBpm ||
			raw.maxBpm !== this.maxBpm ||
			raw.stepBpm !== this.stepBpm ||
			!Array.isArray(raw.posterior) ||
			raw.posterior.length !== this.posterior.length
		) {
			return;
		}

		for (let i = 0; i < this.posterior.length; i++) {
			const value = Number(raw.posterior[i]);
			this.posterior[i] = Number.isFinite(value) && value > 0 ? value : 1e-9;
		}
		this.normalize();

		if (raw.sourceReliability) {
			for (const source of ["peaks", "acf", "spectral"] as TrackerSource[]) {
				const value = Number(raw.sourceReliability[source]);
				if (Number.isFinite(value)) {
					this.sourceReliability[source] = clamp(value, 0.2, 1.2);
				}
			}
		}

		if (raw.sourceHarmonicConfusion) {
			for (const source of ["peaks", "acf", "spectral"] as TrackerSource[]) {
				const value = Number(raw.sourceHarmonicConfusion[source]);
				if (Number.isFinite(value)) {
					this.sourceHarmonicConfusion[source] = clamp(value, 0.05, 0.9);
				}
			}
		}

		if ("referencePriorBpm" in raw) {
			const value = Number(raw.referencePriorBpm);
			this.referencePriorBpm = Number.isFinite(value)
				? clamp(value, this.minBpm, this.maxBpm)
				: null;
		}

		if ("referencePriorWeight" in raw) {
			const value = Number(raw.referencePriorWeight);
			if (Number.isFinite(value)) {
				this.referencePriorWeight = clamp(value, 0, 1);
			}
		}

		if (raw.harmonicPrior) {
			for (const mode of MODES) {
				const value = Number(raw.harmonicPrior[mode]);
				if (Number.isFinite(value)) {
					this.harmonicPrior[mode] = clamp(value, 0.65, 1.9);
				}
			}
		}

		if (
			raw.referencePriorOrigin === "session_pair" ||
			raw.referencePriorOrigin === "snapshot_restore" ||
			raw.referencePriorOrigin === "none"
		) {
			this.referencePriorOrigin = raw.referencePriorOrigin;
		} else if (
			this.referencePriorBpm != null &&
			this.referencePriorWeight > 0.01
		) {
			this.referencePriorOrigin = "snapshot_restore";
		} else {
			this.referencePriorOrigin = "none";
		}

		if ("referencePriorLastUpdatedTs" in raw) {
			const value = Number(raw.referencePriorLastUpdatedTs);
			this.referencePriorLastUpdatedTs = Number.isFinite(value) ? value : null;
		} else if (
			this.referencePriorOrigin === "snapshot_restore" ||
			this.referencePriorOrigin === "none"
		) {
			this.referencePriorLastUpdatedTs = null;
		}

		if ("waveformReliability" in raw) {
			const value = Number(raw.waveformReliability);
			if (Number.isFinite(value)) {
				this.waveformReliability = clamp(value, 0.05, 0.9);
			}
		}
	}

	private toIndex(bpmIndex: number, modeIndex: number): number {
		return modeIndex * this.bpmGrid.length + bpmIndex;
	}

	private applyTemporalPrior(dtSec: number, context: TrackerContext) {
		const prior = new Float64Array(this.posterior.length);
		const sigmaBpm = clamp(1.8 + dtSec * 2.8 + context.motion * 9, 1.5, 16);
		const modeStay = clamp(0.9 - context.motion * 0.15, 0.55, 0.95);

		for (let prevMode = 0; prevMode < MODES.length; prevMode++) {
			for (let prevBpm = 0; prevBpm < this.bpmGrid.length; prevBpm++) {
				const posteriorValue = this.posterior[this.toIndex(prevBpm, prevMode)];
				if (posteriorValue <= 0) continue;

				for (let nextMode = 0; nextMode < MODES.length; nextMode++) {
					const modeTransition =
						prevMode === nextMode ? modeStay : (1 - modeStay) / 2;
					for (let nextBpm = 0; nextBpm < this.bpmGrid.length; nextBpm++) {
						const kernel = gaussian(
							this.bpmGrid[nextBpm],
							this.bpmGrid[prevBpm],
							sigmaBpm,
						);
						prior[this.toIndex(nextBpm, nextMode)] +=
							posteriorValue * modeTransition * kernel;
					}
				}
			}
		}

		this.posterior = prior;
		this.normalize();
	}

	private estimate(): TrackerEstimate {
		const bpmMarginal = new Float64Array(this.bpmGrid.length);
		const modeMass: Record<HarmonicMode, number> = {
			half: 0,
			fundamental: 0,
			double: 0,
		};

		for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
			const mode = MODES[modeIndex];
			for (let bpmIndex = 0; bpmIndex < this.bpmGrid.length; bpmIndex++) {
				const probability = this.posterior[this.toIndex(bpmIndex, modeIndex)];
				bpmMarginal[bpmIndex] += probability;
				modeMass[mode] += probability;
			}
		}

		let bestIndex = -1;
		let bestMass = 0;
		for (let bpmIndex = 0; bpmIndex < this.bpmGrid.length; bpmIndex++) {
			if (bpmMarginal[bpmIndex] > bestMass) {
				bestMass = bpmMarginal[bpmIndex];
				bestIndex = bpmIndex;
			}
		}

		if (bestIndex < 0 || bestMass <= 0) {
			return {
				bpm: null,
				confidence: 0,
				modeProbabilities: modeMass,
				entropy: 1,
			};
		}

		let localMass = 0;
		const bestBpm = this.bpmGrid[bestIndex];
		for (let bpmIndex = 0; bpmIndex < this.bpmGrid.length; bpmIndex++) {
			if (Math.abs(this.bpmGrid[bpmIndex] - bestBpm) <= 3) {
				localMass += bpmMarginal[bpmIndex];
			}
		}

		let entropy = 0;
		for (let i = 0; i < this.posterior.length; i++) {
			const probability = this.posterior[i];
			if (probability > 0) entropy -= probability * Math.log(probability);
		}
		const maxEntropy = Math.log(this.posterior.length);
		const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 1;
		const confidence = clamp(localMass * (1 - normalizedEntropy * 0.35), 0, 1);

		return {
			bpm: bestBpm,
			confidence,
			modeProbabilities: modeMass,
			entropy: normalizedEntropy,
		};
	}

	private normalize() {
		let sum = 0;
		for (let i = 0; i < this.posterior.length; i++) {
			const value = this.posterior[i];
			if (Number.isFinite(value) && value > 0) sum += value;
		}
		if (!Number.isFinite(sum) || sum <= 0) {
			this.reset();
			return;
		}
		for (let i = 0; i < this.posterior.length; i++) {
			const value = this.posterior[i];
			this.posterior[i] = Number.isFinite(value) && value > 0 ? value / sum : 1e-12;
		}
	}

	private applyWaveformEvidence(
		waveformProfile: WaveformPeriodicityProfile | null,
		motion: number,
		quality: number,
		snrPenalty: number,
		measurements: EstimatorMeasurement[],
		referenceBpm: number | undefined | null,
	) {
		if (
			!waveformProfile ||
			!Array.isArray(waveformProfile.scores) ||
			!waveformProfile.scores.length ||
			!Number.isFinite(waveformProfile.confidence) ||
			waveformProfile.confidence <= 0.02 ||
			waveformProfile.stepBpm <= 0
		) {
			return;
		}

		const agreement = this.estimateWaveformAgreement(
			waveformProfile,
			measurements,
			referenceBpm,
		);
		const gain = clamp(
			(0.015 +
				waveformProfile.confidence * 0.11 +
				quality * 0.03 -
				motion * 0.03 -
				snrPenalty * 0.02) *
				this.waveformReliability *
				agreement,
			0,
			0.12,
		);
		if (gain <= 0.01) return;

		const scoreAtObservedBpm = (observedBpm: number) => {
			if (
				!Number.isFinite(observedBpm) ||
				observedBpm < waveformProfile.minBpm ||
				observedBpm > waveformProfile.maxBpm
			) {
				return 0.03;
			}
			const index = Math.round(
				(observedBpm - waveformProfile.minBpm) / waveformProfile.stepBpm,
			);
			const clampedIndex = clamp(index, 0, waveformProfile.scores.length - 1);
			const raw = waveformProfile.scores[clampedIndex];
			return Number.isFinite(raw) ? clamp(raw, 0.03, 1) : 0.03;
		};

		for (let bpmIndex = 0; bpmIndex < this.bpmGrid.length; bpmIndex++) {
			const fundamental = this.bpmGrid[bpmIndex];
			for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
				const observedBpm = fundamental * modeFactor(MODES[modeIndex]);
				const waveformScore = scoreAtObservedBpm(observedBpm);
				const posteriorIndex = this.toIndex(bpmIndex, modeIndex);
				this.posterior[posteriorIndex] *= waveformScore ** gain;
			}
		}
	}

	private updateWaveformReliability(
		referenceBpm: number,
		waveformProfile: WaveformPeriodicityProfile | null,
	) {
		if (
			!waveformProfile ||
			!Array.isArray(waveformProfile.scores) ||
			!waveformProfile.scores.length ||
			!Number.isFinite(waveformProfile.confidence) ||
			waveformProfile.confidence <= 0.05
		) {
			return;
		}

		const scoreAt = (bpm: number) => {
			if (
				!Number.isFinite(bpm) ||
				bpm < waveformProfile.minBpm ||
				bpm > waveformProfile.maxBpm
			) {
				return 0.01;
			}
			const index = clamp(
				Math.round((bpm - waveformProfile.minBpm) / waveformProfile.stepBpm),
				0,
				waveformProfile.scores.length - 1,
			);
			const score = waveformProfile.scores[index];
			return Number.isFinite(score) ? clamp(score, 0.01, 1) : 0.01;
		};

		const harmonicSupport = Math.max(
			scoreAt(referenceBpm),
			scoreAt(referenceBpm * 0.5) * 0.95,
			scoreAt(referenceBpm * 2) * 0.7,
		);
		const topCandidate = waveformProfile.topCandidates?.[0] ?? null;
		const topErr = topCandidate
			? Math.min(
					Math.abs(topCandidate.bpm - referenceBpm),
					Math.abs(topCandidate.bpm - referenceBpm * 0.5),
					Math.abs(topCandidate.bpm - referenceBpm * 2),
				)
			: 999;
		const offTargetPenalty =
			topCandidate && topErr > 14 ? clamp(topCandidate.posterior, 0, 1) : 0;
		const targetReliability = clamp(
			harmonicSupport * 1.35 - offTargetPenalty * 0.7,
			0.05,
			0.85,
		);
		const learningRate = clamp(
			0.08 + waveformProfile.confidence * 0.12,
			0.08,
			0.2,
		);
		this.waveformReliability = clamp(
			this.waveformReliability * (1 - learningRate) +
				targetReliability * learningRate,
			0.05,
			0.9,
		);
	}

	private estimateWaveformAgreement(
		waveformProfile: WaveformPeriodicityProfile | null,
		measurements: EstimatorMeasurement[],
		referenceBpm: number | undefined | null,
	) {
		const candidates = [
			waveformProfile?.dominantBpm ?? null,
			waveformProfile?.secondaryBpm ?? null,
		].filter((value): value is number => value != null && Number.isFinite(value));
		if (!candidates.length) return 0.2;

		const targets: number[] = [];
		for (const measurement of measurements) {
			if (measurement.bpm != null && Number.isFinite(measurement.bpm)) {
				targets.push(measurement.bpm);
			}
		}
		if (referenceBpm != null && Number.isFinite(referenceBpm)) {
			targets.push(referenceBpm, referenceBpm * 0.5, referenceBpm * 2);
		}
		if (!targets.length) return 0.45;

		let bestAgreement = 0;
		for (const candidate of candidates) {
			for (const target of targets) {
				const err = Math.abs(candidate - target);
				bestAgreement = Math.max(bestAgreement, Math.exp(-err / 10));
			}
		}
		return clamp(bestAgreement, 0.12, 1);
	}

	private applyPersistentReferencePrior(dtSec: number) {
		if (
			this.referencePriorBpm == null ||
			!Number.isFinite(this.referencePriorBpm) ||
			this.referencePriorWeight <= 0.01
		) {
			return;
		}

		const sigma = clamp(8 + (1 - this.referencePriorWeight) * 6, 8, 14);
		const gain = clamp(0.08 + this.referencePriorWeight * 0.22, 0.08, 0.3);
		for (let bpmIndex = 0; bpmIndex < this.bpmGrid.length; bpmIndex++) {
			const fundamental = this.bpmGrid[bpmIndex];
			const referenceLikelihood = gaussian(
				this.referencePriorBpm,
				fundamental,
				sigma,
			);
			for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
				const mode = MODES[modeIndex];
				const posteriorIndex = this.toIndex(bpmIndex, modeIndex);
				this.posterior[posteriorIndex] *=
					referenceLikelihood ** (gain * this.harmonicPrior[mode]);
			}
		}

		const refDecay = Math.exp(-dtSec / 180);
		this.referencePriorWeight = clamp(this.referencePriorWeight * refDecay, 0, 1);
		const modeDecay = Math.exp(-dtSec / 300);
		for (const mode of MODES) {
			this.harmonicPrior[mode] = 1 + (this.harmonicPrior[mode] - 1) * modeDecay;
		}
	}

	private inferReferenceModeWeights(
		referenceBpm: number,
		measurements: EstimatorMeasurement[],
	): Record<HarmonicMode, number> {
		const weights: Record<HarmonicMode, number> = {
			half: 1,
			fundamental: 1,
			double: 1,
		};
		const valid = measurements.filter(
			(measurement) =>
				measurement.bpm != null &&
				Number.isFinite(measurement.bpm) &&
				measurement.confidence > 0,
		);
		if (!valid.length) {
			return {
				half: 0.95,
				fundamental: 1.15,
				double: 0.95,
			};
		}

		for (const measurement of valid) {
			const confidence = clamp(measurement.confidence, 0, 1);
			const expectedByMode: Record<HarmonicMode, number> = {
				half: referenceBpm * 0.5,
				fundamental: referenceBpm,
				double: referenceBpm * 2,
			};
			const modeScores = MODES.map((mode) => {
				const err = Math.abs((measurement.bpm ?? 0) - expectedByMode[mode]);
				return { mode, score: Math.exp(-err / 12) * confidence };
			});
			modeScores.sort((a, b) => b.score - a.score);
			const best = modeScores[0];
			const second = modeScores[1];
			weights[best.mode] += 0.45 * best.score;
			weights[second.mode] += 0.12 * second.score;
		}

		return {
			half: clamp(weights.half, 0.75, 1.6),
			fundamental: clamp(weights.fundamental, 0.75, 1.6),
			double: clamp(weights.double, 0.75, 1.6),
		};
	}
}
