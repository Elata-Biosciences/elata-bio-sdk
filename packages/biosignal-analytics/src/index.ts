/**
 * @elata-biosciences/biosignal-analytics — local biosignal analytics:
 * versioned metric registry, WASM EEG window features, HRV/statistics, and
 * headline-score formulas. Subpath exports: ./worker ./registry ./insights
 * ./testing ./wasm/*.
 */

export { PACKAGE_VERSION } from "./version.js";
export { AnalyticsError, toAnalyticsError } from "./errors.js";
export type { AnalyticsErrorCode } from "./errors.js";
export {
	createEegWindowAnalyzerRaw,
	initAnalyticsWasm,
	initAnalyticsWasmSync,
	isAnalyticsWasmInitStarted,
} from "./runtime.js";
export type { RawEegWindowAnalyzer } from "./runtime.js";

export * from "./registry/index.js";
export * from "./statistics/index.js";
export * from "./pulse/index.js";
export * from "./eeg/index.js";
export * from "./insights/index.js";

export { createAnalyticsWorkerClient } from "./worker/client.js";
export { launchAnalyticsWorker } from "./worker/analyticsWorkerLauncher.js";
export type { LaunchAnalyticsWorkerOptions } from "./worker/analyticsWorkerLauncher.js";
export type {
	AnalyticsWorkerClient,
	AnalyticsWorkerClientOptions,
} from "./worker/client.js";
export {
	ANALYTICS_WORKER_PROTOCOL_VERSION,
	isAnalyticsWorkerRequest,
	isAnalyticsWorkerResponse,
} from "./worker/protocol.js";
export type {
	AnalyticsPortLike,
	AnalyticsWorkerOp,
	AnalyticsWorkerRequest,
	AnalyticsWorkerResponse,
	EegAnalyzePayload,
	PulseHrvPayload,
} from "./worker/protocol.js";
