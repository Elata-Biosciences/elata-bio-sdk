/**
 * Protocol error codes and client error type.
 *
 * Mirrors the shape discipline of `@elata-biosciences/app-metrics`
 * (`HostErrorCode` / `MetricsClientError`) but is a separate vocabulary —
 * the raw-session surface is independent by design.
 */

export type BiosignalErrorCode =
	| "invalid_payload"
	| "protocol_mismatch"
	| "unknown_session"
	| "unknown_stream"
	| "bad_state"
	| "sequence_conflict"
	| "checksum_mismatch"
	| "payload_too_large"
	| "quota_exceeded"
	| "storage_full"
	| "storage_unavailable"
	| "rate_limited"
	| "internal"
	| "scope_denied"
	| "not_supported"
	| "session_invalidated";

/** Errors a client may retry with the same idempotency key. */
export const RETRYABLE_ERROR_CODES: ReadonlySet<BiosignalErrorCode> = new Set([
	"internal",
	"storage_unavailable",
	"rate_limited",
]);

export function isRetryableError(code: BiosignalErrorCode): boolean {
	return RETRYABLE_ERROR_CODES.has(code);
}

/** Client-side-only failure codes (never sent by a host). */
export type BiosignalClientErrorCode =
	| BiosignalErrorCode
	| "handshake_timeout"
	| "disposed"
	| "transport";

export class BiosignalClientError extends Error {
	readonly code: BiosignalClientErrorCode;
	readonly retryable: boolean;

	constructor(code: BiosignalClientErrorCode, message?: string) {
		super(message ?? `biosignal-session error: ${code}`);
		this.name = "BiosignalClientError";
		this.code = code;
		this.retryable =
			code !== "handshake_timeout" &&
			code !== "disposed" &&
			code !== "transport" &&
			isRetryableError(code as BiosignalErrorCode);
	}
}
