/**
 * TS wrapper over the WASM `WasmEegWindowAnalyzer`: one coarse call per
 * window, JSON-parsed and structurally guarded. Every result carries the
 * `configId` and `algorithmVersions` provenance emitted by the crate.
 */

import { AnalyticsError } from "../errors.js";
import {
	createEegWindowAnalyzerRaw,
	initAnalyticsWasm,
	type RawEegWindowAnalyzer,
} from "../runtime.js";

/** Mirror of the crate's `EegWindowConfig` (all fields optional; camelCase). */
export interface EegWindowConfigV1 {
	v?: 1;
	welch?: {
		segmentSeconds?: number;
		overlapRatio?: number;
		window?: "hann";
		detrend?: "constant";
	};
	bands?: Partial<
		Record<
			"delta" | "theta" | "alpha" | "beta" | "gamma",
			readonly [number, number]
		>
	>;
	alphaPeak?: {
		searchHz?: readonly [number, number];
		minProminenceRatio?: number;
		minPeakToSpectrumMaxRatio?: number;
	};
	quality?: {
		clipUv?: number;
		flatlineEpsUv?: number;
		extremeAmplitudeUv?: number;
		lineNoiseHz?: readonly number[];
		lineNoiseHalfWidthHz?: number;
		maxClippedFraction?: number;
		maxFlatlineFraction?: number;
		maxExtremeFraction?: number;
		maxLineNoiseRatio?: number;
	};
	emitPsd?: boolean;
}

export interface EegBandValues {
	delta: number;
	theta: number;
	alpha: number;
	beta: number;
	gamma: number;
}

export interface EegWindowStats {
	mean: number;
	rms: number;
	variance: number;
	std: number;
	ptp: number;
}

export interface EegHjorth {
	activity: number;
	mobility: number;
	complexity: number;
}

export interface EegQualityFlags {
	flatlineFraction: number;
	clippedFraction: number;
	extremeAmplitudeFraction: number;
	lineNoiseRatio: number;
	usable: boolean;
}

/** Mirror of the crate's `EegWindowFeaturesV1` result (camelCase JSON). */
export interface EegWindowFeaturesV1 {
	schema: "elata.eeg-window-features/v1";
	sampleRateHz: number;
	channelCount: number;
	sampleCount: number;
	stats: readonly EegWindowStats[];
	bandPowersAbs: readonly EegBandValues[];
	bandPowersRel: readonly EegBandValues[];
	bandPowersLog: readonly EegBandValues[];
	spectralEntropy: readonly number[];
	dominantFrequencyHz: readonly number[];
	alphaPeakHz: readonly (number | null)[];
	hjorth: readonly EegHjorth[];
	quality: readonly EegQualityFlags[];
	psd?: {
		freqsHz: readonly number[];
		perChannel: readonly (readonly number[])[];
	};
	algorithmVersions: Readonly<Record<string, string>>;
	configId: string;
}

function guardFeatures(value: unknown): EegWindowFeaturesV1 {
	if (value === null || typeof value !== "object") {
		throw new AnalyticsError(
			"algorithm_error",
			"wasm returned a non-object result",
		);
	}
	const candidate = value as Record<string, unknown>;
	if (candidate.schema !== "elata.eeg-window-features/v1") {
		throw new AnalyticsError(
			"algorithm_error",
			`unexpected result schema: ${String(candidate.schema)}`,
		);
	}
	for (const field of [
		"stats",
		"bandPowersAbs",
		"bandPowersRel",
		"bandPowersLog",
		"spectralEntropy",
		"dominantFrequencyHz",
		"alphaPeakHz",
		"hjorth",
		"quality",
	]) {
		if (!Array.isArray(candidate[field])) {
			throw new AnalyticsError(
				"algorithm_error",
				`result field ${field} is not an array`,
			);
		}
	}
	if (typeof candidate.configId !== "string") {
		throw new AnalyticsError("algorithm_error", "result missing configId");
	}
	return value as EegWindowFeaturesV1;
}

export interface EegWindowFeatureExtractorOptions {
	sampleRateHz: number;
	channelCount: number;
	config?: EegWindowConfigV1;
	/**
	 * Optional `initAnalyticsWasm` input (e.g. wasm bytes in node); omitted ->
	 * bundler-resolved default.
	 */
	wasmInput?: Parameters<typeof initAnalyticsWasm>[0];
}

/**
 * Owns one wasm analyzer instance. Construct via `create()` (awaits the WASM
 * runtime singleton); `extract` is synchronous per window; `dispose()` frees
 * the wasm object.
 */
export class EegWindowFeatureExtractor {
	readonly configId: string;
	private raw: RawEegWindowAnalyzer | null;

	private constructor(raw: RawEegWindowAnalyzer) {
		this.raw = raw;
		this.configId = raw.config_id();
	}

	static async create(
		opts: EegWindowFeatureExtractorOptions,
	): Promise<EegWindowFeatureExtractor> {
		if (!(opts.sampleRateHz > 0)) {
			throw new AnalyticsError("invalid_input", "sampleRateHz must be > 0");
		}
		if (!Number.isInteger(opts.channelCount) || opts.channelCount < 1) {
			throw new AnalyticsError(
				"invalid_input",
				"channelCount must be a positive integer",
			);
		}
		try {
			await initAnalyticsWasm(opts.wasmInput);
		} catch (error) {
			throw new AnalyticsError(
				"wasm_unavailable",
				`analytics wasm failed to initialize: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
		let raw: RawEegWindowAnalyzer;
		try {
			raw = createEegWindowAnalyzerRaw(
				opts.sampleRateHz,
				opts.channelCount,
				opts.config === undefined ? undefined : JSON.stringify(opts.config),
			);
		} catch (error) {
			throw new AnalyticsError(
				"invalid_input",
				`invalid EEG window config: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		return new EegWindowFeatureExtractor(raw);
	}

	/**
	 * Analyze one window of interleaved samples
	 * (`samples[sampleIdx][channelIdx]` flattened).
	 */
	extract(window: Float32Array): EegWindowFeaturesV1 {
		if (this.raw === null) {
			throw new AnalyticsError("invalid_input", "extractor is disposed");
		}
		const json = this.raw.analyze_window(window);
		let parsed: unknown;
		try {
			parsed = JSON.parse(json);
		} catch {
			throw new AnalyticsError("algorithm_error", "wasm returned invalid JSON");
		}
		return guardFeatures(parsed);
	}

	updateLayout(sampleRateHz: number, channelCount: number): void {
		if (this.raw === null) {
			throw new AnalyticsError("invalid_input", "extractor is disposed");
		}
		this.raw.update_layout(sampleRateHz, channelCount);
	}

	dispose(): void {
		if (this.raw !== null) {
			this.raw.free();
			this.raw = null;
		}
	}
}

/** band_ratio@1 — ratio of two relative band powers (null when degenerate). */
export function bandRatio(
	numerator: number,
	denominator: number,
): number | null {
	if (
		!Number.isFinite(numerator) ||
		!Number.isFinite(denominator) ||
		denominator <= 0
	) {
		return null;
	}
	return numerator / denominator;
}
