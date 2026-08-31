import * as fs from "node:fs";
import * as path from "node:path";
import {
	ALGORITHM_IDS,
	ALGORITHM_VERSIONS,
	getMetricDefinition,
	isKnownAlgorithmId,
	listMetrics,
	metricDefinitionV1Schema,
	metricObservationV1Schema,
	REGISTRY_V1,
} from "../registry/index.js";

const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "fixtures");

describe("REGISTRY_V1", () => {
	test("every definition zod-parses", () => {
		for (const definition of REGISTRY_V1) {
			const result = metricDefinitionV1Schema.safeParse(definition);
			if (!result.success) {
				throw new Error(`${definition.id}: ${result.error.message}`);
			}
		}
	});

	test("metric ids are unique", () => {
		const ids = REGISTRY_V1.map((definition) => definition.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("every algorithm reference resolves in ALGORITHM_VERSIONS", () => {
		for (const definition of REGISTRY_V1) {
			expect(isKnownAlgorithmId(definition.algorithm)).toBe(true);
		}
	});

	test("registered-only metrics never claim implementation", () => {
		for (const definition of REGISTRY_V1) {
			if (definition.implementedIn === "registered-only") {
				expect(definition.displayEligibility).toBe("none");
			}
		}
	});

	test("expected guide Appendix C coverage is present", () => {
		for (const id of [
			"session.valid_duration",
			"session.coverage",
			"stream.dropped_samples",
			"stream.discontinuities",
			"eeg.channel_quality",
			"eeg.artifact_coverage",
			"eeg.band_power.alpha.absolute",
			"eeg.band_power.gamma.relative",
			"eeg.alpha_peak_frequency",
			"eeg.spectral_entropy",
			"eeg.dominant_frequency",
			"eeg.hjorth.activity",
			"eeg.ratio.alpha_beta",
			"eeg.ratio.theta_beta",
			"pulse.heart_rate",
			"pulse.mean_nn",
			"pulse.rmssd",
			"pulse.sdnn",
			"pulse.respiration_rate",
			"rppg.signal_quality",
			"rppg.capture_confidence",
			"rppg.fused_bpm",
			"session.activation.peak",
			"session.recovery.time_to_half",
			"elata.measurement_quality",
			"elata.activation",
			"elata.recovery",
			"elata.readiness",
			"elata.focus",
			"elata.resilience",
			"session.recovery.time_to_baseline",
			"session.activation.area_above_baseline",
			"session.task.rt_stability",
			"session.task.lapse_rate",
		]) {
			expect(getMetricDefinition(id)).toBeDefined();
		}
	});

	test("every headline score is implemented, gated on MQ, and never a raw headline", () => {
		// The three reserved slots (readiness/focus/resilience) are implemented
		// now, so the old "reserved" assertion is replaced by the properties
		// that must hold whether or not a score is implemented.
		const headlines = listMetrics({ domain: "headline" });
		expect(headlines.length).toBe(6);
		for (const definition of headlines) {
			expect(definition.measurementClass).toBe("product-composite");
			expect(definition.implementedIn).toBe("ts");
			if (definition.id === "elata.measurement_quality") {
				// MQ is the one score that cannot gate on itself.
				expect(definition.qualityGates).toEqual([]);
				continue;
			}
			expect(definition.qualityGates).toEqual([
				{ metricId: "elata.measurement_quality", min: expect.any(Number) },
			]);
		}
	});

	test("only Measurement Quality is a product headline", () => {
		// Anything unvalidated stays behind the advanced panel; an experimental
		// score reaching displayEligibility "product" is the failure this pins.
		for (const definition of listMetrics({ domain: "headline" })) {
			if (definition.evidenceTier === "beta-default") continue;
			expect(definition.displayEligibility).not.toBe("product");
		}
		expect(getMetricDefinition("elata.measurement_quality")?.displayEligibility).toBe(
			"product",
		);
	});

	test("model-inferred metrics are experimental and never product-displayed", () => {
		for (const definition of REGISTRY_V1) {
			if (definition.measurementClass !== "model-inferred") continue;
			expect(definition.evidenceTier).toBe("experimental");
			expect(definition.displayEligibility).not.toBe("product");
		}
	});

	test("Focus names no theta, beta or band-ratio input", () => {
		const focus = getMetricDefinition("elata.focus");
		expect(focus).toBeDefined();
		for (const requirement of focus?.inputs ?? []) {
			const metricId = requirement.metricId ?? "";
			expect(metricId).not.toContain("theta");
			expect(metricId).not.toContain("beta");
			expect(metricId).not.toContain("ratio.");
		}
	});

	test("every metric a headline score names is itself registered", () => {
		for (const definition of listMetrics({ domain: "headline" })) {
			for (const requirement of definition.inputs) {
				if (requirement.metricId === undefined) continue;
				expect([definition.id, requirement.metricId]).toEqual([
					definition.id,
					getMetricDefinition(requirement.metricId)?.id,
				]);
			}
		}
	});

	test("listMetrics filters by domain, tier, implemented", () => {
		expect(listMetrics({ domain: "headline" }).length).toBeGreaterThanOrEqual(6);
		for (const definition of listMetrics({ tier: "beta-default" })) {
			expect(definition.evidenceTier).toBe("beta-default");
		}
		for (const definition of listMetrics({ implemented: false })) {
			expect(definition.implementedIn).toBe("registered-only");
		}
		expect(listMetrics({ implemented: true }).length).toBeGreaterThan(0);
		expect(listMetrics().length).toBe(REGISTRY_V1.length);
	});
});

describe("ALGORITHM_VERSIONS", () => {
	test("algorithm ids are unique and well-formed", () => {
		expect(new Set(ALGORITHM_IDS).size).toBe(ALGORITHM_IDS.length);
		for (const id of ALGORITHM_IDS) {
			expect(id).toMatch(/^[a-z][a-z0-9_.-]*@\d+(\.\d+)?$/);
		}
	});

	test("every implemented (wasm/ts) algorithm has a fixture or a rationale", () => {
		for (const [name, entry] of Object.entries(ALGORITHM_VERSIONS)) {
			if (entry.engine !== "wasm" && entry.engine !== "ts") continue;
			if (entry.fixture === null) {
				expect(entry.fixtureRationale).toBeDefined();
				continue;
			}
			const fixturePath = path.join(FIXTURES_DIR, entry.fixture);
			expect(fs.existsSync(fixturePath)).toBe(true);
			const parsed = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
				algorithm: string;
			};
			expect(parsed.algorithm).toContain(name);
		}
	});

	test("manifest lists every committed fixture file", () => {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(FIXTURES_DIR, "manifest.json"), "utf8"),
		) as { files: string[] };
		for (const file of manifest.files) {
			expect(fs.existsSync(path.join(FIXTURES_DIR, file))).toBe(true);
		}
	});
});

describe("metricObservationV1Schema", () => {
	const validObservation = {
		schema: "elata.metric-observation/v1",
		observationId: "obs-1",
		sessionId: "session-1",
		metricId: "eeg.spectral_entropy",
		metricVersion: "1.0.0",
		windowStartUs: 0,
		windowEndUs: 30_000_000,
		value: 0.5,
		unit: "ratio",
		quality: 1,
		coverage: 1,
		provenance: {
			schema: "elata.provenance/v1",
			engine: "wasm",
			algorithm: "spectral_entropy@1",
			configId: "abc",
			packageVersion: "0.1.0",
			inputStreamIds: [],
			computedAtEpochMs: 1,
		},
	};

	test("accepts a valid observation", () => {
		expect(metricObservationV1Schema.safeParse(validObservation).success).toBe(true);
	});

	test("rejects withheld observations without a reason", () => {
		expect(
			metricObservationV1Schema.safeParse({ ...validObservation, value: null }).success,
		).toBe(false);
		expect(
			metricObservationV1Schema.safeParse({
				...validObservation,
				value: null,
				exclusionReason: "insufficient_window",
			}).success,
		).toBe(true);
	});

	test("rejects inverted windows", () => {
		expect(
			metricObservationV1Schema.safeParse({
				...validObservation,
				windowStartUs: 10,
				windowEndUs: 5,
			}).success,
		).toBe(false);
	});
});
