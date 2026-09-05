import type { RppgAppSnapshot } from "./rppgAppAdapter";
import { trustedHrvSample } from "./hrvSampleTrust";

export type DisplayConfidence = "low" | "high";

export interface DisplayMetrics {
	/** BPM to render, or `null` when the reading isn't trustworthy enough to show. */
	bpm: number | null;
	/**
	 * HRV (RMSSD) to render, or `null` when either the BPM-oriented publish
	 * gate or the HRV-specific quality gate rejects this sample. See the doc
	 * comment on {@link resolveDisplayMetrics}.
	 */
	hrvRmssd: number | null;
	/** Coarse confidence bucket, for a caption/badge, not a gate by itself (see below). */
	confidence: DisplayConfidence;
	/** Whether this snapshot's vitals are fit to display at all. */
	publishable: boolean;
}

export interface ResolveDisplayMetricsOptions {
	/** `metrics.confidence` at or above this reads as `'high'`. Default 0.35. */
	confidenceThreshold?: number;
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.35;

/**
 * The single decision for "what BPM/HRV should this app show right now."
 *
 * Three independent consumer apps (Peak, Vitality, Neural Chat) each wrote
 * their own version of this decision, and at least two got it wrong the same
 * way: a UI component checked `bpm != null` with no confidence gate, so a
 * stale or low-confidence reading rendered as if it were live and trustworthy
 * (elata-bio-sdk#24, neural-chat-app#10, peak-app#404/#408).
 *
 * The sharper failure, found while fixing neural-chat-app#10: `RppgGatingController`
 * (`rppgGating.ts`) already nulls `publishBpm` the moment a reading stops being
 * trustworthy; that part of the SDK was already correct. The bug was that each
 * app then layered its OWN smoothing (a median/EMA accumulator) on top of the
 * already-gated `publishBpm`, and that accumulator only updated "when there's a
 * fresh sample," so the moment the SDK correctly went to `null`, the app's own
 * smoothing silently kept showing its last-known value, forever, with no expiry.
 * The SDK's gating was right; the app-side re-smoothing defeated it.
 *
 * This function has no state to hold anything in, on purpose: it's a pure
 * snapshot-in, decision-out mapping, so there's no accumulator for an app to
 * accidentally carry forward past the point the SDK says a reading is no
 * longer publishable. Call it fresh on every snapshot instead of writing your
 * own smoothing/holdover layer on `publishBpm`.
 *
 * `confidence` is exposed for a caption ("signal unreliable") or for an app's
 * own internal math that wants to discount rather than hide (e.g. Peak's
 * confidence-weighted averaging); it is deliberately NOT what gates `bpm`/
 * `hrvRmssd` to null. `canPublish`/`publishBpm` already encode the SDK's own,
 * more complete trust decision (face presence, framing, motion, signal
 * quality, see `rppgGating.ts`); re-deriving that from `confidence` alone in
 * each app is exactly the kind of independent re-implementation that caused
 * this bug in the first place.
 *
 * `hrvRmssd` is gated by TWO decisions composed together, not `canPublish`
 * alone. `canPublish` is BPM-oriented; HRV needs a strictly tighter bar,
 * because beat-to-beat timing is far more fragile than an average rate: a
 * sample can clear the BPM quality floor and still carry a garbage HRV
 * figure. `trustedHrvSample` (`hrvSampleTrust.ts`) owns exactly that second,
 * HRV-specific gate. Surfacing HRV off the BPM gate alone would silently
 * reintroduce the class of bug this function exists to prevent, just for a
 * different field.
 */
export function resolveDisplayMetrics(
	snapshot: Pick<RppgAppSnapshot, "canPublish" | "publishBpm" | "metrics">,
	options: ResolveDisplayMetricsOptions = {},
): DisplayMetrics {
	const threshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
	const publishable = snapshot.canPublish && snapshot.publishBpm != null;
	const confidence: DisplayConfidence =
		(snapshot.metrics.confidence ?? 0) >= threshold ? "high" : "low";

	return {
		bpm: publishable ? snapshot.publishBpm : null,
		// Both gates: publishable (BPM-oriented) AND the HRV-specific quality
		// floor. Either one rejecting the sample nulls the value.
		hrvRmssd: publishable
			? trustedHrvSample(snapshot.metrics.hrv_rmssd ?? null, snapshot.metrics.signal_quality)
			: null,
		confidence,
		publishable,
	};
}
