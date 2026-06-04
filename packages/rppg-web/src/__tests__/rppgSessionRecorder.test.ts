import { RppgSessionRecorder } from "../rppgSessionRecorder";
import { summarizeReplaySession } from "../replayBenchmark";
import type { Metrics } from "../rppgProcessor";

function metrics(over: Partial<Metrics> = {}): Metrics {
	return {
		bpm: 62,
		confidence: 0.8,
		signal_quality: 0.7,
		peaks_bpm: 62,
		acf_bpm: 63,
		spectral_bpm: 84,
		bayes_bpm: 62,
		bayes_confidence: 0.75,
		snr: 6,
		motion_mean: 0.1,
		winning_sources: ["peaks", "acf"],
		...over,
	};
}

describe("RppgSessionRecorder", () => {
	test("maps metrics into a replayable sync sample", () => {
		const rec = new RppgSessionRecorder();
		rec.recordMetrics(metrics(), { timestampMs: 1000, sampleRate: 30 });

		const session = rec.toSession();
		expect(session.syncSamples).toHaveLength(1);
		const e = session.syncSamples[0].estimators!;
		expect(e.finalBpm).toBe(62);
		expect(e.acfBpm).toBe(63);
		expect(e.spectralBpm).toBe(84);
		expect(e.suppressed).toBe(false);
		expect(e.bpmSource).toBe("peaks|acf");
		expect(session.syncSamples[0].outputs?.signalQuality).toBe(70);
	});

	test("flags suppressed when no final BPM is available", () => {
		const rec = new RppgSessionRecorder();
		rec.recordMetrics(metrics({ bpm: null }), { timestampMs: 1000 });
		expect(rec.toSession().syncSamples[0].estimators?.suppressed).toBe(true);
	});

	test("records reference BPM as pair events and stamps activeReferenceBpm", () => {
		const rec = new RppgSessionRecorder();
		rec.recordReference(72, 500);
		rec.recordMetrics(metrics(), { timestampMs: 1000 });

		const session = rec.toSession();
		expect(session.pairEvents).toEqual([{ ts: 500, referenceBpm: 72 }]);
		expect(session.syncSamples[0].estimators?.activeReferenceBpm).toBe(72);
		expect(rec.pairCount).toBe(1);
		// Non-finite references are ignored.
		rec.recordReference(Number.NaN, 600);
		expect(rec.pairCount).toBe(1);
	});

	test("omits waveform arrays by default, includes them when asked", () => {
		const ctx = { timestampMs: 1, filteredWindow: [1, 2, 3] };
		const off = new RppgSessionRecorder();
		off.recordMetrics(metrics(), ctx);
		expect(off.toSession().syncSamples[0].filteredWindow).toBeUndefined();

		const on = new RppgSessionRecorder({ includeWaveform: true });
		on.recordMetrics(metrics(), ctx);
		expect(on.toSession().syncSamples[0].filteredWindow?.values).toEqual([1, 2, 3]);
	});

	test("ring buffer caps retained samples", () => {
		const rec = new RppgSessionRecorder({ maxSamples: 2 });
		for (let i = 0; i < 5; i++) rec.recordMetrics(metrics(), { timestampMs: i });
		expect(rec.sampleCount).toBe(2);
	});

	test("round-trips through the replay benchmark", () => {
		const rec = new RppgSessionRecorder();
		for (let i = 0; i < 10; i++) {
			rec.recordMetrics(metrics({ bpm: 60 + i }), { timestampMs: 1000 + i * 100 });
		}
		// A recording must be consumable by the same comparison harness.
		const summary = summarizeReplaySession(rec.toSession());
		expect(summary.syncSampleCount).toBe(10);
		expect(summary.cleanPointCount).toBe(10); // all trusted, none locked
	});
});
