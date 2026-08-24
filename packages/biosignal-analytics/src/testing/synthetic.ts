/**
 * Deterministic synthetic signal generators for tests and demos (mulberry32,
 * matching the biosignal-session testing convention).
 */

/** Deterministic 32-bit PRNG (mulberry32); returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface SyntheticEegOptions {
	seed?: number;
	sampleRateHz?: number;
	durationS?: number;
	channelCount?: number;
	/** Alpha tone frequency/amplitude (µV). */
	alphaHz?: number;
	alphaAmplitudeUv?: number;
	noiseAmplitudeUv?: number;
	/** Optional mains contamination amplitude (µV) at 60 Hz. */
	mainsAmplitudeUv?: number;
}

/** Interleaved synthetic EEG: alpha tone + seeded noise (+ optional mains). */
export function syntheticEegInterleaved(opts: SyntheticEegOptions = {}): {
	samples: Float32Array;
	sampleRateHz: number;
	channels: string[];
} {
	const sampleRateHz = opts.sampleRateHz ?? 256;
	const durationS = opts.durationS ?? 40;
	const channelCount = opts.channelCount ?? 2;
	const alphaHz = opts.alphaHz ?? 10;
	const alphaAmplitude = opts.alphaAmplitudeUv ?? 20;
	const noiseAmplitude = opts.noiseAmplitudeUv ?? 2;
	const mainsAmplitude = opts.mainsAmplitudeUv ?? 0;
	const random = mulberry32(opts.seed ?? 1);

	const frames = Math.round(sampleRateHz * durationS);
	const samples = new Float32Array(frames * channelCount);
	for (let frame = 0; frame < frames; frame++) {
		const t = frame / sampleRateHz;
		for (let channel = 0; channel < channelCount; channel++) {
			const tone = alphaAmplitude * Math.sin(2 * Math.PI * alphaHz * t);
			const mains = mainsAmplitude * Math.sin(2 * Math.PI * 60 * t);
			const noise = noiseAmplitude * (random() * 2 - 1);
			samples[frame * channelCount + channel] = tone + mains + noise;
		}
	}
	return {
		samples,
		sampleRateHz,
		channels: Array.from({ length: channelCount }, (_, index) => `ch${index}`),
	};
}

export interface SyntheticIbiOptions {
	seed?: number;
	count?: number;
	meanMs?: number;
	sdMs?: number;
	/** Indexes replaced by ectopic short+compensatory-long pairs. */
	ectopicAt?: readonly number[];
}

/** Seeded gaussian-ish IBI series (Box-Muller over mulberry32). */
export function syntheticIbisMs(opts: SyntheticIbiOptions = {}): number[] {
	const count = opts.count ?? 180;
	const meanMs = opts.meanMs ?? 800;
	const sdMs = opts.sdMs ?? 40;
	const random = mulberry32(opts.seed ?? 2);
	const ibis: number[] = [];
	for (let i = 0; i < count; i++) {
		const u1 = Math.max(random(), 1e-12);
		const u2 = random();
		const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
		ibis.push(Math.min(1100, Math.max(600, meanMs + sdMs * gaussian)));
	}
	for (const index of opts.ectopicAt ?? []) {
		if (index >= 0 && index + 1 < ibis.length) {
			ibis[index] = 400;
			ibis[index + 1] = 1250;
		}
	}
	return ibis;
}
