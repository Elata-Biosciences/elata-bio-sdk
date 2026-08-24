/**
 * A linked, controllable `performance.now`/`Date.now` pair for deterministic
 * time-model and endurance tests (fast-clock simulation: advance virtual
 * hours in milliseconds of real test time).
 */
export interface FakeClock {
	/** Monotonic milliseconds — inject as `performance.now`. */
	monotonicNow(): number;
	/** Wall milliseconds — inject as `Date.now`. */
	utcNow(): number;
	/** Advance both clocks. */
	advance(ms: number): void;
	/** Step only the wall clock (simulates NTP adjustment). */
	stepUtc(ms: number): void;
	/** Step only the monotonic clock backwards/forwards (anomaly injection). */
	stepMonotonic(ms: number): void;
}

export function createFakeClock(startUtcMs = 1_700_000_000_000): FakeClock {
	let monotonic = 10_000;
	let utc = startUtcMs;
	return {
		monotonicNow: () => monotonic,
		utcNow: () => utc,
		advance(ms: number) {
			monotonic += ms;
			utc += ms;
		},
		stepUtc(ms: number) {
			utc += ms;
		},
		stepMonotonic(ms: number) {
			monotonic += ms;
		},
	};
}
