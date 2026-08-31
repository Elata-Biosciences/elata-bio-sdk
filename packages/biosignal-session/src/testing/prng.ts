/** Deterministic seeded PRNG (mulberry32) for synthetic fixtures. */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Gaussian sample via Box–Muller over a uniform PRNG. */
export function gaussian(random: () => number): () => number {
	let spare: number | null = null;
	return () => {
		if (spare !== null) {
			const value = spare;
			spare = null;
			return value;
		}
		let u = 0;
		let v = 0;
		while (u === 0) u = random();
		while (v === 0) v = random();
		const magnitude = Math.sqrt(-2.0 * Math.log(u));
		spare = magnitude * Math.sin(2.0 * Math.PI * v);
		return magnitude * Math.cos(2.0 * Math.PI * v);
	};
}
