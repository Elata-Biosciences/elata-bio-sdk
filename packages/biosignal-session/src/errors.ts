export type SessionErrorCode =
	| "invalid_manifest"
	| "invalid_source"
	| "invalid_stream"
	| "invalid_chunk"
	| "invalid_event"
	| "schema_mismatch"
	| "checksum_mismatch"
	| "sequence_conflict"
	| "session_not_found"
	| "stream_not_found"
	| "invalid_state"
	| "quota_exceeded"
	| "payload_too_large"
	| "scope_denied"
	| "transport"
	| "handshake_timeout"
	| "disposed"
	| "not_supported"
	| "internal";

export class SessionError extends Error {
	constructor(
		public readonly code: SessionErrorCode,
		message: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = "SessionError";
	}
}
