import { applyNoReferenceDisplayGuard } from "../displayGuard";

describe("applyNoReferenceDisplayGuard", () => {
	test("passes the candidate through untouched when a reference lock exists", () => {
		const decision = applyNoReferenceDisplayGuard({
			hasReferenceLock: true,
			candidateBpm: 130,
			smoothedBpm: 65,
		});
		expect(decision.applied).toBe(false);
		expect(decision.reason).toBe("none");
		expect(decision.bpm).toBe(130);
	});

	test("lets a corroborated octave jump through and snaps to the cluster median", () => {
		// Display lags at the ~55 sub-harmonic; ACF + spectral both agree near the
		// true ~100-110 octave, so the jump is corroborated rather than reverted.
		const decision = applyNoReferenceDisplayGuard({
			hasReferenceLock: false,
			candidateBpm: 105,
			smoothedBpm: 55,
			acfBpm: 110,
			spectralBpm: 100,
			resolutionConfidence: 0.3,
			estimatorSpread: 28,
		});
		expect(decision.reason).toBe("cluster_corroborated_jump");
		expect(decision.applied).toBe(true);
		expect(decision.bpm).toBe(110); // median of [100, 110]
	});

	test("reverts an unsupported large jump to the stable fallback", () => {
		const decision = applyNoReferenceDisplayGuard({
			hasReferenceLock: false,
			candidateBpm: 100,
			smoothedBpm: 60,
			instantBpm: 70,
			acfBpm: 65,
			spectralBpm: 68,
			resolutionConfidence: 0.2,
			trackerConfidence: 0,
			estimatorSpread: 30,
		});
		expect(decision.reason).toBe("unsupported_large_jump");
		expect(decision.applied).toBe(true);
		expect(decision.bpm).toBe(60);
	});

	test("pulls a high harmonic spike back toward the supported stable value", () => {
		const decision = applyNoReferenceDisplayGuard({
			hasReferenceLock: false,
			candidateBpm: 130,
			smoothedBpm: 65,
			instantBpm: 64,
			acfBpm: 130,
			spectralBpm: 66,
			estimatorSpread: 34,
		});
		expect(decision.reason).toBe("high_harmonic_spike");
		expect(decision.applied).toBe(true);
		expect(decision.bpm).toBe(65);
	});

	test("trusts a high-confidence tracker that agrees with the candidate", () => {
		const decision = applyNoReferenceDisplayGuard({
			hasReferenceLock: false,
			candidateBpm: 102,
			smoothedBpm: 70,
			trackerBpm: 100,
			trackerConfidence: 0.8,
		});
		expect(decision.applied).toBe(false);
		expect(decision.reason).toBe("none");
		expect(decision.bpm).toBe(102);
	});
});
