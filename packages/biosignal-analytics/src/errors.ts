/** Typed errors surfaced across the package and worker boundary. */

export type AnalyticsErrorCode =
	| "invalid_input"
	| "wasm_unavailable"
	| "profile_unavailable"
	| "algorithm_error"
	| "worker_terminated"
	| "aborted"
	/** A required platform capability (e.g. Web Workers) is unavailable. */
	| "unsupported"
	| "internal";

export class AnalyticsError extends Error {
	readonly code: AnalyticsErrorCode;

	constructor(code: AnalyticsErrorCode, message: string) {
		super(message);
		this.name = "AnalyticsError";
		this.code = code;
	}
}

export function toAnalyticsError(error: unknown): AnalyticsError {
	if (error instanceof AnalyticsError) return error;
	const message = error instanceof Error ? error.message : String(error);
	return new AnalyticsError("internal", message);
}
