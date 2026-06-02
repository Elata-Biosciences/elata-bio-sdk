import { DisplayBpmTracker } from "../displayBpm";

describe("DisplayBpmTracker", () => {
	test("converges to and reports a steady rate", () => {
		const tracker = new DisplayBpmTracker();
		let last = tracker.update(72);
		for (let i = 0; i < 30; i++) last = tracker.update(72);
		expect(last.status).toBe("tracking");
		expect(last.displayBpm).toBe(72);
		expect(tracker.displayBpm).toBe(72);
		expect(tracker.smoothedBpm).toBe(72);
	});

	test("ignores out-of-range candidates without changing the display", () => {
		const tracker = new DisplayBpmTracker();
		tracker.update(70);
		const low = tracker.update(20);
		expect(low.status).toBe("out_of_range");
		expect(low.displayBpm).toBe(70);
		const high = tracker.update(200);
		expect(high.status).toBe("out_of_range");
		expect(high.displayBpm).toBe(70);
	});

	test("rejects an isolated large jump and holds the display", () => {
		const tracker = new DisplayBpmTracker();
		tracker.update(60);
		const jump = tracker.update(110);
		expect(jump.status).toBe("jump_rejected");
		expect(jump.displayBpm).toBe(60);
	});

	test("adopts a sustained distant rate after the catch-up window", () => {
		const tracker = new DisplayBpmTracker({ catchupFrames: 8 });
		tracker.update(60); // single seed at 60
		const statuses: string[] = [];
		let final = tracker.update(110);
		statuses.push(final.status);
		for (let i = 0; i < 7; i++) {
			final = tracker.update(110);
			statuses.push(final.status);
		}
		// First seven are rejected, the eighth is adopted.
		expect(statuses.slice(0, 7)).toEqual(Array(7).fill("jump_rejected"));
		expect(statuses[7]).toBe("jump_adopted");
		expect(final.displayBpm).toBe(110);
	});

	test("adopts immediately when a reference lock allows the jump", () => {
		const tracker = new DisplayBpmTracker();
		tracker.update(60);
		const jump = tracker.update(110, {
			hasReferenceLock: true,
			bpmJumpCounter: 3,
		});
		expect(jump.status).toBe("jump_adopted");
		expect(jump.displayBpm).toBe(110);
	});

	test("hold prefers a plausible tracker estimate, else the last value", () => {
		const tracker = new DisplayBpmTracker();
		tracker.update(75);
		expect(tracker.hold({ trackerBpm: 90 })).toBe(90);
		expect(tracker.hold({})).toBe(90); // holds the last shown value
		expect(tracker.hold({ trackerBpm: 999 })).toBe(90); // implausible -> ignored
	});

	test("reset clears all state", () => {
		const tracker = new DisplayBpmTracker();
		for (let i = 0; i < 10; i++) tracker.update(80);
		tracker.reset();
		expect(tracker.displayBpm).toBeNull();
		expect(tracker.smoothedBpm).toBeNull();
		const first = tracker.update(95);
		expect(first.displayBpm).toBe(95);
	});
});
