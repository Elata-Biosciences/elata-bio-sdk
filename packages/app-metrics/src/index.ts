/**
 * Default entry point — for sandboxed apps. Re-exports the client API.
 *
 * The appstore host should import from `@elata-biosciences/app-metrics/host`
 * instead, which keeps host-only code (IndexedDB adapter, dispatch) out of the
 * app bundle.
 */

export { createMetricsClient, MetricsClientError } from "./client";
export type {
	MetricsClient,
	MetricsClientOptions,
	RecordInput,
	SaveScoreInput,
	WriteResult,
} from "./client";
export type {
	AppRecord,
	AppScore,
	HostErrorCode,
	QueryFilter,
	ScoreFilter,
	ScoreOrder,
} from "./protocol";
