import { z } from "zod";

/** Zod validation for the registry contracts (all inputs are validated). */

export const algorithmIdSchema = z
	.string()
	.regex(/^[a-z][a-z0-9_.-]*@\d+(\.\d+)?$/, "algorithm must be name@version");

export const evidenceTierSchema = z.enum([
	"beta-default",
	"advanced",
	"experimental",
	"rejected",
]);
export const measurementClassSchema = z.enum([
	"measured",
	"derived-deterministic",
	"model-inferred",
	"product-composite",
]);
export const metricDomainSchema = z.enum([
	"session",
	"stream",
	"eeg",
	"pulse",
	"rppg",
	"multimodal",
	"headline",
]);
export const computeProfileSchema = z.enum([
	"live",
	"post-session",
	"idle",
	"on-demand",
]);
export const engineKindSchema = z.enum([
	"wasm",
	"ts",
	"onnx",
	"duckdb",
	"session-recorder",
	"sdk-persisted",
]);

export const qualityGateSchema = z
	.object({
		metricId: z.string().min(1),
		min: z.number().optional(),
		max: z.number().optional(),
	})
	.strict();

export const inputRequirementSchema = z
	.object({
		kind: z.enum(["stream", "metric", "events"]),
		modality: z.enum(["eeg", "ppg", "rppg", "imu", "events"]).optional(),
		metricId: z.string().min(1).optional(),
		minSampleRateHz: z.number().positive().optional(),
		minChannels: z.number().int().positive().optional(),
		optional: z.boolean().optional(),
	})
	.strict();

export const windowPolicySchema = z
	.object({
		minWindowUs: z.number().int().nonnegative(),
		preferredWindowUs: z.number().int().positive().optional(),
		stepUs: z.number().int().positive().optional(),
		alignment: z.enum(["sliding", "session", "event"]),
	})
	.strict();

export const metricDefinitionV1Schema = z
	.object({
		schema: z.literal("elata.metric-definition/v1"),
		id: z.string().regex(/^[a-z][a-z0-9_.]*$/),
		version: z.string().regex(/^\d+\.\d+\.\d+$/),
		displayName: z.string().min(1),
		description: z.string().min(1),
		unit: z.string().min(1).nullable(),
		domain: metricDomainSchema,
		measurementClass: measurementClassSchema,
		evidenceTier: evidenceTierSchema,
		inputs: z.array(inputRequirementSchema).readonly(),
		window: windowPolicySchema,
		channelPolicy: z.enum(["per-channel", "channel-mean", "single"]),
		qualityGates: z.array(qualityGateSchema).readonly(),
		algorithm: algorithmIdSchema,
		model: z
			.object({
				id: z.string().min(1),
				version: z.string().min(1),
				sha256: z.string().regex(/^[0-9a-f]{64}$/),
			})
			.strict()
			.optional(),
		aggregation: z
			.object({
				session: z.enum([
					"mean",
					"median",
					"quality-weighted-mean",
					"last",
					"sum",
					"max",
					"none",
				]),
				daily: z.enum(["mean", "median", "best-session", "none"]),
			})
			.strict(),
		baseline: z
			.object({
				eligible: z.boolean(),
				minSessions: z.number().int().positive().optional(),
				contextBucketing: z.enum(["none", "time-of-day", "app"]).optional(),
			})
			.strict(),
		displayEligibility: z.enum([
			"product",
			"advanced-panel",
			"debug-only",
			"none",
		]),
		computeProfile: computeProfileSchema,
		costClass: z.enum(["trivial", "light", "moderate", "heavy"]),
		implementedIn: z.union([engineKindSchema, z.literal("registered-only")]),
		references: z.array(z.string()).readonly().optional(),
	})
	.strict();

export const provenanceV1Schema = z
	.object({
		schema: z.literal("elata.provenance/v1"),
		engine: engineKindSchema,
		algorithm: algorithmIdSchema,
		configId: z.string().min(1),
		packageVersion: z.string().min(1),
		wasmVersion: z.string().optional(),
		modelSha256: z
			.string()
			.regex(/^[0-9a-f]{64}$/)
			.optional(),
		inputStreamIds: z.array(z.string()).readonly(),
		inputMetricVersions: z.record(z.string(), z.string()).optional(),
		computedAtEpochMs: z.number().int().nonnegative(),
	})
	.strict();

export const exclusionReasonSchema = z.enum([
	"insufficient_window",
	"quality_gate_failed",
	"insufficient_baseline",
	"no_activation_detected",
	"inputs_missing",
	"algorithm_error",
]);

export const metricObservationV1Schema = z
	.object({
		schema: z.literal("elata.metric-observation/v1"),
		observationId: z.string().min(1),
		sessionId: z.string().min(1),
		metricId: z.string().min(1),
		metricVersion: z.string().min(1),
		streamId: z.string().min(1).optional(),
		channel: z.string().min(1).optional(),
		windowStartUs: z.number().int().nonnegative(),
		windowEndUs: z.number().int().nonnegative(),
		value: z.number().finite().nullable(),
		unit: z.string().min(1).nullable(),
		quality: z.number().min(0).max(1),
		coverage: z.number().min(0).max(1),
		confidence: z.number().min(0).max(1).optional(),
		provenance: provenanceV1Schema,
		exclusionReason: exclusionReasonSchema.optional(),
	})
	.strict()
	.refine((obs) => obs.windowEndUs >= obs.windowStartUs, {
		message: "windowEndUs must be >= windowStartUs",
	})
	.refine((obs) => obs.value !== null || obs.exclusionReason !== undefined, {
		message: "withheld observations (value null) must carry an exclusionReason",
	});

export const enrichmentDefinitionV1Schema = z
	.object({
		schema: z.literal("elata.enrichment-definition/v1"),
		id: z.string().regex(/^enrich\.[a-z][a-z0-9_.-]*$/),
		version: z.string().regex(/^\d+\.\d+\.\d+$/),
		inputs: z.array(inputRequirementSchema).readonly(),
		window: windowPolicySchema,
		qualityGates: z.array(qualityGateSchema).readonly(),
		engine: z.discriminatedUnion("kind", [
			z
				.object({
					kind: z.literal("wasm"),
					entry: z.literal("analyze_eeg_window"),
					configId: z.string().min(1),
				})
				.strict(),
			z.object({ kind: z.literal("ts"), fn: z.string().min(1) }).strict(),
			z
				.object({
					kind: z.literal("onnx"),
					modelId: z.string().min(1),
					modelVersion: z.string().min(1),
				})
				.strict(),
			z.object({ kind: z.literal("duckdb"), view: z.string().min(1) }).strict(),
			z
				.object({
					kind: z.literal("sdk-persisted"),
					streamKind: z.string().min(1),
				})
				.strict(),
		]),
		outputs: z
			.array(
				z
					.object({
						metricId: z.string().min(1),
						metricVersion: z.string().min(1),
					})
					.strict(),
			)
			.readonly(),
		computeProfile: computeProfileSchema,
		dependencies: z.array(z.string()).readonly(),
		checkpointEveryWindows: z.number().int().positive().optional(),
	})
	.strict();
