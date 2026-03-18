// src/bpmBayesTracker.ts
var MODES = ["half", "fundamental", "double"];
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function modeFactor(mode) {
  if (mode === "half") return 0.5;
  if (mode === "double") return 2;
  return 1;
}
function gaussian(x, mu, sigma) {
  if (!Number.isFinite(x) || !Number.isFinite(mu) || !Number.isFinite(sigma) || sigma <= 0) {
    return 1e-9;
  }
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) + 1e-9;
}
var BpmBayesTracker = class {
  constructor(minBpm = 40, maxBpm = 180, stepBpm = 1) {
    this.sourceReliability = {
      peaks: 0.75,
      acf: 0.85,
      spectral: 0.95
    };
    this.sourceHarmonicConfusion = {
      peaks: 0.35,
      acf: 0.2,
      spectral: 0.25
    };
    this.referencePriorBpm = null;
    this.referencePriorWeight = 0;
    this.harmonicPrior = {
      half: 1,
      fundamental: 1,
      double: 1
    };
    this.referencePriorOrigin = "none";
    this.referencePriorLastUpdatedTs = null;
    this.waveformReliability = 0.22;
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
      double: 1
    };
    this.referencePriorOrigin = "none";
    this.referencePriorLastUpdatedTs = null;
    this.waveformReliability = 0.22;
  }
  update(measurements, dtSec, context) {
    this.applyTemporalPrior(dtSec, context);
    this.applyPersistentReferencePrior(dtSec);
    const motion = clamp(context.motion, 0, 1);
    const quality = clamp(context.quality, 0, 1);
    const snrPenalty = context.snrDb < 0 ? clamp(-context.snrDb / 10, 0, 2) : 0;
    for (const measurement of measurements) {
      if (measurement.bpm == null || !Number.isFinite(measurement.bpm) || measurement.confidence <= 0) {
        continue;
      }
      const confidence = clamp(measurement.confidence, 0, 1);
      const reliability = clamp(
        this.sourceReliability[measurement.source] * confidence * (0.5 + quality * 0.5),
        0.1,
        1.5
      );
      const harmonicConfusion = clamp(
        this.sourceHarmonicConfusion[measurement.source] + motion * 0.15 + snrPenalty * 0.05,
        0.05,
        0.85
      );
      const sigma = clamp(
        2.5 + (1 - confidence) * 11 + motion * 8 + snrPenalty * 2,
        2,
        24
      );
      for (let bpmIndex = 0; bpmIndex < this.bpmGrid.length; bpmIndex++) {
        const fundamental = this.bpmGrid[bpmIndex];
        const stateFund = gaussian(measurement.bpm, fundamental, sigma);
        const stateHalf = gaussian(measurement.bpm, fundamental * 0.5, sigma);
        const stateDouble = gaussian(measurement.bpm, fundamental * 2, sigma);
        for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
          const obs = fundamental * modeFactor(MODES[modeIndex]);
          const modeObs = gaussian(measurement.bpm, obs, sigma);
          const blended = (1 - harmonicConfusion) * modeObs + harmonicConfusion * (0.6 * stateFund + 0.2 * stateHalf + 0.2 * stateDouble);
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
      context.referenceBpm
    );
    if (context.referenceBpm != null && Number.isFinite(context.referenceBpm)) {
      this.observeReference(
        context.referenceBpm,
        context.referenceStrength ?? 1
      );
    }
    this.normalize();
    return this.estimate();
  }
  observeReference(referenceBpm, strength = 1, _measurements = []) {
    if (!Number.isFinite(referenceBpm)) return;
    const s = clamp(strength, 0, 1);
    const sigma = clamp(1.5 + (1 - s) * 4, 1.5, 6);
    const gain = clamp(1.2 + s * 2.2, 1, 4);
    for (let bpmIndex = 0; bpmIndex < this.bpmGrid.length; bpmIndex++) {
      const referenceLikelihood = gaussian(
        referenceBpm,
        this.bpmGrid[bpmIndex],
        sigma
      );
      for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
        const posteriorIndex = this.toIndex(bpmIndex, modeIndex);
        this.posterior[posteriorIndex] *= referenceLikelihood ** gain;
      }
    }
    this.normalize();
  }
  reinforceReference(referenceBpm, measurements, strength = 1, updatedAtTs = Date.now(), waveformProfile = null) {
    if (!Number.isFinite(referenceBpm)) return;
    const s = clamp(strength, 0, 1);
    this.updateReliability(referenceBpm, measurements);
    const modeWeights = this.inferReferenceModeWeights(referenceBpm, measurements);
    for (const mode of MODES) {
      this.harmonicPrior[mode] = clamp(
        this.harmonicPrior[mode] * (1 - s * 0.45) + modeWeights[mode] * (s * 0.45),
        0.65,
        1.9
      );
    }
    if (this.referencePriorBpm == null || !Number.isFinite(this.referencePriorBpm)) {
      this.referencePriorBpm = referenceBpm;
    } else {
      const blend = clamp(0.2 + s * 0.35, 0.2, 0.55);
      this.referencePriorBpm = this.referencePriorBpm * (1 - blend) + referenceBpm * blend;
    }
    this.referencePriorWeight = clamp(
      Math.max(this.referencePriorWeight * 0.9, 0.18) + s * 0.45,
      0,
      1
    );
    this.referencePriorOrigin = "session_pair";
    this.referencePriorLastUpdatedTs = Number.isFinite(updatedAtTs) ? updatedAtTs : Date.now();
    this.updateWaveformReliability(referenceBpm, waveformProfile);
    this.observeReference(
      referenceBpm,
      clamp(0.25 + s * 0.2, 0.25, 0.5),
      measurements
    );
  }
  reinforceHarmonicReference(referenceBpm, measurements, strength = 1, updatedAtTs = Date.now(), waveformProfile = null) {
    if (!Number.isFinite(referenceBpm)) return;
    const s = clamp(strength, 0, 1);
    this.updateReliability(referenceBpm, measurements);
    const modeWeights = this.inferReferenceModeWeights(referenceBpm, measurements);
    for (const mode of MODES) {
      this.harmonicPrior[mode] = clamp(
        this.harmonicPrior[mode] * (1 - s * 0.55) + modeWeights[mode] * (s * 0.55),
        0.65,
        1.9
      );
    }
    this.referencePriorLastUpdatedTs = Number.isFinite(updatedAtTs) ? updatedAtTs : Date.now();
    this.updateWaveformReliability(referenceBpm, waveformProfile);
  }
  updateReliability(referenceBpm, measurements) {
    if (!Number.isFinite(referenceBpm)) return;
    const learningRate = 0.04;
    for (const measurement of measurements) {
      if (measurement.bpm == null || !Number.isFinite(measurement.bpm)) {
        continue;
      }
      const directErr = Math.abs(measurement.bpm - referenceBpm);
      const aliasErr = Math.min(
        Math.abs(measurement.bpm - referenceBpm * 0.5),
        Math.abs(measurement.bpm - referenceBpm * 2)
      );
      const reliabilityTarget = clamp(1 - directErr / 28, 0, 1);
      const confusionTarget = aliasErr + 2 < directErr ? 1 : 0;
      this.sourceReliability[measurement.source] = clamp(
        this.sourceReliability[measurement.source] * (1 - learningRate) + reliabilityTarget * learningRate,
        0.2,
        1.2
      );
      this.sourceHarmonicConfusion[measurement.source] = clamp(
        this.sourceHarmonicConfusion[measurement.source] * (1 - learningRate) + confusionTarget * learningRate,
        0.05,
        0.9
      );
    }
  }
  getSnapshot() {
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
      waveformReliability: this.waveformReliability
    };
  }
  getReferenceState() {
    return {
      bpm: this.referencePriorBpm,
      weight: this.referencePriorWeight,
      harmonicPrior: { ...this.harmonicPrior },
      origin: this.referencePriorOrigin,
      lastUpdatedTs: this.referencePriorLastUpdatedTs,
      waveformReliability: this.waveformReliability
    };
  }
  loadSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return;
    const raw = snapshot;
    if (raw.minBpm !== this.minBpm || raw.maxBpm !== this.maxBpm || raw.stepBpm !== this.stepBpm || !Array.isArray(raw.posterior) || raw.posterior.length !== this.posterior.length) {
      return;
    }
    for (let i = 0; i < this.posterior.length; i++) {
      const value = Number(raw.posterior[i]);
      this.posterior[i] = Number.isFinite(value) && value > 0 ? value : 1e-9;
    }
    this.normalize();
    if (raw.sourceReliability) {
      for (const source of ["peaks", "acf", "spectral"]) {
        const value = Number(raw.sourceReliability[source]);
        if (Number.isFinite(value)) {
          this.sourceReliability[source] = clamp(value, 0.2, 1.2);
        }
      }
    }
    if (raw.sourceHarmonicConfusion) {
      for (const source of ["peaks", "acf", "spectral"]) {
        const value = Number(raw.sourceHarmonicConfusion[source]);
        if (Number.isFinite(value)) {
          this.sourceHarmonicConfusion[source] = clamp(value, 0.05, 0.9);
        }
      }
    }
    if ("referencePriorBpm" in raw) {
      const value = Number(raw.referencePriorBpm);
      this.referencePriorBpm = Number.isFinite(value) ? clamp(value, this.minBpm, this.maxBpm) : null;
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
    if (raw.referencePriorOrigin === "session_pair" || raw.referencePriorOrigin === "snapshot_restore" || raw.referencePriorOrigin === "none") {
      this.referencePriorOrigin = raw.referencePriorOrigin;
    } else if (this.referencePriorBpm != null && this.referencePriorWeight > 0.01) {
      this.referencePriorOrigin = "snapshot_restore";
    } else {
      this.referencePriorOrigin = "none";
    }
    if ("referencePriorLastUpdatedTs" in raw) {
      const value = Number(raw.referencePriorLastUpdatedTs);
      this.referencePriorLastUpdatedTs = Number.isFinite(value) ? value : null;
    } else if (this.referencePriorOrigin === "snapshot_restore" || this.referencePriorOrigin === "none") {
      this.referencePriorLastUpdatedTs = null;
    }
    if ("waveformReliability" in raw) {
      const value = Number(raw.waveformReliability);
      if (Number.isFinite(value)) {
        this.waveformReliability = clamp(value, 0.05, 0.9);
      }
    }
  }
  toIndex(bpmIndex, modeIndex) {
    return modeIndex * this.bpmGrid.length + bpmIndex;
  }
  applyTemporalPrior(dtSec, context) {
    const prior = new Float64Array(this.posterior.length);
    const sigmaBpm = clamp(1.8 + dtSec * 2.8 + context.motion * 9, 1.5, 16);
    const modeStay = clamp(0.9 - context.motion * 0.15, 0.55, 0.95);
    for (let prevMode = 0; prevMode < MODES.length; prevMode++) {
      for (let prevBpm = 0; prevBpm < this.bpmGrid.length; prevBpm++) {
        const posteriorValue = this.posterior[this.toIndex(prevBpm, prevMode)];
        if (posteriorValue <= 0) continue;
        for (let nextMode = 0; nextMode < MODES.length; nextMode++) {
          const modeTransition = prevMode === nextMode ? modeStay : (1 - modeStay) / 2;
          for (let nextBpm = 0; nextBpm < this.bpmGrid.length; nextBpm++) {
            const kernel = gaussian(
              this.bpmGrid[nextBpm],
              this.bpmGrid[prevBpm],
              sigmaBpm
            );
            prior[this.toIndex(nextBpm, nextMode)] += posteriorValue * modeTransition * kernel;
          }
        }
      }
    }
    this.posterior = prior;
    this.normalize();
  }
  estimate() {
    const bpmMarginal = new Float64Array(this.bpmGrid.length);
    const modeMass = {
      half: 0,
      fundamental: 0,
      double: 0
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
        entropy: 1
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
      entropy: normalizedEntropy
    };
  }
  normalize() {
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
  applyWaveformEvidence(waveformProfile, motion, quality, snrPenalty, measurements, referenceBpm) {
    if (!waveformProfile || !Array.isArray(waveformProfile.scores) || !waveformProfile.scores.length || !Number.isFinite(waveformProfile.confidence) || waveformProfile.confidence <= 0.02 || waveformProfile.stepBpm <= 0) {
      return;
    }
    const agreement = this.estimateWaveformAgreement(
      waveformProfile,
      measurements,
      referenceBpm
    );
    const gain = clamp(
      (0.015 + waveformProfile.confidence * 0.11 + quality * 0.03 - motion * 0.03 - snrPenalty * 0.02) * this.waveformReliability * agreement,
      0,
      0.12
    );
    if (gain <= 0.01) return;
    const scoreAtObservedBpm = (observedBpm) => {
      if (!Number.isFinite(observedBpm) || observedBpm < waveformProfile.minBpm || observedBpm > waveformProfile.maxBpm) {
        return 0.03;
      }
      const index = Math.round(
        (observedBpm - waveformProfile.minBpm) / waveformProfile.stepBpm
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
  updateWaveformReliability(referenceBpm, waveformProfile) {
    if (!waveformProfile || !Array.isArray(waveformProfile.scores) || !waveformProfile.scores.length || !Number.isFinite(waveformProfile.confidence) || waveformProfile.confidence <= 0.05) {
      return;
    }
    const scoreAt = (bpm) => {
      if (!Number.isFinite(bpm) || bpm < waveformProfile.minBpm || bpm > waveformProfile.maxBpm) {
        return 0.01;
      }
      const index = clamp(
        Math.round((bpm - waveformProfile.minBpm) / waveformProfile.stepBpm),
        0,
        waveformProfile.scores.length - 1
      );
      const score = waveformProfile.scores[index];
      return Number.isFinite(score) ? clamp(score, 0.01, 1) : 0.01;
    };
    const harmonicSupport = Math.max(
      scoreAt(referenceBpm),
      scoreAt(referenceBpm * 0.5) * 0.95,
      scoreAt(referenceBpm * 2) * 0.7
    );
    const topCandidate = waveformProfile.topCandidates?.[0] ?? null;
    const topErr = topCandidate ? Math.min(
      Math.abs(topCandidate.bpm - referenceBpm),
      Math.abs(topCandidate.bpm - referenceBpm * 0.5),
      Math.abs(topCandidate.bpm - referenceBpm * 2)
    ) : 999;
    const offTargetPenalty = topCandidate && topErr > 14 ? clamp(topCandidate.posterior, 0, 1) : 0;
    const targetReliability = clamp(
      harmonicSupport * 1.35 - offTargetPenalty * 0.7,
      0.05,
      0.85
    );
    const learningRate = clamp(
      0.08 + waveformProfile.confidence * 0.12,
      0.08,
      0.2
    );
    this.waveformReliability = clamp(
      this.waveformReliability * (1 - learningRate) + targetReliability * learningRate,
      0.05,
      0.9
    );
  }
  estimateWaveformAgreement(waveformProfile, measurements, referenceBpm) {
    const candidates = [
      waveformProfile?.dominantBpm ?? null,
      waveformProfile?.secondaryBpm ?? null
    ].filter((value) => value != null && Number.isFinite(value));
    if (!candidates.length) return 0.2;
    const targets = [];
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
  applyPersistentReferencePrior(dtSec) {
    if (this.referencePriorBpm == null || !Number.isFinite(this.referencePriorBpm) || this.referencePriorWeight <= 0.01) {
      return;
    }
    const sigma = clamp(8 + (1 - this.referencePriorWeight) * 6, 8, 14);
    const gain = clamp(0.08 + this.referencePriorWeight * 0.22, 0.08, 0.3);
    for (let bpmIndex = 0; bpmIndex < this.bpmGrid.length; bpmIndex++) {
      const fundamental = this.bpmGrid[bpmIndex];
      const referenceLikelihood = gaussian(
        this.referencePriorBpm,
        fundamental,
        sigma
      );
      for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
        const mode = MODES[modeIndex];
        const posteriorIndex = this.toIndex(bpmIndex, modeIndex);
        this.posterior[posteriorIndex] *= referenceLikelihood ** (gain * this.harmonicPrior[mode]);
      }
    }
    const refDecay = Math.exp(-dtSec / 180);
    this.referencePriorWeight = clamp(this.referencePriorWeight * refDecay, 0, 1);
    const modeDecay = Math.exp(-dtSec / 300);
    for (const mode of MODES) {
      this.harmonicPrior[mode] = 1 + (this.harmonicPrior[mode] - 1) * modeDecay;
    }
  }
  inferReferenceModeWeights(referenceBpm, measurements) {
    const weights = {
      half: 1,
      fundamental: 1,
      double: 1
    };
    const valid = measurements.filter(
      (measurement) => measurement.bpm != null && Number.isFinite(measurement.bpm) && measurement.confidence > 0
    );
    if (!valid.length) {
      return {
        half: 0.95,
        fundamental: 1.15,
        double: 0.95
      };
    }
    for (const measurement of valid) {
      const confidence = clamp(measurement.confidence, 0, 1);
      const expectedByMode = {
        half: referenceBpm * 0.5,
        fundamental: referenceBpm,
        double: referenceBpm * 2
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
      double: clamp(weights.double, 0.75, 1.6)
    };
  }
};

// src/rppgDiagnostics.ts
var BPM_MIN = 40;
var BPM_MAX = 180;
function clamp2(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function computeWaveformPeriodicityProfile(data, sampleRate, minBpm = BPM_MIN, maxBpm = BPM_MAX, stepBpm = 1) {
  const n = data.length;
  if (n < 60 || sampleRate <= 0 || minBpm >= maxBpm || stepBpm <= 0) {
    return null;
  }
  const mean2 = data.reduce((sum, value) => sum + value, 0) / n;
  const centered = data.map((value) => value - mean2);
  let energy = 0;
  for (let i = 0; i < centered.length; i++) {
    energy += centered[i] * centered[i];
  }
  if (!Number.isFinite(energy) || energy <= 1e-9) return null;
  const lagCache = /* @__PURE__ */ new Map();
  const scoreForLag = (lag) => {
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
    const corr = denom > 0 ? dot / denom * overlapWeight : -1;
    lagCache.set(lag, corr);
    return corr;
  };
  const bpmGrid = [];
  const rawScores = [];
  const lags = [];
  for (let bpm = minBpm; bpm <= maxBpm + 1e-9; bpm += stepBpm) {
    bpmGrid.push(bpm);
    const lag = Math.round(60 * sampleRate / bpm);
    lags.push(lag);
    rawScores.push(scoreForLag(lag));
  }
  if (!rawScores.length) return null;
  const sorted = rawScores.slice().sort((a, b) => b - a);
  const bestRaw = sorted[0] ?? -1;
  const medianRaw = sorted[Math.floor(sorted.length / 2)] ?? bestRaw;
  const groupedByLag = /* @__PURE__ */ new Map();
  const logits = rawScores.map((score) => clamp2((score - medianRaw) / 0.06, -10, 10));
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
        rawWeight
      });
    }
  }
  const candidates = Array.from(groupedByLag.values()).map((group) => ({
    lag: group.lag,
    bpm: group.bpms.reduce((sum, value) => sum + value, 0) / group.bpms.length,
    rawScore: group.rawScore,
    rawWeight: group.rawWeight
  })).sort((a, b) => b.rawWeight - a.rawWeight);
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.rawWeight, 0) || 1;
  const candidatesWithPosterior = candidates.map((candidate) => ({
    ...candidate,
    posterior: candidate.rawWeight / totalWeight
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
  const contrast = clamp2((dominant?.rawScore ?? bestRaw) - secondRaw, 0, 1);
  const topMass = dominant?.posterior ?? 0;
  const confidence = clamp2(
    topMass * 1.6 * (1 - normalizedEntropy * 0.75) * clamp2(contrast / 0.1, 0.05, 1),
    0,
    1
  );
  const scoreByLag = /* @__PURE__ */ new Map();
  for (const candidate of candidatesWithPosterior) {
    scoreByLag.set(candidate.lag, clamp2(candidate.posterior, 0.01, 1));
  }
  const scores = lags.map(
    (lag) => Number((scoreByLag.get(lag) ?? 0.01).toFixed(6))
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
      lag: candidate.lag
    }))
  };
}

// src/rppgReplay.ts
function clamp3(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function mean(values) {
  if (!values.length) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}
function mae(values, reference) {
  const valid = values.filter(
    (value) => value != null && Number.isFinite(value)
  );
  if (!valid.length) return null;
  return valid.reduce((acc, value) => acc + Math.abs(value - reference), 0) / valid.length;
}
function parseCandidateSummary(summary) {
  if (!summary) return {};
  const parsed = {};
  for (const part of summary.split("|")) {
    const trimmed = part.trim();
    const match = /^(peaks|acf|spectral):[-+0-9.]+@([-+0-9.]+)$/.exec(trimmed);
    if (!match) continue;
    parsed[match[1]] = clamp3(Number(match[2]), 0, 1);
  }
  return parsed;
}
function safeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function inferMeasurements(sample) {
  const estimators = sample.estimators ?? {};
  const candidateConfidence = parseCandidateSummary(
    estimators.candidateSummary ?? null
  );
  const peaksCount = Array.isArray(sample.peaks) ? sample.peaks.length : 0;
  const peakConfidence = clamp3(
    safeNumber(estimators.peakConfidence) ?? candidateConfidence.peaks ?? clamp3(peaksCount / 12, 0.05, 1),
    0,
    1
  );
  const cameraConfidence = clamp3(
    safeNumber(estimators.cameraConfidence) ?? 0,
    0,
    1
  );
  const acfConfidence = clamp3(
    safeNumber(estimators.acfConfidence) ?? candidateConfidence.acf ?? (safeNumber(estimators.acfBpm) != null ? clamp3(cameraConfidence * 0.9, 0.1, 0.75) : 0),
    0,
    1
  );
  const spectralConfidence = clamp3(
    safeNumber(estimators.spectralConfidence) ?? candidateConfidence.spectral ?? (safeNumber(estimators.spectralBpm) != null ? clamp3(cameraConfidence * 0.7, 0.08, 0.65) : 0),
    0,
    1
  );
  return [
    {
      source: "peaks",
      bpm: safeNumber(estimators.instantBpm),
      confidence: peakConfidence
    },
    {
      source: "acf",
      bpm: safeNumber(estimators.acfBpm),
      confidence: acfConfidence
    },
    {
      source: "spectral",
      bpm: safeNumber(estimators.spectralBpm),
      confidence: spectralConfidence
    }
  ];
}
function replayBayesSession(session, options) {
  const syncSamples = [...session.syncSamples].sort((a, b) => a.epochTs - b.epochTs);
  const pairEvents = [...session.pairEvents ?? []].filter(
    (event) => Number.isFinite(event.ts) && Number.isFinite(event.referenceBpm)
  ).sort((a, b) => a.ts - b.ts);
  const tracker = new BpmBayesTracker(40, 180, 1);
  const points = [];
  let prevTs = 0;
  let pairIndex = 0;
  let latestReferenceBpm = null;
  for (const sample of syncSamples) {
    const measurements = inferMeasurements(sample);
    while (pairIndex < pairEvents.length && pairEvents[pairIndex].ts <= sample.epochTs) {
      latestReferenceBpm = pairEvents[pairIndex].referenceBpm;
      tracker.reinforceReference(
        latestReferenceBpm,
        measurements,
        1,
        pairEvents[pairIndex].ts
      );
      pairIndex += 1;
    }
    const dtSec = prevTs > 0 ? clamp3((sample.epochTs - prevTs) / 1e3, 0.03, 0.7) : 0.1;
    prevTs = sample.epochTs;
    const estimators = sample.estimators ?? {};
    const waveformValues = sample.museWindow?.values ?? sample.filteredWindow?.values ?? null;
    const waveformProfile = Array.isArray(waveformValues) && waveformValues.length ? computeWaveformPeriodicityProfile(
      waveformValues.filter(
        (value) => typeof value === "number" && Number.isFinite(value)
      ),
      safeNumber(sample.sampleRate) ?? 0,
      40,
      180,
      1
    ) : null;
    const replayEstimate = tracker.update(measurements, dtSec, {
      motion: clamp3(safeNumber(estimators.motion) ?? 0, 0, 1),
      snrDb: safeNumber(estimators.snrDb) ?? 0,
      quality: clamp3((sample.outputs?.signalQuality ?? 0) / 100, 0, 1),
      waveformProfile
    });
    points.push({
      ts: sample.epochTs,
      stage: sample.stage ?? "unknown",
      replayBayesBpm: replayEstimate.bpm,
      replayBayesConfidence: replayEstimate.confidence,
      recordedBayesBpm: safeNumber(estimators.bayesBpm),
      recordedBayesConfidence: safeNumber(estimators.bayesConfidence),
      recordedFinalBpm: safeNumber(estimators.finalBpm),
      referenceBpm: latestReferenceBpm
    });
  }
  const pairWindowMs = options?.pairWindowMs ?? 2e4;
  const pairSummaries = pairEvents.map((event) => {
    const windowPoints = points.filter(
      (point) => point.ts >= event.ts && point.ts <= event.ts + pairWindowMs
    );
    return {
      referenceBpm: event.referenceBpm,
      pairTs: event.ts,
      windowMs: pairWindowMs,
      points: windowPoints.length,
      recordedBayesMae: mae(
        windowPoints.map((point) => point.recordedBayesBpm),
        event.referenceBpm
      ),
      replayBayesMae: mae(
        windowPoints.map((point) => point.replayBayesBpm),
        event.referenceBpm
      ),
      recordedFinalMae: mae(
        windowPoints.map((point) => point.recordedFinalBpm),
        event.referenceBpm
      ),
      replayMeanBpm: mean(
        windowPoints.map((point) => point.replayBayesBpm).filter((value) => value != null)
      ),
      recordedMeanBpm: mean(
        windowPoints.map((point) => point.recordedBayesBpm).filter((value) => value != null)
      )
    };
  });
  return {
    schema: pairEvents.length ? "rppg-bayes-replay/v1" : "rppg-bayes-replay/no-pairs",
    points,
    pairSummaries
  };
}

// demo/replay.ts
function getEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el;
}
var jsonInput = getEl("json-input");
var fileInput = getEl("file-input");
var loadFileBtn = getEl("load-file-btn");
var runBtn = getEl("run-btn");
var sampleBtn = getEl("sample-btn");
var copyBtn = getEl("copy-btn");
var statusEl = getEl("status");
var schemaBadge = getEl("schema-badge");
var pointsCountEl = getEl("points-count");
var latestBpmEl = getEl("latest-bpm");
var latestConfidenceEl = getEl("latest-confidence");
var latestMaeEl = getEl("latest-mae");
var pairSummariesEl = getEl("pair-summaries");
var pointsPreviewEl = getEl("points-preview");
var currentResult = null;
function setStatus(text, tone = "idle") {
  statusEl.textContent = text;
  statusEl.className = tone === "good" ? "text-[11px] text-emerald-300" : tone === "bad" ? "text-[11px] text-rose-300" : "text-[11px] text-slate-400";
}
function formatJson(value) {
  return JSON.stringify(value, null, 2);
}
function isReplayResult(value) {
  if (!value || typeof value !== "object") return false;
  const raw = value;
  return typeof raw.schema === "string" && Array.isArray(raw.points) && Array.isArray(raw.pairSummaries);
}
function isReplaySession(value) {
  if (!value || typeof value !== "object") return false;
  const raw = value;
  return Array.isArray(raw.syncSamples);
}
function renderResult(result) {
  currentResult = result;
  const latestPoint = result.points[result.points.length - 1] ?? null;
  const latestSummary = result.pairSummaries[result.pairSummaries.length - 1] ?? null;
  schemaBadge.textContent = result.schema;
  pointsCountEl.textContent = String(result.points.length);
  latestBpmEl.textContent = latestPoint?.replayBayesBpm != null ? latestPoint.replayBayesBpm.toFixed(2) : "--";
  latestConfidenceEl.textContent = latestPoint != null ? latestPoint.replayBayesConfidence.toFixed(3) : "--";
  latestMaeEl.textContent = latestSummary?.replayBayesMae != null ? latestSummary.replayBayesMae.toFixed(3) : "--";
  pairSummariesEl.textContent = result.pairSummaries.length ? formatJson(result.pairSummaries) : "No pair summaries in this replay.";
  pointsPreviewEl.textContent = result.points.length ? formatJson(result.points.slice(-8)) : "No points in this replay.";
}
function loadSample() {
  const sample = {
    syncSamples: [
      {
        epochTs: 1e3,
        sampleRate: 30,
        stage: "tracked",
        filteredWindow: {
          values: new Array(180).fill(0).map((_, i) => {
            const t = i / 30;
            return Math.sin(2 * Math.PI * 1.2 * t) + 0.2 * Math.sin(2 * Math.PI * 2.4 * t);
          })
        },
        estimators: {
          instantBpm: 72,
          peakConfidence: 0.72,
          acfBpm: 71,
          acfConfidence: 0.8,
          spectralBpm: 72,
          spectralConfidence: 0.91,
          cameraConfidence: 0.88,
          snrDb: 8,
          motion: 0.03,
          bayesBpm: 72,
          bayesConfidence: 0.9,
          finalBpm: 72
        },
        outputs: {
          signalQuality: 84
        }
      },
      {
        epochTs: 1600,
        sampleRate: 30,
        stage: "tracked",
        filteredWindow: {
          values: new Array(180).fill(0).map((_, i) => {
            const t = i / 30;
            return Math.sin(2 * Math.PI * 1.2 * t) + 0.2 * Math.sin(2 * Math.PI * 2.4 * t);
          })
        },
        estimators: {
          instantBpm: 71,
          peakConfidence: 0.68,
          acfBpm: 72,
          acfConfidence: 0.82,
          spectralBpm: 72,
          spectralConfidence: 0.9,
          cameraConfidence: 0.89,
          snrDb: 8.2,
          motion: 0.02,
          bayesBpm: 72,
          bayesConfidence: 0.92,
          finalBpm: 72
        },
        outputs: {
          signalQuality: 86
        }
      }
    ],
    pairEvents: [{ ts: 900, referenceBpm: 72 }]
  };
  jsonInput.value = formatJson(sample);
  setStatus("Loaded sample replay session.", "idle");
}
function parseAndRender() {
  const text = jsonInput.value.trim();
  if (!text) {
    setStatus("Paste a replay payload first.", "bad");
    return;
  }
  try {
    const parsed = JSON.parse(text);
    if (isReplayResult(parsed)) {
      renderResult(parsed);
      setStatus("Rendered replay result payload.", "good");
      return;
    }
    if (isReplaySession(parsed)) {
      const result = replayBayesSession(parsed);
      renderResult(result);
      setStatus("Rendered raw replay session via replayBayesSession().", "good");
      return;
    }
    setStatus("JSON shape not recognized. Expected ReplayBayesSessionResult or ReplayDebugSession.", "bad");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Invalid JSON: ${message}`, "bad");
  }
}
loadFileBtn.addEventListener("click", () => {
  fileInput.click();
});
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    jsonInput.value = await file.text();
    setStatus(`Loaded file: ${file.name}`, "idle");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Failed to read file: ${message}`, "bad");
  }
});
runBtn.addEventListener("click", () => {
  parseAndRender();
});
sampleBtn.addEventListener("click", () => {
  loadSample();
  parseAndRender();
});
copyBtn.addEventListener("click", async () => {
  if (!currentResult) {
    setStatus("Run a replay before copying the result.", "bad");
    return;
  }
  try {
    await navigator.clipboard.writeText(formatJson(currentResult));
    setStatus("Copied replay result JSON.", "good");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Clipboard copy failed: ${message}`, "bad");
  }
});
loadSample();
parseAndRender();
