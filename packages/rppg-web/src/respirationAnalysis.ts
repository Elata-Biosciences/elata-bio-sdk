/**
 * Camera respiration estimation from a single rPPG trace.
 *
 * Breathing modulates the pulse three independent ways, each recoverable from a
 * one-channel camera signal:
 *
 *  - **RIIV** (respiratory-induced *intensity* variation): a low-frequency
 *    baseline wander at the breathing rate. Strong at rest, easily corrupted by
 *    motion/lighting drift.
 *  - **RIAV** (respiratory-induced *amplitude* variation): the breath modulates
 *    pulse *amplitude*, recovered from the cardiac-band envelope. Robust when the
 *    baseline is corrupted.
 *  - **RSA** (respiratory sinus arrhythmia): the breath modulates beat-to-beat
 *    timing, recovered from the inter-beat-interval tachogram. Independent of the
 *    waveform amplitude/baseline entirely.
 *
 * On a clean, still signal all three are resolution-limited and essentially
 * equivalent, so the single-cue legacy estimate was fine. The cues diverge under
 * motion/artifacts: whichever cue a given artifact corrupts, the other two
 * usually survive. This module computes all three and fuses them with a
 * transparent agreement rule — when >=2 cues agree it returns their
 * confidence-weighted mean (and reports higher confidence); otherwise it falls
 * back to the single strongest cue only if it clears a prominence floor, and
 * abstains (null) when nothing is trustworthy.
 *
 * This is standard signal processing (band-limited periodograms over three
 * documented respiration cues + an agreement vote). It deliberately does NOT
 * implement a learned/adaptive fusion model.
 */

import { zeroPhaseBandpass } from "./rppgSignalModel";

export type RespSource = "riiv" | "riav" | "rsa";

export interface RespCueEstimate {
	source: RespSource;
	brpm: number;
	/** In-band spectral prominence of the dominant peak, 0..1. */
	confidence: number;
}

export interface RespirationEstimate {
	/** Fused respiration rate in breaths per minute. */
	brpm: number;
	/** Fused confidence, 0..1. Boosted when multiple cues agree. */
	confidence: number;
	/** Which cues backed the returned value. */
	sources: RespSource[];
	/** True when >=2 independent cues agreed within tolerance. */
	agreement: boolean;
}

export interface RespirationInput {
	/** Conditioned, mean-removed rPPG trace (e.g. temporalNormalize output). */
	signal: number[];
	/** Sample rate of `signal` (Hz). */
	sampleRate: number;
	/** Inter-beat intervals (ms) for the RSA cue. Optional. */
	ibisMs?: number[] | null;
	/** Beat instants (ms) aligned to `ibisMs` for the RSA cue. Optional. */
	beatTimesMs?: number[] | null;
}

// Respiratory search band: 0.1–0.6 Hz = 6–36 brpm.
const RESP_MIN_HZ = 0.1;
const RESP_MAX_HZ = 0.6;
// Physiological acceptance gate for the fused output (resting → active).
const RESP_MIN_BRPM = 6;
const RESP_MAX_BRPM = 34;
// A cue weaker than this is ignored entirely (noise floor).
const CUE_NOISE_FLOOR = 0.06;
// A lone cue must clear this prominence to be trusted without corroboration.
const SINGLE_CUE_FLOOR = 0.18;
// Two cues "agree" within max(abs, rel) of each other.
const AGREE_ABS_BRPM = 2.5;
const AGREE_REL = 0.18;
// RSA needs a reasonable span/beat count to be meaningful.
const RSA_MIN_BEATS = 8;
const RSA_MIN_SPAN_SEC = 12;
const RSA_RESAMPLE_HZ = 4;

const clamp = (v: number, lo: number, hi: number): number =>
	Math.min(hi, Math.max(lo, v));

/**
 * Find the dominant frequency in [minHz, maxHz] via a Hann-windowed Goertzel
 * scan, returning the peak rate (brpm) and an in-band prominence in 0..1
 * (peak magnitude relative to the band mean). Returns null when the input is
 * too short or has no energy.
 */
export function dominantInBand(
	values: number[],
	sampleRate: number,
	minHz: number = RESP_MIN_HZ,
	maxHz: number = RESP_MAX_HZ,
): { brpm: number; confidence: number } | null {
	const n = values.length;
	if (n < 30 || sampleRate <= 0) return null;
	// Linear detrend: remove the least-squares line so a DC offset, slow baseline
	// drift, or a filter startup transient can't masquerade as a low-frequency
	// respiration peak pinned to the bottom of the band.
	const meanX = (n - 1) / 2;
	let meanY = 0;
	for (let i = 0; i < n; i++) meanY += values[i];
	meanY /= n;
	let sxy = 0;
	let sxx = 0;
	for (let i = 0; i < n; i++) {
		const dx = i - meanX;
		sxy += dx * (values[i] - meanY);
		sxx += dx * dx;
	}
	const slope = sxx > 0 ? sxy / sxx : 0;
	const centered = values.map((v, i) => v - (meanY + slope * (i - meanX)));

	const magAt = (hz: number): number => {
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

	const stepHz = 0.01;
	let bestHz = 0;
	let bestMag = 0;
	let magSum = 0;
	let bins = 0;
	for (let hz = minHz; hz <= maxHz + 1e-9; hz += stepHz) {
		const mag = magAt(hz);
		magSum += mag;
		bins += 1;
		if (mag > bestMag) {
			bestMag = mag;
			bestHz = hz;
		}
	}
	if (!(bestMag > 0) || bins === 0 || !Number.isFinite(bestHz)) return null;

	const meanMag = magSum / bins;
	// Prominence: how far the peak rises above the band's average bin. A clean
	// single tone → near 1; flat/noisy band → near 0.
	const confidence = clamp((bestMag - meanMag) / (bestMag + 1e-12), 0, 1);
	return { brpm: bestHz * 60, confidence };
}

/**
 * Cardiac-band amplitude envelope (the RIAV carrier): isolate the pulse, rectify,
 * and smooth with a ~1 s moving average. The envelope rises and falls at the
 * breathing rate when respiration modulates pulse amplitude.
 */
export function amplitudeEnvelope(
	signal: number[],
	sampleRate: number,
): number[] {
	if (signal.length === 0 || sampleRate <= 0) return [];
	const pulse = zeroPhaseBandpass(signal, sampleRate, 0.7, 3.5);
	const rect = pulse.map((v) => Math.abs(v));
	// Centered moving average over ~1 s via a prefix sum.
	const win = Math.max(3, Math.round(sampleRate));
	const half = Math.floor(win / 2);
	const prefix = new Array<number>(rect.length + 1).fill(0);
	for (let i = 0; i < rect.length; i++) prefix[i + 1] = prefix[i] + rect[i];
	const env = new Array<number>(rect.length);
	for (let i = 0; i < rect.length; i++) {
		const lo = Math.max(0, i - half);
		const hi = Math.min(rect.length - 1, i + half);
		env[i] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
	}
	return env;
}

/**
 * Resample an inter-beat-interval tachogram onto a uniform grid so its
 * respiratory (RSA) oscillation can be read by a periodogram. Returns null when
 * there are too few beats or too short a span to trust.
 */
export function resampleTachogram(
	ibisMs: number[],
	beatTimesMs: number[],
	resampleHz: number = RSA_RESAMPLE_HZ,
): number[] | null {
	if (
		ibisMs.length < RSA_MIN_BEATS - 1 ||
		beatTimesMs.length < RSA_MIN_BEATS ||
		resampleHz <= 0
	) {
		return null;
	}
	// Associate each interval with the time of the beat that closes it.
	const pts: Array<{ t: number; y: number }> = [];
	for (let i = 0; i < ibisMs.length && i + 1 < beatTimesMs.length; i++) {
		const t = beatTimesMs[i + 1] / 1000;
		const y = ibisMs[i];
		if (Number.isFinite(t) && Number.isFinite(y) && y > 0) pts.push({ t, y });
	}
	if (pts.length < RSA_MIN_BEATS - 1) return null;
	const span = pts[pts.length - 1].t - pts[0].t;
	if (span < RSA_MIN_SPAN_SEC) return null;

	const dt = 1 / resampleHz;
	const out: number[] = [];
	let j = 0;
	for (let t = pts[0].t; t <= pts[pts.length - 1].t + 1e-9; t += dt) {
		while (j < pts.length - 2 && pts[j + 1].t < t) j += 1;
		const a = pts[j];
		const b = pts[Math.min(pts.length - 1, j + 1)];
		const denom = b.t - a.t;
		const frac = denom > 1e-9 ? clamp((t - a.t) / denom, 0, 1) : 0;
		out.push(a.y + frac * (b.y - a.y));
	}
	return out.length >= 30 ? out : null;
}

function cuesAgree(a: number, b: number): boolean {
	const tol = Math.max(AGREE_ABS_BRPM, AGREE_REL * Math.min(a, b));
	return Math.abs(a - b) <= tol;
}

/**
 * Estimate respiration rate by fusing the RIIV, RIAV, and RSA cues.
 *
 * - >=2 cues agreeing → confidence-weighted mean, confidence boosted.
 * - otherwise the single strongest cue, but only if it clears SINGLE_CUE_FLOOR.
 * - nothing trustworthy → null (abstain).
 */
export function estimateRespiration(
	input: RespirationInput,
): RespirationEstimate | null {
	const { signal, sampleRate } = input;
	if (!signal || signal.length < 30 || sampleRate < 1) return null;

	// Mean-remove defensively so a constant/offset trace doesn't feed a DC step
	// into the bandpasses below (production input is already zero-mean).
	const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
	const centeredSignal = signal.map((v) => v - mean);

	const cues: RespCueEstimate[] = [];

	// RIIV — low-frequency baseline wander. Low-pass first so the cardiac band
	// can't bleed sidelobes into the prominence estimate.
	const baseline = zeroPhaseBandpass(
		centeredSignal,
		sampleRate,
		0.05,
		RESP_MAX_HZ,
	);
	const riiv = dominantInBand(baseline, sampleRate);
	if (riiv && riiv.confidence > CUE_NOISE_FLOOR) {
		cues.push({ source: "riiv", brpm: riiv.brpm, confidence: riiv.confidence });
	}

	// RIAV — cardiac-band amplitude envelope.
	const env = amplitudeEnvelope(centeredSignal, sampleRate);
	const riav = dominantInBand(env, sampleRate);
	if (riav && riav.confidence > CUE_NOISE_FLOOR) {
		cues.push({ source: "riav", brpm: riav.brpm, confidence: riav.confidence });
	}

	// RSA — inter-beat-interval tachogram.
	if (input.ibisMs && input.beatTimesMs) {
		const tach = resampleTachogram(input.ibisMs, input.beatTimesMs);
		if (tach) {
			const rsa = dominantInBand(tach, RSA_RESAMPLE_HZ);
			if (rsa && rsa.confidence > CUE_NOISE_FLOOR) {
				cues.push({
					source: "rsa",
					brpm: rsa.brpm,
					confidence: rsa.confidence,
				});
			}
		}
	}

	const inBand = cues.filter(
		(c) => c.brpm >= RESP_MIN_BRPM && c.brpm <= RESP_MAX_BRPM,
	);
	if (inBand.length === 0) return null;

	// Find the largest agreeing cluster, anchored on each cue in turn.
	let best: { members: RespCueEstimate[] } | null = null;
	for (const anchor of inBand) {
		const members = inBand.filter((c) => cuesAgree(anchor.brpm, c.brpm));
		if (!best || members.length > best.members.length) best = { members };
	}

	if (best && best.members.length >= 2) {
		let wSum = 0;
		let vSum = 0;
		let confSum = 0;
		for (const m of best.members) {
			wSum += m.confidence;
			vSum += m.confidence * m.brpm;
			confSum += m.confidence;
		}
		const brpm = wSum > 0 ? vSum / wSum : best.members[0].brpm;
		const meanConf = confSum / best.members.length;
		// Agreement across independent cues is strong evidence — boost, capped.
		const confidence = clamp(
			meanConf * (1 + 0.3 * (best.members.length - 1)),
			0,
			1,
		);
		return {
			brpm,
			confidence,
			sources: best.members.map((m) => m.source),
			agreement: true,
		};
	}

	// No agreement — trust the single strongest cue only if it's prominent.
	const strongest = inBand.reduce((a, b) =>
		b.confidence > a.confidence ? b : a,
	);
	if (strongest.confidence >= SINGLE_CUE_FLOOR) {
		return {
			brpm: strongest.brpm,
			// Penalize an uncorroborated estimate.
			confidence: clamp(strongest.confidence * 0.85, 0, 1),
			sources: [strongest.source],
			agreement: false,
		};
	}

	return null;
}
