import type { AlgorithmId, EngineKind } from "./types.js";

/** Where an algorithm's implementation lives, and its parity evidence. */
export interface AlgorithmVersionEntry {
	readonly id: AlgorithmId;
	readonly engine: EngineKind | "registered-only";
	/**
	 * Golden-fixture file (relative to packages/biosignal-analytics/fixtures/)
	 * proving parity with the Python oracle. `null` is allowed only with a
	 * rationale; implemented (wasm/ts) algorithms otherwise MUST have one.
	 */
	readonly fixture: string | null;
	readonly fixtureRationale?: string;
}

/**
 * Every algorithm@version referenced by REGISTRY_V1. Bumping an algorithm's
 * behavior means adding a new versioned id here (never mutating in place) and
 * regenerating its fixture.
 */
export const ALGORITHM_VERSIONS = {
	welch_psd: {
		id: "welch_psd@1",
		engine: "wasm",
		fixture: "eeg/welch_psd.json",
	},
	eeg_band_power: {
		id: "eeg_band_power@2",
		engine: "wasm",
		fixture: "eeg/band_powers.json",
	},
	spectral_entropy: {
		id: "spectral_entropy@1",
		engine: "wasm",
		fixture: "eeg/spectral_entropy.json",
	},
	dominant_frequency: {
		id: "dominant_frequency@1",
		engine: "wasm",
		fixture: "eeg/spectral_entropy.json",
	},
	alpha_peak: {
		id: "alpha_peak@2",
		engine: "wasm",
		fixture: "eeg/alpha_peak.json",
	},
	hjorth: { id: "hjorth@1", engine: "wasm", fixture: "eeg/hjorth.json" },
	window_stats: {
		id: "window_stats@1",
		engine: "wasm",
		fixture: "eeg/hjorth.json",
	},
	eeg_quality_flags: {
		id: "eeg_quality_flags@1",
		engine: "wasm",
		fixture: "eeg/quality_flags.json",
	},
	eeg_window_features: {
		id: "eeg_window_features@1",
		engine: "wasm",
		fixture: null,
		fixtureRationale:
			"composite of welch_psd/eeg_band_power/spectral_entropy/dominant_frequency/" +
			"alpha_peak/hjorth/window_stats/eeg_quality_flags — each component carries its own fixture",
	},
	band_ratio: {
		id: "band_ratio@1",
		engine: "ts",
		fixture: null,
		fixtureRationale:
			"a division of two eeg_band_power@2 outputs, which carry their own oracle " +
			"fixture; the ratio itself is unit-tested in eegWindowFeatures.test.ts",
	},
	nn_clean: {
		id: "nn_clean@1",
		engine: "ts",
		fixture: "pulse/hrv_time_domain.json",
	},
	hrv_time_domain: {
		id: "hrv_time_domain@1",
		engine: "ts",
		fixture: "pulse/hrv_time_domain.json",
	},
	summary_stats: {
		id: "summary_stats@1",
		engine: "ts",
		fixture: "stats/robust_summary.json",
	},
	robust_stats: {
		id: "robust_stats@1",
		engine: "ts",
		fixture: "stats/robust_summary.json",
	},
	robust_z: {
		id: "robust_z@1",
		engine: "ts",
		fixture: "stats/robust_summary.json",
	},
	session_coverage: {
		id: "session_coverage@1",
		engine: "session-recorder",
		fixture: null,
		fixtureRationale:
			"aggregation of recorder-persisted session/stream rows; no numeric oracle",
	},
	stream_gap_scan: {
		id: "stream_gap_scan@1",
		engine: "session-recorder",
		fixture: null,
		fixtureRationale:
			"aggregation of recorder-persisted discontinuity rows; no numeric oracle",
	},
	sdk_rppg_metrics: {
		id: "sdk_rppg_metrics@0.14",
		engine: "sdk-persisted",
		fixture: null,
		fixtureRationale:
			"values are persisted rppg-web 0.14 Metrics outputs, never recomputed (locked decision)",
	},
	sdk_ppg_metrics: {
		id: "sdk_ppg_metrics@0.12",
		engine: "sdk-persisted",
		fixture: null,
		fixtureRationale:
			"values are persisted ppg-web 0.12 PpgMetrics outputs, never recomputed (locked decision)",
	},
	trajectory_features: {
		id: "trajectory_features@1",
		engine: "registered-only",
		fixture: null,
	},
	recovery_curve: {
		id: "recovery_curve@1",
		engine: "registered-only",
		fixture: null,
	},
	registered_only: {
		id: "registered_only@0",
		engine: "registered-only",
		fixture: null,
	},
	score_measurement_quality: {
		id: "score_measurement_quality@1",
		engine: "ts",
		fixture: null,
		fixtureRationale:
			"deterministic composite over already-parity-tested inputs; unit-tested in " +
			"insights.scores.test.ts; shared cross-repo score fixtures land with the appstore mirror",
	},
	score_activation: {
		id: "score_activation@1",
		engine: "ts",
		fixture: null,
		fixtureRationale:
			"deterministic composite over robust_z contributors (robust_z carries the fixture); " +
			"unit-tested in insights.scores.test.ts",
	},
	score_recovery: {
		id: "score_recovery@2",
		engine: "ts",
		fixture: null,
		fixtureRationale:
			"deterministic composite over robust_z contributors (robust_z carries the fixture); " +
			"unit-tested in insights.recovery.test.ts, including against the activation_epoch@1 " +
			"golden fixture; shared cross-repo cases in insights/score-fixtures.json",
	},
	/**
	 * Superseded by score_recovery@2, which composes over the activation_epoch@1
	 * analysis instead of four loose caller-supplied numbers. Retained so an
	 * observation already stored under @1 keeps its original meaning; nothing
	 * computes it any more.
	 */
	score_recovery_v1: {
		id: "score_recovery@1",
		engine: "registered-only",
		fixture: null,
		fixtureRationale:
			"retired formula version, retained for stored-observation provenance only",
	},
	score_focus: {
		id: "score_focus@1",
		engine: "ts",
		fixture: null,
		fixtureRationale:
			"deterministic composite over robust_z contributors (robust_z carries the fixture); " +
			"unit-tested in insights.focus.test.ts; shared cross-repo cases in " +
			"insights/score-fixtures.json",
	},
	score_readiness: {
		id: "score_readiness@1",
		engine: "ts",
		fixture: null,
		fixtureRationale:
			"deterministic composite over robust_z contributors against rolling_baseline@1 " +
			"baselines; unit-tested in insights.readiness.test.ts; shared cross-repo cases in " +
			"insights/score-fixtures.json",
	},
	score_resilience: {
		id: "score_resilience@1",
		engine: "ts",
		fixture: null,
		fixtureRationale:
			"deterministic composite over robust_z contributors against rolling_baseline@1 " +
			"baselines; unit-tested in insights.resilience.test.ts; shared cross-repo cases in " +
			"insights/score-fixtures.json",
	},
	rolling_baseline: {
		id: "rolling_baseline@1",
		engine: "ts",
		fixture: null,
		fixtureRationale:
			"median/MAD/percentiles over a trailing window — robust_stats@1 and summary_stats@1 " +
			"carry the numeric oracle; the window, day-count and Hampel gating are unit-tested " +
			"in insights.longitudinal.test.ts",
	},
} as const satisfies Record<string, AlgorithmVersionEntry>;

export type AlgorithmName = keyof typeof ALGORITHM_VERSIONS;

/** All known algorithm@version ids (frozen). */
export const ALGORITHM_IDS: readonly AlgorithmId[] = Object.freeze(
	Object.values(ALGORITHM_VERSIONS).map((entry) => entry.id),
);

export function getAlgorithm(name: AlgorithmName): AlgorithmVersionEntry {
	return ALGORITHM_VERSIONS[name];
}

export function isKnownAlgorithmId(id: string): boolean {
	return (ALGORITHM_IDS as readonly string[]).includes(id);
}
