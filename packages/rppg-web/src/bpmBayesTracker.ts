export type TrackerSource = "peaks" | "acf" | "spectral";
export type HarmonicMode = "half" | "fundamental" | "double";

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
	}

	update(
		measurements: EstimatorMeasurement[],
		dtSec: number,
		context: TrackerContext,
	): TrackerEstimate {
		this.applyTemporalPrior(dtSec, context);

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
					this.posterior[posteriorIndex] *= Math.pow(blended, reliability);
				}
			}
		}

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

	observeReference(referenceBpm: number, strength = 1) {
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
				this.posterior[posteriorIndex] *= Math.pow(referenceLikelihood, gain);
			}
		}
		this.normalize();
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

		const bestBpm = this.bpmGrid[bestIndex];
		let localMass = 0;
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

		return {
			bpm: bestBpm,
			confidence: clamp(localMass * (1 - normalizedEntropy * 0.35), 0, 1),
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
			this.posterior[i] =
				Number.isFinite(value) && value > 0 ? value / sum : 1e-12;
		}
	}
}
