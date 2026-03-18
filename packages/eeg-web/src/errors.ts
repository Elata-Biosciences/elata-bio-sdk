export type ElataErrorDetails = Record<string, unknown>;

export class ElataError extends Error {
	public readonly code: string;
	public readonly details?: ElataErrorDetails;
	public readonly recoverable?: boolean;
	public readonly cause?: unknown;

	constructor(
		code: string,
		message: string,
		options?: {
			cause?: unknown;
			details?: ElataErrorDetails;
			recoverable?: boolean;
		},
	) {
		super(message);
		this.name = "ElataError";
		this.code = code;
		this.details = options?.details;
		this.recoverable = options?.recoverable;
		this.cause = options?.cause;
	}
}

export function isElataError(value: unknown): value is ElataError {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as any).name === "ElataError" &&
		typeof (value as any).code === "string"
	);
}

export function asElataError(
	value: unknown,
	fallback: { code: string; message: string; details?: ElataErrorDetails } = {
		code: "UNKNOWN",
		message: "Unknown error",
	},
): ElataError {
	if (isElataError(value)) return value;
	if (value instanceof Error) {
		return new ElataError(fallback.code, fallback.message, {
			cause: value,
			details: { ...(fallback.details || {}), originalMessage: value.message },
		});
	}
	return new ElataError(fallback.code, fallback.message, {
		details: { ...(fallback.details || {}), original: value },
	});
}

