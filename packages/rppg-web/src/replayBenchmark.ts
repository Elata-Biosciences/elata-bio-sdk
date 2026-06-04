import {
	replayBayesSession,
	type ReplayDebugSession,
} from "./rppgReplay";

/**
 * Comparison harness for recorded debug sessions (TradeLock's
 * `ReplayDebugSession` format). Re-runs the SDK's Bayes tracker over a recorded
 * session via {@link replayBayesSession} and measures it against the outputs
 * TradeLock recorded on the *same* samples, giving an apples-to-apples
 * SDK-vs-TradeLock comparison on real data with no cross-repo dependency.
 *
 * Two families of metric:
 *  - **Agreement** (`agreement*`): mean |SDK replay BPM − TradeLock recorded BPM|
 *    over every point. Needs no reference, so it covers every session; it flags
 *    divergence between the two pipelines on identical input.
 *  - **Reference MAE** (`reference*`): mean abs error vs the Muse reference, from
 *    the pair-event windows. Tells you which pipeline is actually *closer* to
 *    ground truth, but only on sessions that recorded reference pairings.
 */

/** Running sum of absolute errors + the count contributing to it. */
export interface AbsErrorAccumulator {
	sumAbs: number;
	count: number;
}

export interface SessionComparison {
	syncSampleCount: number;
	pointCount: number;
	pairCount: number;
	/** Points where TradeLock emitted a trusted, non-manually-locked estimate. */
	cleanPointCount: number;
	/** |SDK replay Bayes − TradeLock recorded Bayes| over all points. */
	agreementBayes: AbsErrorAccumulator;
	/** |SDK replay Bayes − TradeLock recorded final| over all points. */
	agreementFinal: AbsErrorAccumulator;
	/**
	 * |SDK replay Bayes − TradeLock recorded final|, but ONLY over samples
	 * TradeLock trusted (not suppressed) and did not manually lock/snap. This is
	 * the fair head-to-head: it excludes the 70–90% of samples TradeLock held on
	 * low quality and any human-pinned output. Prefer this over `agreement*`.
	 */
	cleanAgreementFinal: AbsErrorAccumulator;
	/** SDK replay Bayes MAE vs reference, pooled over pair windows. */
	referenceReplayBayes: AbsErrorAccumulator;
	/** TradeLock recorded Bayes MAE vs reference, pooled over pair windows. */
	referenceRecordedBayes: AbsErrorAccumulator;
	/** TradeLock recorded final MAE vs reference, pooled over pair windows. */
	referenceRecordedFinal: AbsErrorAccumulator;
}

export interface CorpusComparison {
	sessionCount: number;
	sessionsWithReference: number;
	totalSyncSamples: number;
	totalPairs: number;
	totalCleanPoints: number;
	agreementBayes: AbsErrorAccumulator;
	agreementFinal: AbsErrorAccumulator;
	cleanAgreementFinal: AbsErrorAccumulator;
	referenceReplayBayes: AbsErrorAccumulator;
	referenceRecordedBayes: AbsErrorAccumulator;
	referenceRecordedFinal: AbsErrorAccumulator;
}

function emptyAcc(): AbsErrorAccumulator {
	return { sumAbs: 0, count: 0 };
}

function addAbs(acc: AbsErrorAccumulator, a: number | null, b: number | null): void {
	if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return;
	acc.sumAbs += Math.abs(a - b);
	acc.count += 1;
}

/** Re-pool a window's already-averaged MAE by weighting it back up by its point count. */
function addPooledMae(
	acc: AbsErrorAccumulator,
	mae: number | null,
	points: number,
): void {
	if (mae == null || !Number.isFinite(mae) || points <= 0) return;
	acc.sumAbs += mae * points;
	acc.count += points;
}

function mergeAcc(into: AbsErrorAccumulator, from: AbsErrorAccumulator): void {
	into.sumAbs += from.sumAbs;
	into.count += from.count;
}

/** Mean absolute error from an accumulator, or null when nothing contributed. */
export function maeOf(acc: AbsErrorAccumulator): number | null {
	return acc.count > 0 ? acc.sumAbs / acc.count : null;
}

/** Compare one recorded session: SDK replay vs TradeLock recorded (+ reference). */
export function summarizeReplaySession(
	session: ReplayDebugSession,
	options?: { pairWindowMs?: number },
): SessionComparison {
	const result = replayBayesSession(session, options);

	const agreementBayes = emptyAcc();
	const agreementFinal = emptyAcc();
	const cleanAgreementFinal = emptyAcc();
	let cleanPointCount = 0;
	for (const point of result.points) {
		addAbs(agreementBayes, point.replayBayesBpm, point.recordedBayesBpm);
		addAbs(agreementFinal, point.replayBayesBpm, point.recordedFinalBpm);
		if (point.recordedTrusted && !point.recordedManualLock) {
			cleanPointCount += 1;
			addAbs(cleanAgreementFinal, point.replayBayesBpm, point.recordedFinalBpm);
		}
	}

	const referenceReplayBayes = emptyAcc();
	const referenceRecordedBayes = emptyAcc();
	const referenceRecordedFinal = emptyAcc();
	for (const summary of result.pairSummaries) {
		addPooledMae(referenceReplayBayes, summary.replayBayesMae, summary.points);
		addPooledMae(referenceRecordedBayes, summary.recordedBayesMae, summary.points);
		addPooledMae(referenceRecordedFinal, summary.recordedFinalMae, summary.points);
	}

	return {
		syncSampleCount: session.syncSamples.length,
		pointCount: result.points.length,
		pairCount: result.pairSummaries.length,
		cleanPointCount,
		agreementBayes,
		agreementFinal,
		cleanAgreementFinal,
		referenceReplayBayes,
		referenceRecordedBayes,
		referenceRecordedFinal,
	};
}

/** Pool per-session comparisons into one corpus-level result. */
export function aggregateComparisons(
	sessions: SessionComparison[],
): CorpusComparison {
	const corpus: CorpusComparison = {
		sessionCount: sessions.length,
		sessionsWithReference: 0,
		totalSyncSamples: 0,
		totalPairs: 0,
		totalCleanPoints: 0,
		agreementBayes: emptyAcc(),
		agreementFinal: emptyAcc(),
		cleanAgreementFinal: emptyAcc(),
		referenceReplayBayes: emptyAcc(),
		referenceRecordedBayes: emptyAcc(),
		referenceRecordedFinal: emptyAcc(),
	};
	for (const session of sessions) {
		corpus.totalSyncSamples += session.syncSampleCount;
		corpus.totalPairs += session.pairCount;
		corpus.totalCleanPoints += session.cleanPointCount;
		if (session.pairCount > 0) corpus.sessionsWithReference += 1;
		mergeAcc(corpus.agreementBayes, session.agreementBayes);
		mergeAcc(corpus.agreementFinal, session.agreementFinal);
		mergeAcc(corpus.cleanAgreementFinal, session.cleanAgreementFinal);
		mergeAcc(corpus.referenceReplayBayes, session.referenceReplayBayes);
		mergeAcc(corpus.referenceRecordedBayes, session.referenceRecordedBayes);
		mergeAcc(corpus.referenceRecordedFinal, session.referenceRecordedFinal);
	}
	return corpus;
}
