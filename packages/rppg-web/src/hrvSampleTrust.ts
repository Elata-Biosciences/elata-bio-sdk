/**
 * Should THIS sample's HRV reading be fed into the baseline calibrator?
 *
 * Reported 2026-08-02: "hrv measurement seems off and either way too high or
 * low." Traced as far as this codebase can trace it: `hrv_rmssd` comes
 * straight from `@elata-biosciences/rppg-web` (the SDK's own doc calls it
 * "Experimental"), range-clamped in `rppg.ts` and otherwise passed through
 * unmodified: no bug in the number itself, and nothing here can improve the
 * vendored SDK's estimate.
 *
 * What IS this codebase's to fix: the SDK's `BaselineCalibrator` rejects
 * outlier SAMPLES by BPM distance only (`outlierBpm`), so a frame can pass that
 * gate on a perfectly good beat-rate estimate while its HRV figure, which
 * needs precise beat-to-BEAT timing rather than just an average rate, is
 * garbage. rMSSD is far more sensitive to a single misdetected beat than BPM
 * is, so the SAME quality floor that is fine for gathering BPM (see
 * `qualityOk` in BaselineCapture.tsx, 0.24) is not strict enough to trust
 * that sample's HRV specifically.
 *
 * The fix costs nothing to the BPM path: BPM keeps gathering at its existing
 * floor, and only the HRV VALUE for a marginal-quality sample is withheld
 * (pushed as null) rather than the whole sample being dropped. The
 * calibrator's own trimmed-median still runs over whatever HRV values DO
 * arrive; this only raises the bar for what gets to vote.
 *
 * Honest limit: this is a best-effort mitigation, not a verified fix. There
 * is no ground-truth ECG reference in this codebase to confirm accuracy
 * against, only the (well-founded, but unmeasured here) reasoning above.
 */

/**
 * Higher than the 0.24 floor BPM gathers at. Not derived from a measurement:
 * there is no way to derive it from one without reference HRV data. Chosen
 * as a meaningfully stricter bar (avoids the noisiest third of the accepted-
 * for-BPM range) rather than an arbitrary-looking number close to the BPM
 * floor that would barely change anything.
 */
export const HRV_TRUST_QUALITY_MIN = 0.4;

/** The HRV value to actually push into the calibrator for this sample: the
 *  reading itself if the signal is strong enough to trust it for HRV
 *  specifically, otherwise null (BPM still gathers from this sample). */
export function trustedHrvSample(hrvRmssd: number | null, quality: number): number | null {
  if (hrvRmssd == null) return null;
  return quality >= HRV_TRUST_QUALITY_MIN ? hrvRmssd : null;
}
