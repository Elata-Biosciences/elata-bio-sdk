import { resolveDisplayMetrics } from "../displayMetrics";
import type { Metrics } from "../rppgProcessor";
import type { RppgAppSnapshot } from "../rppgAppAdapter";

type Fixture = Pick<RppgAppSnapshot, "canPublish" | "publishBpm" | "metrics">;

function metrics(overrides: Partial<Metrics> = {}): Metrics {
	return { confidence: 0.6, signal_quality: 0.6, ...overrides };
}

function fixture(overrides: Partial<Fixture> = {}): Fixture {
	return {
		canPublish: true,
		publishBpm: 72,
		metrics: metrics(),
		...overrides,
	};
}

describe("resolveDisplayMetrics", () => {
	test("publishable snapshot with high confidence surfaces bpm", () => {
		const result = resolveDisplayMetrics(fixture({ metrics: metrics({ confidence: 0.6 }) }));
		expect(result).toEqual({
			bpm: 72,
			hrvRmssd: null,
			confidence: "high",
			publishable: true,
		});
	});

	test("hrvRmssd is always null: canPublish alone is a BPM-oriented gate, not an HRV one", () => {
		// The gap a reviewer caught: HRV's beat-to-beat timing is far more
		// fragile than BPM's average rate, so a sample can clear canPublish and
		// still carry a garbage HRV figure. There is no HRV-specific quality
		// gate here yet (see elata-bio-sdk#28's trustedHrvSample), so this stays
		// null rather than silently reintroducing the class of bug this whole
		// function exists to prevent, just for a different field.
		const result = resolveDisplayMetrics(
			fixture({ canPublish: true, publishBpm: 72, metrics: metrics({ hrv_rmssd: 42 }) }),
		);
		expect(result.publishable).toBe(true);
		expect(result.bpm).toBe(72);
		expect(result.hrvRmssd).toBeNull();
	});

	test("canPublish false nulls bpm/hrv even when publishBpm is a number", () => {
		// The exact shape that caused neural-chat-app#10: the SDK has already
		// decided this reading isn't trustworthy (canPublish false), but a stale
		// publishBpm value could still be lying around on the snapshot.
		const result = resolveDisplayMetrics(
			fixture({ canPublish: false, publishBpm: 72, metrics: metrics({ hrv_rmssd: 42 }) }),
		);
		expect(result.bpm).toBeNull();
		expect(result.hrvRmssd).toBeNull();
		expect(result.publishable).toBe(false);
	});

	test("publishBpm null (even if canPublish were somehow true) nulls the display value", () => {
		const result = resolveDisplayMetrics(fixture({ publishBpm: null }));
		expect(result.bpm).toBeNull();
		expect(result.publishable).toBe(false);
	});

	test("confidence buckets at the default 0.35 threshold", () => {
		expect(
			resolveDisplayMetrics(fixture({ metrics: metrics({ confidence: 0.34 }) })).confidence,
		).toBe("low");
		expect(
			resolveDisplayMetrics(fixture({ metrics: metrics({ confidence: 0.35 }) })).confidence,
		).toBe("high");
	});

	test("confidenceThreshold option overrides the default", () => {
		const result = resolveDisplayMetrics(fixture({ metrics: metrics({ confidence: 0.5 }) }), {
			confidenceThreshold: 0.6,
		});
		expect(result.confidence).toBe("low");
	});

	test("has no state to hold a value past the snapshot that nulled it — two calls in a row reflect each snapshot independently", () => {
		// This is the property that makes the neural-chat-app bug structurally
		// impossible here: there is no accumulator to carry a prior good value
		// forward once canPublish goes false.
		const live = resolveDisplayMetrics(fixture({ canPublish: true, publishBpm: 88 }));
		const droppedOut = resolveDisplayMetrics(fixture({ canPublish: false, publishBpm: null }));
		expect(live.bpm).toBe(88);
		expect(droppedOut.bpm).toBeNull();
	});

});
