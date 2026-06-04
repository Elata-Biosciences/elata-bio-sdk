import {
	aggregateComparisons,
	maeOf,
	summarizeReplaySession,
} from "../replayBenchmark";
import type { ReplayDebugSession, ReplaySyncSample } from "../rppgReplay";

function sample(
	epochTs: number,
	estimators: ReplaySyncSample["estimators"],
): ReplaySyncSample {
	return { epochTs, stage: "final", estimators };
}

/** A session with recorded estimator outputs but no reference pairings. */
function noReferenceSession(): ReplayDebugSession {
	return {
		syncSamples: [
			sample(1000, { bayesBpm: 60, finalBpm: 61, instantBpm: 59 }),
			sample(2000, { bayesBpm: 62, finalBpm: 63, instantBpm: 61 }),
			sample(3000, { bayesBpm: 64, finalBpm: 65, instantBpm: 63 }),
		],
	};
}

describe("summarizeReplaySession", () => {
	test("computes agreement on a session without reference pairs", () => {
		const summary = summarizeReplaySession(noReferenceSession());

		expect(summary.syncSampleCount).toBe(3);
		expect(summary.pairCount).toBe(0);
		// Agreement is defined even with no reference, so it covers every session.
		expect(summary.agreementBayes.count).toBeGreaterThan(0);
		expect(maeOf(summary.agreementBayes)).not.toBeNull();
		// No pairs -> no reference MAE.
		expect(maeOf(summary.referenceReplayBayes)).toBeNull();
		expect(maeOf(summary.referenceRecordedBayes)).toBeNull();
	});

	test("maeOf returns null for an empty accumulator", () => {
		expect(maeOf({ sumAbs: 0, count: 0 })).toBeNull();
		expect(maeOf({ sumAbs: 6, count: 3 })).toBe(2);
	});

	test("clean agreement excludes suppressed and manually-locked samples", () => {
		const session: ReplayDebugSession = {
			syncSamples: [
				// Trusted, automatic -> counts toward clean.
				sample(1000, { bayesBpm: 60, finalBpm: 60, instantBpm: 60, bpmSource: "bayes" }),
				sample(2000, { bayesBpm: 62, finalBpm: 62, instantBpm: 62, bpmSource: "bayes" }),
				// Suppressed -> finalBpm null -> excluded.
				sample(3000, { bayesBpm: 64, finalBpm: null, instantBpm: 63, suppressed: true }),
				// Manually locked -> excluded even though finalBpm is set.
				sample(4000, {
					bayesBpm: 100,
					finalBpm: 100,
					instantBpm: 61,
					bpmSource: "snap_manual|manual_tracker_lock|bayes",
				}),
			],
		};
		const s = summarizeReplaySession(session);
		// Only the 2 trusted automatic samples are clean.
		expect(s.cleanPointCount).toBe(2);
		expect(s.cleanAgreementFinal.count).toBe(2);
		// agreementBayes still spans every point (all have bayesBpm).
		expect(s.agreementBayes.count).toBe(4);
	});
});

describe("aggregateComparisons", () => {
	test("pools sessions and counts reference coverage", () => {
		const a = summarizeReplaySession(noReferenceSession());
		const b = summarizeReplaySession(noReferenceSession());
		// Force one session to look like it had a reference window so we can assert
		// the coverage counter without depending on tracker internals.
		b.pairCount = 1;
		b.referenceReplayBayes = { sumAbs: 10, count: 5 };
		b.referenceRecordedBayes = { sumAbs: 15, count: 5 };

		const corpus = aggregateComparisons([a, b]);

		expect(corpus.sessionCount).toBe(2);
		expect(corpus.sessionsWithReference).toBe(1);
		expect(corpus.totalSyncSamples).toBe(a.syncSampleCount + b.syncSampleCount);
		expect(corpus.totalPairs).toBe(1);
		// Pooled agreement count = sum of both sessions' point-level counts.
		expect(corpus.agreementBayes.count).toBe(
			a.agreementBayes.count + b.agreementBayes.count,
		);
		expect(maeOf(corpus.referenceReplayBayes)).toBe(2); // 10/5
		expect(maeOf(corpus.referenceRecordedBayes)).toBe(3); // 15/5
	});

	test("empty corpus is well-defined", () => {
		const corpus = aggregateComparisons([]);
		expect(corpus.sessionCount).toBe(0);
		expect(maeOf(corpus.agreementBayes)).toBeNull();
	});
});
