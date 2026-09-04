import {
	LOCK_HOLD_MS,
	MEASURE_HOLD_MS,
	MIN_LOCK_SAMPLES,
	TRUST_FLOOR,
	TRUST_FLOOR_MID,
	TRUST_FLOOR_MIN,
	TYPICAL_CALIBRATION_MS,
	captureProgress,
	restartDetected,
	trustFloorAt,
} from "../captureProgress";

describe("the trust floor eases without a step", () => {
	test("is continuous: no jump the reader did not cause", () => {
		// The staircase moved the floor by 0.05 twice, which multiplied the ring's
		// confidence term by 1.14 and then 1.17 at two instants. Sweep it and demand
		// that no 50ms slice moves it more than a thousandth.
		for (let t = 0; t <= 45_000; t += 50) {
			expect(Math.abs(trustFloorAt(t + 50) - trustFloorAt(t))).toBeLessThan(0.001);
		}
	});

	test("never gets stricter as the capture runs", () => {
		for (let t = 0; t <= 45_000; t += 50) {
			expect(trustFloorAt(t + 50)).toBeLessThanOrEqual(trustFloorAt(t) + 1e-12);
		}
	});

	test("keeps the exact standard the old schedule had at its own anchors", () => {
		// The point of the change is the SHAPE, not the strictness. Same value at the
		// start, same two easing points, same floor.
		expect(trustFloorAt(0)).toBe(TRUST_FLOOR);
		expect(trustFloorAt(-1)).toBe(TRUST_FLOOR);
		expect(trustFloorAt(Number.NaN)).toBe(TRUST_FLOOR);
		expect(trustFloorAt(20_000)).toBeCloseTo(TRUST_FLOOR_MID, 10);
		expect(trustFloorAt(35_000)).toBe(TRUST_FLOOR_MIN);
		expect(trustFloorAt(120_000)).toBe(TRUST_FLOOR_MIN);
	});

	test("actually moves, or the continuity check proves nothing", () => {
		expect(trustFloorAt(0) - trustFloorAt(35_000)).toBeCloseTo(0.1, 10);
	});
});

/**
 * A NOISY capture, driven past 35 seconds.
 *
 * Deliberately not a clean one. Confidence creeps and sits under the strict
 * floor, so the reading only becomes lockable once the floor has eased, which is
 * exactly where the old staircase produced its jumps.
 */
function runCapture(legacy = false): number[] {
	const out: number[] = [];
	let maxPct = 0;
	let heldMs = 0;
	let sinceLock = 0;
	let locked = false;
	for (let t = 0; t <= 40_000; t += 100) {
		// 300ms is the real pulse poll, so samples land at the cadence they do in the app.
		const samples = Math.min(MIN_LOCK_SAMPLES, Math.floor(t / 300));
		const confidence = Math.min(0.33, 0.02 + t / 90_000);
		const floor = legacy ? legacyTrustFloor(t) : trustFloorAt(t);
		const lockReady = samples >= MIN_LOCK_SAMPLES && confidence >= floor;
		if (!locked) {
			heldMs = lockReady ? heldMs + 100 : Math.max(0, heldMs - 100);
			if (heldMs >= MEASURE_HOLD_MS) locked = true;
		} else {
			sinceLock += 100;
		}
		const pct = legacy
			? legacyProgress({ confidence, trustFloor: floor, samples, lockReady, locked })
			: captureProgress({
					confidence,
					trustFloor: floor,
					samples,
					heldMs,
					locked,
					sinceLockMs: sinceLock,
				});
		maxPct = Math.max(maxPct, pct);
		out.push(maxPct);
	}
	return out;
}

/**
 * The formula this replaced, kept as a YARDSTICK.
 *
 * A "no jump larger than N points" rule needs an N, and any N picked by taste is
 * a number that will later be relaxed by taste. So the same capture is run
 * through the old arithmetic, and the threshold has to separate the two. If a
 * future change makes the new curve behave like the old one, the comparison test
 * fails and says so.
 */
function legacyTrustFloor(elapsedMs: number): number {
	if (elapsedMs > 35_000) return 0.3;
	if (elapsedMs > 20_000) return 0.35;
	return TRUST_FLOOR;
}
function legacyProgress(a: {
	confidence: number;
	trustFloor: number;
	samples: number;
	lockReady: boolean;
	locked: boolean;
}): number {
	const readiness = Math.min(
		1,
		Math.min(a.confidence / a.trustFloor, a.samples / MIN_LOCK_SAMPLES),
	);
	const raw = Math.round(readiness * 100);
	const capped = a.locked ? 100 : a.lockReady ? 99 : Math.min(raw, 95);
	return capped / 100;
}

/**
 * The biggest single-tick move, once the bar is already off zero.
 *
 * Both values stay in the 0..1 scale until the return. The first version of this
 * compared a raw delta against one already multiplied by 100, so after the first
 * tick nothing could ever beat it: it reported the worst jump in a capture that
 * genuinely leaps nine points as 1.0. A unit slip in a measuring instrument reads
 * exactly like a clean result.
 */
function worstTick(v: number[]): { points: number; atMs: number } {
	let worst = 0;
	let atMs = 0;
	for (let i = 1; i < v.length; i++) {
		if (v[i - 1] <= 0) continue;
		const step = v[i] - v[i - 1];
		if (step > worst) {
			worst = step;
			atMs = i * 100;
		}
	}
	return { points: worst * 100, atMs };
}

describe("the ring fills without jumping or stalling at a magic number", () => {
	test("never moves backwards", () => {
		const v = runCapture();
		for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1]);
	});

	test("never jumps once it is moving", () => {
		/**
		 * Measured from the moment the bar is off zero. The first movement is a step
		 * by nature (no accepted samples, then one) and it is CAUSED, which is the
		 * distinction this rule is about: the complaint was a bar moving for no reason
		 * the reader could see, not a bar starting.
		 */
		const w = worstTick(runCapture());
		expect(w.points).toBeLessThan(3);
	});

	test("and the formula it replaced DID jump, so that bar means something", () => {
		// The yardstick. Three points is not a taste: it is comfortably under what the
		// old arithmetic does to the identical capture, and comfortably above a single
		// new sample's honest contribution.
		const old = worstTick(runCapture(true));
		const now = worstTick(runCapture());
		// Measured: the old curve's worst tick is 9.0 points, at 20,100ms, which is
		// the staircase to the millisecond. The new one's is 2.2, at 600ms, which is
		// the second sample landing.
		expect(old.points).toBeGreaterThan(5);
		expect(old.atMs).toBeGreaterThan(19_000);
		expect(old.points).toBeGreaterThan(now.points * 2);
	});

	test("starts because a sample arrived, not because a clock ticked", () => {
		// The anchor for the exclusion above: the first movement must coincide with
		// the first accepted sample, so "ignore the first step" cannot hide a jump.
		const v = runCapture();
		const firstMove = v.findIndex((x) => x > 0);
		expect(firstMove).toBeGreaterThan(0);
		// Samples land every 300ms in this model; the first is at t = 300ms.
		expect(firstMove * 100).toBe(300);
	});

	test("has no 95 clamp and no 99 landing pad", () => {
		// 95 was not a place a reading was ever AT: it was a parking space invented
		// because 100 had to mean something else.
		const v = runCapture();
		expect(v.filter((x) => Math.abs(x - 0.95) < 1e-9)).toHaveLength(0);
		expect(v.filter((x) => Math.abs(x - 0.99) < 1e-9)).toHaveLength(0);
	});

	test("reaches exactly 1 on the tick the capture commits, and not before", () => {
		expect(Math.max(...runCapture())).toBe(1);
		// One tick short of the landing is not done.
		expect(
			captureProgress({
				confidence: 1,
				trustFloor: TRUST_FLOOR,
				samples: 99,
				heldMs: MEASURE_HOLD_MS,
				locked: true,
				sinceLockMs: LOCK_HOLD_MS - 100,
			}),
		).toBeLessThan(1);
	});

	test("shows the two holds rather than sitting still through them", () => {
		// 2.1 seconds of real work used to happen with the bar parked at 99.
		const beforeHold = captureProgress({
			confidence: 1,
			trustFloor: TRUST_FLOOR,
			samples: MIN_LOCK_SAMPLES,
			heldMs: 0,
			locked: false,
			sinceLockMs: 0,
		});
		const midHold = captureProgress({
			confidence: 1,
			trustFloor: TRUST_FLOOR,
			samples: MIN_LOCK_SAMPLES,
			heldMs: MEASURE_HOLD_MS / 2,
			locked: false,
			sinceLockMs: 0,
		});
		const landing = captureProgress({
			confidence: 1,
			trustFloor: TRUST_FLOOR,
			samples: MIN_LOCK_SAMPLES,
			heldMs: MEASURE_HOLD_MS,
			locked: true,
			sinceLockMs: LOCK_HOLD_MS / 2,
		});
		expect(midHold).toBeGreaterThan(beforeHold);
		expect(landing).toBeGreaterThan(midHold);
	});

	test("moves on BOTH terms at once, not on whichever is behind", () => {
		// A `min` means exactly one term is moving the bar at any moment, so the fill
		// rate visibly changes slope when the binding term swaps. With a geometric
		// mean, improving either one always shows.
		const base = {
			trustFloor: TRUST_FLOOR,
			heldMs: 0,
			locked: false,
			sinceLockMs: 0,
		};
		const start = captureProgress({ ...base, confidence: 0.2, samples: 9 });
		const moreConfidence = captureProgress({ ...base, confidence: 0.3, samples: 9 });
		const moreSamples = captureProgress({ ...base, confidence: 0.2, samples: 14 });
		expect(moreConfidence).toBeGreaterThan(start);
		expect(moreSamples).toBeGreaterThan(start);
	});

	test("cannot claim done on one term alone", () => {
		const base = { trustFloor: TRUST_FLOOR, heldMs: 0, locked: false, sinceLockMs: 0 };
		expect(captureProgress({ ...base, confidence: 9, samples: 0 })).toBe(0);
		expect(captureProgress({ ...base, confidence: 0, samples: 999 })).toBe(0);
	});

	test("survives nonsense inputs instead of painting NaN", () => {
		const bad = captureProgress({
			confidence: Number.NaN,
			trustFloor: 0,
			samples: -5,
			heldMs: Number.NaN,
			locked: false,
			sinceLockMs: Number.NaN,
		});
		expect(Number.isFinite(bad)).toBe(true);
		expect(bad).toBe(0);
	});

	test("is not vacuous: this capture really does cross both old boundaries", () => {
		const v = runCapture();
		expect(v[0]).toBeLessThan(0.05);
		expect(v[v.length - 1]).toBe(1);
	});

	test("budgets the time the screen promises", () => {
		expect(TYPICAL_CALIBRATION_MS).toBe(10_000);
	});
});

describe("the calibrator restarting is noticed", () => {
	test("sees the sample count collapse", () => {
		// The SDK empties its buffer after ten rejects in a row before sample 18.
		expect(restartDetected(0, 12)).toBe(true);
		expect(restartDetected(11, 12)).toBe(true);
	});

	test("does not cry restart on ordinary progress", () => {
		expect(restartDetected(12, 12)).toBe(false);
		expect(restartDetected(13, 12)).toBe(false);
		expect(restartDetected(0, 0)).toBe(false);
	});
});
