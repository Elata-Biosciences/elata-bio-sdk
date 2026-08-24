import {
	captureClockAnchor,
	createSessionClock,
	samplePeriodUs,
	sampleTimeUs,
	toSessionUs,
} from "../contracts/time";
import { createFakeClock } from "../testing/fakeClock";

describe("session clock", () => {
	it("captures a linked anchor pair and measures µs from it", () => {
		const clock = createFakeClock(1_700_000_000_000);
		const anchor = captureClockAnchor(clock.utcNow, clock.monotonicNow);
		expect(anchor.startedAtUtcMs).toBe(1_700_000_000_000);
		const session = createSessionClock(anchor, clock.monotonicNow);
		expect(session.nowUs()).toBe(0);
		clock.advance(1.5);
		expect(session.nowUs()).toBe(1500);
		clock.advance(0.0004);
		// Rounds to integer µs.
		expect(Number.isInteger(session.nowUs())).toBe(true);
	});

	it("wall-clock steps do not move session time", () => {
		const clock = createFakeClock();
		const anchor = captureClockAnchor(clock.utcNow, clock.monotonicNow);
		const session = createSessionClock(anchor, clock.monotonicNow);
		clock.stepUtc(60_000);
		expect(session.nowUs()).toBe(0);
	});

	it("toSessionUs rounds to the nearest microsecond", () => {
		const anchor = { startedAtUtcMs: 0, startedAtMonotonicMs: 100 };
		expect(toSessionUs(100.0004, anchor)).toBe(0);
		expect(toSessionUs(100.0006, anchor)).toBe(1);
		expect(toSessionUs(99, anchor)).toBe(-1000);
	});
});

describe("regular-stream sample timing", () => {
	it("derives per-sample time from the counter and rate", () => {
		expect(sampleTimeUs(0, 0, 256)).toBe(0);
		expect(sampleTimeUs(0, 1, 256)).toBe(3906);
		expect(sampleTimeUs(0, 256, 256)).toBe(1_000_000);
		expect(sampleTimeUs(500, 2, 1000)).toBe(2500);
	});

	it("computes integer sample periods", () => {
		expect(samplePeriodUs(256)).toBe(3906);
		expect(samplePeriodUs(52)).toBe(19231);
		expect(samplePeriodUs(1)).toBe(1_000_000);
	});
});
