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
		]) {
			expect(getMetricDefinition(id)).toBeDefined();
		}
	});

	test("headline reserved scores are experimental registered-only", () => {
		for (const id of ["elata.readiness", "elata.focus", "elata.resilience"]) {
			const definition = getMetricDefinition(id);
			expect(definition?.evidenceTier).toBe("experimental");
			expect(definition?.implementedIn).toBe("registered-only");
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
