import {
	createPhysiologyInterpreter,
	normalizePhysiologyFeatures,
} from "../physiologyFeatures";

test("normalizes measurements without assigning a state", () => {
	const features = normalizePhysiologyFeatures({
		timestampMs: 1000,
		bpm: 92,
		bpmSlopePerMin: 12,
		rmssdMs: 30,
		respirationBpm: 20,
		baseline: { bpm: 70, rmssdMs: 50, respirationBpm: 14 },
		signalQuality: 0.9,
		captureConfidence: 0.8,
	});

	expect(features.schema).toBe("elata.rppg.physiology-features/v1");
	expect(features.values.hrDeltaBpm).toBe(22);
	expect(features.values.hrvDeltaNorm).toBe(-0.4);
	expect(features.reliability).toBeGreaterThan(0.7);
	expect(features).not.toHaveProperty("state");
});

test("maps reliable baseline-relative features to a generic state", () => {
	const features = normalizePhysiologyFeatures({
		timestampMs: 1000,
		bpm: 110,
		bpmSlopePerMin: 30,
		rmssdMs: 15,
		respirationBpm: 24,
		baseline: { bpm: 70, rmssdMs: 50, respirationBpm: 14 },
		signalQuality: 1,
		captureConfidence: 1,
	});
	const result = createPhysiologyInterpreter().interpret(features);

	expect(result.state).toBe("activated");
	expect(result.activationScore).toBeGreaterThanOrEqual(0.55);
	expect(result).not.toHaveProperty("gameState");
});

test("distinguishes missing inputs from unreliable capture", () => {
	const interpreter = createPhysiologyInterpreter();
	const missing = normalizePhysiologyFeatures({
		timestampMs: 0,
		signalQuality: 1,
		captureConfidence: 1,
	});
	const unreliable = normalizePhysiologyFeatures({
		timestampMs: 1,
		bpm: 72,
		baseline: { bpm: 70 },
		signalQuality: 0.1,
		captureConfidence: 0.1,
	});

	expect(interpreter.interpret(missing).state).toBe("indeterminate");
	expect(interpreter.interpret(unreliable).state).toBe("unreliable");
});

test("uses explicit prior activation only to identify recovery", () => {
	const features = normalizePhysiologyFeatures({
		timestampMs: 2000,
		bpm: 72,
		baseline: { bpm: 70 },
		signalQuality: 1,
		captureConfidence: 1,
	});
	const result = createPhysiologyInterpreter().interpret(features, {
		previousActivationScore: 0.8,
	});

	expect(result.state).toBe("recovering");
	expect(result.recoveryScore).toBeGreaterThanOrEqual(0.28);
});

test("rejects malformed interpreter thresholds", () => {
	expect(() =>
		createPhysiologyInterpreter({
			schema: "elata.rppg.physiology-interpreter-config/v1",
			id: "invalid",
			minReliability: 2,
			activationThreshold: 0.5,
			recoveryThreshold: 0.3,
		}),
	).toThrow("Invalid physiology interpreter configuration");
});
